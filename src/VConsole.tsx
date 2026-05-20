import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  NativeModules,
  PanResponder,
  Platform,
  Pressable,
  Switch,
  TextInput,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type FlatListProps,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {
  clearLogEntries,
  getLogEntries,
  installConsoleProxy,
  subscribeLogEntries,
  uninstallConsoleProxy,
} from './core/consoleProxy';
import {
  clearNetworkEntries,
  getNetworkEntries,
  installXhrProxy,
  subscribeNetworkEntries,
  uninstallXhrProxy,
} from './core/xhrProxy';
import {
  buildNativeNetworkConfig,
  createEmptyDnsRule,
  createEmptyHeaderRule,
  type NativeNetworkConfig,
  type VConsoleCustomDNSConfig,
  type VConsoleCustomHeadersConfig,
  type VConsoleDNSRule,
  type VConsoleHeaderRule,
  type VConsoleNetworkConfig,
} from './networkConfig';
import type {
  AppInfo,
  LogEntry,
  LogFilterTab,
  NetworkEntry,
  SystemInfo,
  VConsoleTab,
} from './types';

const BUTTON_WIDTH = 88;
const BUTTON_HEIGHT = 36;
const PANEL_HEIGHT_RATIO = 7 / 9;
const PANEL_ANIMATION_DURATION_MS = 220;
const PANEL_MASK_MAX_OPACITY = 0.25;
const EMPTY_EXCLUDE: VConsoleExclude = {};
const LOG_SUB_TABS: LogFilterTab[] = ['All', 'log', 'info', 'warn', 'error'];
const ROOT_TABS: VConsoleTab[] = ['Log', 'Network', 'System', 'App', 'Setting'];
const NETWORK_DURATION_WARN_THRESHOLD_MS = 1000;
const NETWORK_DURATION_SEVERE_THRESHOLD_MS = 3000;
const AUTO_SCROLL_BOTTOM_THRESHOLD = 24;
const CUSTOM_DNS_REQUEST_ICON = require('./assets/images/vconsole-custom-request.png');

const LOG_THEME = {
  log: { backgroundColor: '#FFFFFF', color: '#111111' },
  info: { backgroundColor: '#FFFFFF', color: '#246BFD' },
  warn: { backgroundColor: '#FFF8E6', color: '#A65A00' },
  error: { backgroundColor: '#FFECEC', color: '#9C1C1C' },
} as const;

type ExpandedMap = Record<string, boolean>;

type NativeModuleShape = {
  getSystemInfo?: () => Promise<SystemInfo>;
  getAppInfo?: () => Promise<AppInfo>;
  setNetworkConfig?: (config: NativeNetworkConfig) => void;
};

export type VConsoleProps = {
  enable?: boolean;
  exclude?: VConsoleExclude;
  autoFollow?: boolean;
  network?: VConsoleNetworkConfig;
  style?: VConsoleFloatingButtonStyle;
};

type VConsoleExclude = {
  domains?: string[];
  ip?: boolean;
};

export type VConsoleFloatingButtonStyle = {
  width?: number;
  height?: number;
  background?: string;
  color?: string;
  fontSize?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createInitialDnsRules(
  config?: VConsoleCustomDNSConfig
): VConsoleDNSRule[] {
  return config?.rules?.length ? config.rules : [createEmptyDnsRule()];
}

function createInitialHeaderRules(
  config?: VConsoleCustomHeadersConfig
): VConsoleHeaderRule[] {
  return config?.headers?.length ? config.headers : [createEmptyHeaderRule()];
}

function formatMemorySize(bytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return '-';
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(2)} MB`;
}

function getPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function isNearBottom(event: NativeSyntheticEvent<NativeScrollEvent>): boolean {
  const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
  const remaining =
    contentSize.height - (contentOffset.y + layoutMeasurement.height);
  return remaining <= AUTO_SCROLL_BOTTOM_THRESHOLD;
}

function getDisplayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function copyToClipboard(value: string) {
  Clipboard.setString(value);
}

function copyToClipboardWithFeedback(value: string) {
  copyToClipboard(value);
  if (Platform.OS === 'android') {
    ToastAndroid.show('Copied', ToastAndroid.SHORT);
  }
}

function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--.---';
  }
  const YY = String(date.getFullYear()).slice(-2);
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${YY}/${MM}/${DD} ${hh}:${mm}:${ss}.${ms}`;
}

function prettyText(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isNetworkErrorEntry(item: NetworkEntry): boolean {
  return item.isError === true;
}

function hasVisibleNetworkValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

function getNetworkItemBackgroundColor(item: NetworkEntry): string | undefined {
  if (isNetworkErrorEntry(item)) {
    return LOG_THEME.error.backgroundColor;
  }

  if (typeof item.durationMs !== 'number') {
    return undefined;
  }

  if (item.durationMs >= NETWORK_DURATION_SEVERE_THRESHOLD_MS) {
    return LOG_THEME.error.backgroundColor;
  }

  if (item.durationMs >= NETWORK_DURATION_WARN_THRESHOLD_MS) {
    return LOG_THEME.warn.backgroundColor;
  }

  return undefined;
}

function buildNetworkCopyText(item: NetworkEntry): string {
  const status = item.status ?? '-';
  const duration =
    typeof item.durationMs === 'number' ? `${item.durationMs}ms` : '-';
  const isError = isNetworkErrorEntry(item);

  const segments = [
    `${item.method} ${item.url}`,
    `status ${status} duration ${duration}`,
    `request headers\n${prettyText(item.requestHeaders)}`,
    `request body\n${prettyText(item.requestBody)}`,
  ];

  if (isError) {
    segments.push(
      `error reason\n${item.errorReason ?? 'Network request failed'}`
    );
    if (hasVisibleNetworkValue(item.responseHeaders)) {
      segments.push(`response headers\n${prettyText(item.responseHeaders)}`);
    }
    if (hasVisibleNetworkValue(item.responseData)) {
      segments.push(`response data\n${prettyText(item.responseData)}`);
    }
  } else {
    segments.push(`response headers\n${prettyText(item.responseHeaders)}`);
    segments.push(`response data\n${prettyText(item.responseData)}`);
  }

  return segments.join('\n');
}

const FORBIDDEN_RETRY_HEADERS = new Set([
  'host',
  'content-length',
  'accept-encoding',
  'connection',
  'origin',
  'referer',
]);

function normalizeRetryUrl(rawUrl: string): string {
  if (!rawUrl) {
    return '';
  }
  if (/^\/\//.test(rawUrl)) {
    return `https:${rawUrl}`;
  }
  return rawUrl;
}

function buildRetryHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  const nextHeaders: Record<string, string> = {};
  if (!headers) {
    return nextHeaders;
  }

  Object.entries(headers).forEach(([key, value]) => {
    if (!FORBIDDEN_RETRY_HEADERS.has(key.toLowerCase())) {
      nextHeaders[key] = value;
    }
  });
  return nextHeaders;
}

function buildRetryBody(payload: unknown, method: string): unknown | undefined {
  if (method === 'GET' || method === 'HEAD' || payload == null) {
    return undefined;
  }
  if (typeof payload === 'string') {
    return payload;
  }
  if (typeof payload === 'number' || typeof payload === 'boolean') {
    return String(payload);
  }
  if (typeof FormData !== 'undefined' && payload instanceof FormData) {
    return payload;
  }
  if (
    typeof URLSearchParams !== 'undefined' &&
    payload instanceof URLSearchParams
  ) {
    return payload;
  }
  if (typeof Blob !== 'undefined' && payload instanceof Blob) {
    return payload;
  }
  if (typeof ArrayBuffer !== 'undefined' && payload instanceof ArrayBuffer) {
    return payload;
  }
  if (ArrayBuffer.isView(payload)) {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

type ObjectTreeProps = {
  value: unknown;
  nodeKey: string;
  expandedMap: ExpandedMap;
  onToggle: (key: string) => void;
};

function ObjectTree({
  value,
  nodeKey,
  expandedMap,
  onToggle,
}: ObjectTreeProps) {
  if (value === null || value === undefined) {
    return <Text style={styles.valuePrimitive}>{String(value)}</Text>;
  }

  const valueType = typeof value;
  if (valueType !== 'object') {
    const displayValue = getDisplayValue(value);
    if (Platform.OS === 'android') {
      return (
        <Pressable
          onLongPress={() => copyToClipboardWithFeedback(displayValue)}
          delayLongPress={250}
          android_ripple={{ color: '#D0D0D0' }}
        >
          <Text style={styles.valuePrimitive}>{displayValue}</Text>
        </Pressable>
      );
    }
    return (
      <Text style={styles.valuePrimitive} selectable={true}>
        {displayValue}
      </Text>
    );
  }

  const isArray = Array.isArray(value);
  const entries = Object.entries(value as Record<string, unknown>);
  const opened = !!expandedMap[nodeKey];

  return (
    <View style={styles.treeNode}>
      <TouchableOpacity
        hitSlop={8}
        activeOpacity={0.68}
        onPress={() => onToggle(nodeKey)}
        style={styles.treeHeader}
      >
        <Text style={styles.arrow}>{opened ? '▼' : '▶'}</Text>
        <Text style={styles.treeLabel}>
          {isArray ? `Array(${entries.length})` : `Object(${entries.length})`}
        </Text>
      </TouchableOpacity>
      {opened ? (
        <View style={styles.treeChildren}>
          {entries.map(([key, item]) => (
            <View key={`${nodeKey}.${key}`} style={styles.treeChildRow}>
              <Text style={styles.treeKey}>{key}: </Text>
              <ObjectTree
                value={item}
                nodeKey={`${nodeKey}.${key}`}
                expandedMap={expandedMap}
                onToggle={onToggle}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function retryNetworkRequest(item: NetworkEntry) {
  const method = (item.method || 'GET').toUpperCase();
  const url = normalizeRetryUrl(item.url);
  if (!url) {
    console.error('[vConsole] Retry failed: empty request URL');
    return;
  }

  const headers = buildRetryHeaders(item.requestHeaders);
  const body = buildRetryBody(item.requestBody, method);
  const hasContentType = Object.keys(headers).some(
    (key) => key.toLowerCase() === 'content-type'
  );

  if (
    body &&
    typeof body === 'string' &&
    typeof item.requestBody === 'object' &&
    item.requestBody !== null &&
    !hasContentType
  ) {
    headers['Content-Type'] = 'application/json';
  }

  fetch(url, {
    method,
    headers,
    body: body as never,
  }).catch((error: unknown) => {
    console.error('[vConsole] Retry request failed', error);
  });
}

const LogListItem = memo(function LogListItem({ item }: { item: LogEntry }) {
  const [expandedMap, setExpandedMap] = useState<ExpandedMap>({});
  const levelTheme = LOG_THEME[item.level];

  const onToggleNode = useCallback((key: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  return (
    <View
      style={[styles.listItem, { backgroundColor: levelTheme.backgroundColor }]}
    >
      <View style={styles.listItemMain}>
        <Text style={[styles.logLevelText, { color: levelTheme.color }]}>
          [{item.level.toUpperCase()}]
          <Text style={styles.logTimeText}>
            {' '}
            {formatLogTime(item.timestamp)}
          </Text>
        </Text>
        <View style={styles.logPayload}>
          {item.args.map((arg, index) => (
            <ObjectTree
              key={`${item.id}.arg.${index}`}
              value={arg}
              nodeKey={`${item.id}.arg.${index}`}
              expandedMap={expandedMap}
              onToggle={onToggleNode}
            />
          ))}
        </View>
      </View>
      <Pressable
        style={styles.copyButton}
        onPress={() => copyToClipboardWithFeedback(item.text)}
      >
        <Text style={styles.copyButtonText}>Copy</Text>
      </Pressable>
    </View>
  );
});

const NetworkListItem = function NetworkListItem({
  item,
}: {
  item: NetworkEntry;
}) {
  const [expandedMap, setExpandedMap] = useState<ExpandedMap>({});
  const isError = isNetworkErrorEntry(item);
  const backgroundColor = getNetworkItemBackgroundColor(item);
  const startedTime = formatLogTime(item.startedAt);
  const hasErrorResponseHeaders = hasVisibleNetworkValue(item.responseHeaders);
  const hasErrorResponseData = hasVisibleNetworkValue(item.responseData);

  const onToggleNode = useCallback((key: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  return (
    <View
      style={[styles.listItem, backgroundColor ? { backgroundColor } : null]}
    >
      <View style={styles.listItemMain}>
        <View style={styles.networkTitleRow}>
          {item.usedCustomDns ? (
            <Image
              source={CUSTOM_DNS_REQUEST_ICON}
              style={styles.networkCustomDnsIcon}
            />
          ) : null}
          <Text style={styles.networkTitle}>
            {item.method} {item.url}
          </Text>
        </View>
        <Text style={styles.networkLabel}>
          Time: {startedTime}
          {'   '}
          Duration:{' '}
          {typeof item.durationMs === 'number' ? `${item.durationMs}ms` : '-'}
        </Text>
        <Text style={styles.networkLabel}>Status: {item.status ?? '-'}</Text>
        <View style={styles.networkBlock}>
          <Text style={styles.networkLabel}>Request Headers</Text>
          <ObjectTree
            value={item.requestHeaders}
            nodeKey={`${item.id}.requestHeaders`}
            expandedMap={expandedMap}
            onToggle={onToggleNode}
          />
        </View>
        <View style={styles.networkBlock}>
          <Text style={styles.networkLabel}>Request Payload</Text>
          <ObjectTree
            value={item.requestBody ?? ''}
            nodeKey={`${item.id}.requestBody`}
            expandedMap={expandedMap}
            onToggle={onToggleNode}
          />
        </View>
        {isError ? (
          <View style={styles.networkBlock}>
            <Text style={[styles.networkLabel, styles.networkErrorLabel]}>
              Error Reason
            </Text>
            <Text style={styles.networkErrorText}>
              {item.errorReason ?? 'Network request failed'}
            </Text>
            {hasErrorResponseHeaders ? (
              <View style={styles.networkBlock}>
                <Text style={styles.networkLabel}>Response Headers</Text>
                <ObjectTree
                  value={item.responseHeaders}
                  nodeKey={`${item.id}.responseHeaders`}
                  expandedMap={expandedMap}
                  onToggle={onToggleNode}
                />
              </View>
            ) : null}
            {hasErrorResponseData ? (
              <View style={styles.networkBlock}>
                <Text style={styles.networkLabel}>Response Data</Text>
                <ScrollView horizontal={true}>
                  <ObjectTree
                    value={item.responseData}
                    nodeKey={`${item.id}.responseData`}
                    expandedMap={expandedMap}
                    onToggle={onToggleNode}
                  />
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.networkBlock}>
              <Text style={styles.networkLabel}>Response Headers</Text>
              <ObjectTree
                value={item.responseHeaders}
                nodeKey={`${item.id}.responseHeaders`}
                expandedMap={expandedMap}
                onToggle={onToggleNode}
              />
            </View>
            <View style={styles.networkBlock}>
              <Text style={styles.networkLabel}>Response Data</Text>
              <ScrollView horizontal={true}>
                <ObjectTree
                  value={item.responseData ?? ''}
                  nodeKey={`${item.id}.responseData`}
                  expandedMap={expandedMap}
                  onToggle={onToggleNode}
                />
              </ScrollView>
            </View>
          </>
        )}
      </View>
      <Pressable
        style={styles.copyButton}
        onPress={() => copyToClipboardWithFeedback(buildNetworkCopyText(item))}
      >
        <Text style={styles.copyButtonText}>Copy</Text>
      </Pressable>
      <Pressable
        style={styles.retryButton}
        onPress={() => retryNetworkRequest(item)}
      >
        <Text style={styles.retryButtonText}>Retry</Text>
      </Pressable>
    </View>
  );
};

function ListSeparator() {
  return <View style={styles.separator} />;
}

function useFlatListRefs() {
  const allRef = useRef<FlatList<LogEntry>>(null);
  const logRef = useRef<FlatList<LogEntry>>(null);
  const infoRef = useRef<FlatList<LogEntry>>(null);
  const warnRef = useRef<FlatList<LogEntry>>(null);
  const errorRef = useRef<FlatList<LogEntry>>(null);

  return useMemo(
    () => ({
      All: allRef,
      log: logRef,
      info: infoRef,
      warn: warnRef,
      error: errorRef,
    }),
    [allRef, errorRef, infoRef, logRef, warnRef]
  );
}

function Container(props: VConsoleProps) {
  const { exclude = EMPTY_EXCLUDE, autoFollow, network, style } = props;
  const autoFollowEnabled = autoFollow === true;
  const nativeModule = NativeModules.Vconsole as NativeModuleShape | undefined;
  const { width, height } = Dimensions.get('window');
  const floatingButtonWidth = getPositiveNumber(style?.width, BUTTON_WIDTH);
  const floatingButtonHeight = getPositiveNumber(style?.height, BUTTON_HEIGHT);

  const topInset = Platform.select({
    ios: 44,
    android: (StatusBar.currentHeight ?? 0) + 8,
    default: 24,
  });
  const bottomInset = Platform.select({
    ios: 34,
    android: 56,
    default: 24,
  });

  const minX = 0;
  const maxX = width - floatingButtonWidth;
  const minY = topInset;
  const maxY = height - bottomInset - floatingButtonHeight;

  const initialY = clamp(
    height - bottomInset - floatingButtonHeight - 12,
    minY,
    maxY
  );

  const dragPosition = useRef(
    new Animated.ValueXY({ x: 12, y: initialY })
  ).current;
  const dragStartPoint = useRef({ x: 12, y: initialY });
  const panelContentTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [panelVisible, setPanelVisible] = useState(false);
  const [panelContentReady, setPanelContentReady] = useState(false);
  const [activeTab, setActiveTab] = useState<VConsoleTab>('Log');
  const [logSubTab, setLogSubTab] = useState<LogFilterTab>('All');
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [networkEntries, setNetworkEntries] = useState<NetworkEntry[]>([]);
  const [logFilterInput, setLogFilterInput] = useState('');
  const [networkFilterInput, setNetworkFilterInput] = useState('');
  const [debouncedLogFilter, setDebouncedLogFilter] = useState('');
  const [debouncedNetworkFilter, setDebouncedNetworkFilter] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [dnsEnabled, setDnsEnabled] = useState(
    () => network?.customDNS?.enabled === true
  );
  const [headerEnabled, setHeaderEnabled] = useState(
    () => network?.customHeaders?.enabled === true
  );
  const [dnsRules, setDnsRules] = useState<VConsoleDNSRule[]>(() =>
    createInitialDnsRules(network?.customDNS)
  );
  const [headerRules, setHeaderRules] = useState<VConsoleHeaderRule[]>(() =>
    createInitialHeaderRules(network?.customHeaders)
  );
  const [settingInputFocused, setSettingInputFocused] = useState(false);

  const panelHeight = Math.floor(height * PANEL_HEIGHT_RATIO);
  const panelTranslateY = useRef(new Animated.Value(panelHeight)).current;
  const maskOpacity = useRef(new Animated.Value(0)).current;
  const logListRefs = useFlatListRefs();
  const networkListRef = useRef<FlatList<NetworkEntry>>(null);
  const logAutoFollowRef = useRef<Record<LogFilterTab, boolean>>({
    All: autoFollowEnabled,
    log: autoFollowEnabled,
    info: autoFollowEnabled,
    warn: autoFollowEnabled,
    error: autoFollowEnabled,
  });
  const networkAutoFollowRef = useRef(autoFollowEnabled);
  const [logAutoFollowState, setLogAutoFollowState] = useState<
    Record<LogFilterTab, boolean>
  >({
    All: autoFollowEnabled,
    log: autoFollowEnabled,
    info: autoFollowEnabled,
    warn: autoFollowEnabled,
    error: autoFollowEnabled,
  });
  const [networkAutoFollowState, setNetworkAutoFollowState] =
    useState(autoFollowEnabled);
  const logGestureDraggingRef = useRef<Record<LogFilterTab, boolean>>({
    All: false,
    log: false,
    info: false,
    warn: false,
    error: false,
  });
  const networkGestureDraggingRef = useRef(false);
  const didInitialLogScrollRef = useRef(false);
  const didInitialNetworkScrollRef = useRef(false);
  const normalizedExcludeDomains = useMemo(
    () =>
      (exclude.domains ?? [])
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    [exclude.domains]
  );
  const shouldExcludeIp = exclude.ip === true;
  const panelKeyboardOffset = settingInputFocused ? 0 : keyboardHeight;
  const effectiveNetwork = useMemo<VConsoleNetworkConfig>(
    () => ({
      customDNS: {
        enabled: dnsEnabled,
        rules: dnsRules,
      },
      customHeaders: {
        enabled: headerEnabled,
        headers: headerRules,
      },
      forwardProxy: network?.forwardProxy,
    }),
    [dnsEnabled, dnsRules, headerEnabled, headerRules, network?.forwardProxy]
  );
  const nativeNetworkConfig = useMemo(
    () => buildNativeNetworkConfig(effectiveNetwork),
    [effectiveNetwork]
  );

  const setLogAutoFollow = useCallback(
    (tab: LogFilterTab, enabled: boolean) => {
      const nextEnabled = autoFollowEnabled && enabled;
      logAutoFollowRef.current[tab] = nextEnabled;
      setLogAutoFollowState((prev) => {
        if (prev[tab] === nextEnabled) {
          return prev;
        }
        return { ...prev, [tab]: nextEnabled };
      });
    },
    [autoFollowEnabled]
  );

  const setNetworkAutoFollow = useCallback(
    (enabled: boolean) => {
      const nextEnabled = autoFollowEnabled && enabled;
      networkAutoFollowRef.current = nextEnabled;
      setNetworkAutoFollowState((prev) =>
        prev === nextEnabled ? prev : nextEnabled
      );
    },
    [autoFollowEnabled]
  );

  useEffect(() => {
    LOG_SUB_TABS.forEach((tab) => {
      setLogAutoFollow(tab, autoFollowEnabled);
    });
    setNetworkAutoFollow(autoFollowEnabled);
  }, [autoFollowEnabled, setLogAutoFollow, setNetworkAutoFollow]);

  useEffect(() => {
    installConsoleProxy();
    installXhrProxy({
      excludeHosts: normalizedExcludeDomains,
      excludeIp: shouldExcludeIp,
      customDNS: nativeNetworkConfig.customDNS,
      customHeaders: nativeNetworkConfig.customHeaders,
    });

    const unsubscribeLog = subscribeLogEntries(setLogEntries);
    const unsubscribeNetwork = subscribeNetworkEntries(setNetworkEntries);
    setLogEntries(getLogEntries());
    setNetworkEntries(getNetworkEntries());

    return () => {
      unsubscribeLog();
      unsubscribeNetwork();
      uninstallConsoleProxy();
      uninstallXhrProxy();
    };
  }, [
    nativeNetworkConfig.customDNS,
    nativeNetworkConfig.customHeaders,
    normalizedExcludeDomains,
    shouldExcludeIp,
  ]);

  useEffect(() => {
    nativeModule?.setNetworkConfig?.(nativeNetworkConfig);
  }, [nativeModule, nativeNetworkConfig]);

  useEffect(() => {
    dragPosition.stopAnimation((value) => {
      const nextX = clamp(value.x, minX, maxX);
      const nextY = clamp(value.y, minY, maxY);
      dragPosition.setValue({ x: nextX, y: nextY });
      dragStartPoint.current = { x: nextX, y: nextY };
    });
  }, [dragPosition, maxX, maxY, minX, minY]);

  useEffect(() => {
    if (panelVisible && activeTab === 'System' && !systemInfo) {
      nativeModule
        ?.getSystemInfo?.()
        .then((result) => setSystemInfo(result))
        .catch(() => undefined);
    }
    if (panelVisible && activeTab === 'App' && !appInfo) {
      nativeModule
        ?.getAppInfo?.()
        .then((result) => setAppInfo(result))
        .catch(() => undefined);
    }
  }, [activeTab, appInfo, nativeModule, panelVisible, systemInfo]);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      panelContentTaskRef.current?.cancel();
      panelContentTaskRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLogFilter(logFilterInput);
    }, 1000);
    return () => clearTimeout(timer);
  }, [logFilterInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedNetworkFilter(networkFilterInput);
    }, 1000);
    return () => clearTimeout(timer);
  }, [networkFilterInput]);

  const openPanel = useCallback(() => {
    panelContentTaskRef.current?.cancel();
    panelContentTaskRef.current = null;
    setPanelVisible(true);
    setPanelContentReady(false);
    panelTranslateY.setValue(panelHeight);
    maskOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(panelTranslateY, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(maskOpacity, {
        toValue: PANEL_MASK_MAX_OPACITY,
        duration: PANEL_ANIMATION_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }
      panelContentTaskRef.current = InteractionManager.runAfterInteractions(
        () => {
          setPanelContentReady(true);
          panelContentTaskRef.current = null;
        }
      );
    });
  }, [maskOpacity, panelHeight, panelTranslateY]);

  const closePanel = () => {
    panelContentTaskRef.current?.cancel();
    panelContentTaskRef.current = null;
    Animated.parallel([
      Animated.timing(panelTranslateY, {
        toValue: panelHeight,
        duration: PANEL_ANIMATION_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(maskOpacity, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setPanelVisible(false);
        setPanelContentReady(false);
        maskOpacity.setValue(0);
      }
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragPosition.stopAnimation((value) => {
            dragStartPoint.current = { x: value.x, y: value.y };
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextX = clamp(
            dragStartPoint.current.x + gestureState.dx,
            minX,
            maxX
          );
          const nextY = clamp(
            dragStartPoint.current.y + gestureState.dy,
            minY,
            maxY
          );
          dragPosition.setValue({ x: nextX, y: nextY });
        },
        onPanResponderRelease: (_, gestureState) => {
          const moveDistance = Math.hypot(gestureState.dx, gestureState.dy);
          if (moveDistance <= 3) {
            openPanel();
          }
          dragPosition.stopAnimation((value) => {
            dragStartPoint.current = { x: value.x, y: value.y };
          });
        },
      }),
    [dragPosition, maxX, maxY, minX, minY, openPanel]
  );

  const normalizedLogFilter = debouncedLogFilter.trim().toLowerCase();
  const normalizedNetworkFilter = debouncedNetworkFilter.trim().toLowerCase();

  const filteredLogEntries = useMemo(() => {
    if (!normalizedLogFilter) {
      return logEntries;
    }
    return logEntries.filter((item) =>
      item.text.toLowerCase().includes(normalizedLogFilter)
    );
  }, [logEntries, normalizedLogFilter]);

  const filteredNetworkEntries = useMemo(() => {
    if (!normalizedNetworkFilter) {
      return networkEntries;
    }
    return networkEntries.filter((item) =>
      item.url.toLowerCase().includes(normalizedNetworkFilter)
    );
  }, [networkEntries, normalizedNetworkFilter]);

  const logDataByTab = useMemo(
    () => ({
      All: filteredLogEntries,
      log: filteredLogEntries.filter((item) => item.level === 'log'),
      info: filteredLogEntries.filter((item) => item.level === 'info'),
      warn: filteredLogEntries.filter((item) => item.level === 'warn'),
      error: filteredLogEntries.filter((item) => item.level === 'error'),
    }),
    [filteredLogEntries]
  );

  const scrollLogTop = () => {
    setLogAutoFollow(logSubTab, false);
    logListRefs[logSubTab].current?.scrollToOffset({
      offset: 0,
      animated: true,
    });
  };

  const scrollLogBottom = useCallback(
    (animated = true) => {
      setLogAutoFollow(logSubTab, true);
      logListRefs[logSubTab].current?.scrollToEnd({ animated });
    },
    [logListRefs, logSubTab, setLogAutoFollow]
  );

  const scrollNetworkTop = () => {
    setNetworkAutoFollow(false);
    networkListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const scrollNetworkBottom = useCallback(
    (animated = true) => {
      setNetworkAutoFollow(true);
      networkListRef.current?.scrollToEnd({ animated });
    },
    [setNetworkAutoFollow]
  );

  const handleLogScrollBeginDrag = useCallback(
    (tab: LogFilterTab) => {
      return () => {
        logGestureDraggingRef.current[tab] = true;
        setLogAutoFollow(tab, false);
      };
    },
    [setLogAutoFollow]
  );

  const handleLogScrollEndDrag = useCallback(
    (tab: LogFilterTab) => {
      return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        logGestureDraggingRef.current[tab] = false;
        setLogAutoFollow(tab, isNearBottom(event));
      };
    },
    [setLogAutoFollow]
  );

  const handleNetworkScrollBeginDrag = useCallback(() => {
    networkGestureDraggingRef.current = true;
    setNetworkAutoFollow(false);
  }, [setNetworkAutoFollow]);

  const handleNetworkScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      networkGestureDraggingRef.current = false;
      setNetworkAutoFollow(isNearBottom(event));
    },
    [setNetworkAutoFollow]
  );

  const handleLogContentSizeChange = useCallback(
    (tab: LogFilterTab) => {
      return () => {
        if (!panelVisible || !panelContentReady || activeTab !== 'Log') {
          return;
        }
        if (logGestureDraggingRef.current[tab]) {
          return;
        }
        if (!logAutoFollowRef.current[tab]) {
          return;
        }
        requestAnimationFrame(() => {
          logListRefs[tab].current?.scrollToEnd({ animated: true });
        });
      };
    },
    [activeTab, logListRefs, panelContentReady, panelVisible]
  );

  const handleNetworkContentSizeChange = useCallback(() => {
    if (!panelVisible || !panelContentReady || activeTab !== 'Network') {
      return;
    }
    if (networkGestureDraggingRef.current) {
      return;
    }
    if (!networkAutoFollowRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      networkListRef.current?.scrollToEnd({ animated: true });
    });
  }, [activeTab, panelContentReady, panelVisible]);

  useEffect(() => {
    if (!autoFollowEnabled) {
      return;
    }
    if (!panelVisible || !panelContentReady || activeTab !== 'Log') {
      return;
    }
    if (didInitialLogScrollRef.current) {
      return;
    }
    didInitialLogScrollRef.current = true;
    requestAnimationFrame(() => {
      scrollLogBottom(false);
    });
  }, [
    activeTab,
    autoFollowEnabled,
    panelContentReady,
    panelVisible,
    scrollLogBottom,
  ]);

  useEffect(() => {
    if (!autoFollowEnabled) {
      return;
    }
    if (!panelVisible || !panelContentReady || activeTab !== 'Network') {
      return;
    }
    if (didInitialNetworkScrollRef.current) {
      return;
    }
    didInitialNetworkScrollRef.current = true;
    requestAnimationFrame(() => {
      scrollNetworkBottom(false);
    });
  }, [
    activeTab,
    autoFollowEnabled,
    panelContentReady,
    panelVisible,
    scrollNetworkBottom,
  ]);

  const renderRootTab = (tab: VConsoleTab) => (
    <Pressable
      key={tab}
      style={[
        styles.topTabButton,
        activeTab === tab && styles.topTabButtonActive,
      ]}
      onPress={() => setActiveTab(tab)}
    >
      <Text
        style={[
          styles.topTabText,
          activeTab === tab && styles.topTabTextActive,
        ]}
      >
        {tab}
      </Text>
    </Pressable>
  );

  const renderActionButton = (
    label: string,
    onPress: () => void,
    active = false
  ) => (
    <Pressable
      key={label}
      style={[styles.actionButton, active && styles.actionButtonActive]}
      onPress={onPress}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );

  const renderLogItem: FlatListProps<LogEntry>['renderItem'] = ({ item }) => {
    return <LogListItem item={item} />;
  };

  const renderNetworkItem: FlatListProps<NetworkEntry>['renderItem'] = ({
    item,
  }) => {
    return <NetworkListItem item={item} />;
  };

  const updateDnsRule = useCallback(
    (index: number, field: keyof VConsoleDNSRule, value: string) => {
      setDnsRules((prev) =>
        prev.map((rule, currentIndex) =>
          currentIndex === index ? { ...rule, [field]: value } : rule
        )
      );
    },
    []
  );

  const updateHeaderRule = useCallback(
    (index: number, field: keyof VConsoleHeaderRule, value: string) => {
      setHeaderRules((prev) =>
        prev.map((rule, currentIndex) =>
          currentIndex === index ? { ...rule, [field]: value } : rule
        )
      );
    },
    []
  );

  const appendDnsRule = useCallback(() => {
    setDnsRules((prev) => [...prev, createEmptyDnsRule()]);
  }, []);

  const appendHeaderRule = useCallback(() => {
    setHeaderRules((prev) => [...prev, createEmptyHeaderRule()]);
  }, []);

  const removeDnsRule = useCallback((index: number) => {
    setDnsRules((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      return next.length > 0 ? next : [createEmptyDnsRule()];
    });
  }, []);

  const removeHeaderRule = useCallback((index: number) => {
    setHeaderRules((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      return next.length > 0 ? next : [createEmptyHeaderRule()];
    });
  }, []);

  const renderLogPanel = (visible: boolean) => (
    <View style={[styles.contentArea, visible ? {} : styles.hidden]}>
      <View style={styles.subTabRow}>
        {LOG_SUB_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.subTabButton,
              logSubTab === tab && styles.subTabButtonActive,
            ]}
            onPress={() => setLogSubTab(tab)}
          >
            <Text
              style={[
                styles.subTabText,
                logSubTab === tab && styles.subTabTextActive,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.logListsWrap}>
        {LOG_SUB_TABS.map((tab) => (
          <View
            key={tab}
            style={[styles.listHost, logSubTab !== tab && styles.hidden]}
          >
            <FlatList
              ref={logListRefs[tab]}
              data={logDataByTab[tab]}
              keyExtractor={(item) => `${tab}-${item.id}`}
              renderItem={renderLogItem}
              ItemSeparatorComponent={ListSeparator}
              onScrollBeginDrag={handleLogScrollBeginDrag(tab)}
              onScrollEndDrag={handleLogScrollEndDrag(tab)}
              onContentSizeChange={handleLogContentSizeChange(tab)}
            />
          </View>
        ))}
      </View>
      <View style={styles.filterInputWrap}>
        <TextInput
          style={styles.filterInput}
          textAlignVertical="center"
          value={logFilterInput}
          onChangeText={setLogFilterInput}
          placeholder="filter..."
          placeholderTextColor="#999999"
        />
      </View>
      <View style={styles.actionsRow}>
        {renderActionButton('Clear', () => {
          clearLogEntries();
        })}
        {renderActionButton('Top', scrollLogTop)}
        {renderActionButton(
          'Bottom',
          scrollLogBottom,
          autoFollowEnabled && logAutoFollowState[logSubTab]
        )}
        {renderActionButton('Hide', closePanel)}
      </View>
    </View>
  );

  const renderNetworkPanel = (visible: boolean) => (
    <View style={[styles.contentArea, visible ? {} : styles.hidden]}>
      <FlatList
        ref={networkListRef}
        data={filteredNetworkEntries}
        keyExtractor={(item) => `network-${item.id}`}
        renderItem={renderNetworkItem}
        ItemSeparatorComponent={ListSeparator}
        onScrollBeginDrag={handleNetworkScrollBeginDrag}
        onScrollEndDrag={handleNetworkScrollEndDrag}
        onContentSizeChange={handleNetworkContentSizeChange}
      />
      <View style={styles.filterInputWrap}>
        <TextInput
          style={styles.filterInput}
          value={networkFilterInput}
          onChangeText={setNetworkFilterInput}
          placeholder="filter"
          placeholderTextColor="#999999"
        />
      </View>
      <View style={styles.actionsRow}>
        {renderActionButton('Clear', () => {
          clearNetworkEntries();
        })}
        {renderActionButton('Top', scrollNetworkTop)}
        {renderActionButton(
          'Bottom',
          scrollNetworkBottom,
          autoFollowEnabled && networkAutoFollowState
        )}
        {renderActionButton('Hide', closePanel)}
      </View>
    </View>
  );

  const renderSettingSectionHeader = (
    title: string,
    enabled: boolean,
    onToggle: (nextValue: boolean) => void,
    onAdd: () => void
  ) => (
    <View style={styles.settingSectionHeader}>
      <View style={styles.settingSectionTitleWrap}>
        <Text style={styles.settingSectionTitle}>{title}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: '#D9D9D9', true: '#8DB2FF' }}
        thumbColor={enabled ? '#246BFD' : '#FFFFFF'}
        ios_backgroundColor="#D9D9D9"
      />
      <Pressable style={styles.settingAddButton} onPress={onAdd}>
        <Text style={styles.settingAddButtonText}>+</Text>
      </Pressable>
    </View>
  );

  const renderSettingPanel = (visible: boolean) => (
    <View style={[styles.contentArea, visible ? {} : styles.hidden]}>
      <ScrollView
        contentContainerStyle={styles.settingScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.settingSectionCard}>
          <Text style={styles.settingGroupTitle}>Network</Text>
          <View style={styles.settingSubSection}>
            {renderSettingSectionHeader(
              'DNS',
              dnsEnabled,
              setDnsEnabled,
              appendDnsRule
            )}
            {dnsRules.map((rule, index) => (
              <View key={`dns-${index}`} style={styles.settingRuleRow}>
                <TextInput
                  style={[styles.settingInput, styles.settingInputHalf]}
                  value={rule.domain ?? ''}
                  onChangeText={(value) =>
                    updateDnsRule(index, 'domain', value)
                  }
                  onFocus={() => setSettingInputFocused(true)}
                  onBlur={() => setSettingInputFocused(false)}
                  placeholder="api.example.com"
                  placeholderTextColor="#999999"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={[styles.settingInput, styles.settingInputHalf]}
                  value={rule.ip ?? ''}
                  onChangeText={(value) => updateDnsRule(index, 'ip', value)}
                  onFocus={() => setSettingInputFocused(true)}
                  onBlur={() => setSettingInputFocused(false)}
                  placeholder="192.168.0.1"
                  placeholderTextColor="#999999"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={styles.settingRowDeleteButton}
                  onPress={() => removeDnsRule(index)}
                >
                  <Text style={styles.settingRowDeleteButtonText}>-</Text>
                </Pressable>
              </View>
            ))}
          </View>
          <View style={styles.settingSubSection}>
            {renderSettingSectionHeader(
              'Headers',
              headerEnabled,
              setHeaderEnabled,
              appendHeaderRule
            )}
            {headerRules.map((rule, index) => (
              <View key={`header-${index}`} style={styles.settingRuleRow}>
                <TextInput
                  style={[styles.settingInput, styles.settingInputHalf]}
                  value={rule.key ?? ''}
                  onChangeText={(value) =>
                    updateHeaderRule(index, 'key', value)
                  }
                  onFocus={() => setSettingInputFocused(true)}
                  onBlur={() => setSettingInputFocused(false)}
                  placeholder="x-debug-key"
                  placeholderTextColor="#999999"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={[styles.settingInput, styles.settingInputHalf]}
                  value={rule.value ?? ''}
                  onChangeText={(value) =>
                    updateHeaderRule(index, 'value', value)
                  }
                  onFocus={() => setSettingInputFocused(true)}
                  onBlur={() => setSettingInputFocused(false)}
                  placeholder="value"
                  placeholderTextColor="#999999"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={styles.settingRowDeleteButton}
                  onPress={() => removeHeaderRule(index)}
                >
                  <Text style={styles.settingRowDeleteButtonText}>-</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={styles.actionsRow}>
        {renderActionButton('Hide', closePanel)}
      </View>
    </View>
  );

  const renderSystemPanel = (visible: boolean) => (
    <View style={[styles.contentArea, visible ? {} : styles.hidden]}>
      <View style={[styles.infoCard, styles.infoCardFill]}>
        <Text style={styles.infoText}>
          Brand: {systemInfo?.manufacturer ?? '-'}
        </Text>
        <Text style={styles.infoText}>Model: {systemInfo?.model ?? '-'}</Text>
        <Text style={styles.infoText}>
          System Version: {Platform.OS === 'android' ? 'Android' : 'iOS'}{' '}
          {systemInfo?.osVersion ?? '-'}
        </Text>
        {Platform.OS === 'android' ? (
          <Text style={styles.infoText}>
            Network Type: {systemInfo?.networkType ?? '-'}
          </Text>
        ) : null}
        {Platform.OS === 'android' ? (
          <Text style={styles.infoText}>
            Network Reachable: {systemInfo?.isNetworkReachable ?? 'unknown'}
          </Text>
        ) : null}
        <Text style={styles.infoText}>
          Total Memory: {formatMemorySize(systemInfo?.totalMemory)}
        </Text>
        {Platform.OS === 'android' ? (
          <Text style={styles.infoText}>
            Available Memory: {formatMemorySize(systemInfo?.availableMemory)}
          </Text>
        ) : null}
      </View>
      <View style={styles.actionsRow}>
        {renderActionButton('Hide', closePanel)}
      </View>
    </View>
  );

  const renderAppPanel = (visible: boolean) => (
    <View style={[styles.contentArea, visible ? {} : styles.hidden]}>
      <View style={[styles.infoCard, styles.infoCardFill]}>
        <Text style={styles.infoText}>
          App Version: {appInfo?.appVersion ?? '-'}
        </Text>
        <Text style={styles.infoText}>
          Build Number: {appInfo?.buildNumber ?? '-'}
        </Text>
      </View>
      <View style={styles.actionsRow}>
        {renderActionButton('Hide', closePanel)}
      </View>
    </View>
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {!panelVisible ? (
        <Animated.View
          style={[
            styles.floatingButtonWrap,
            { transform: dragPosition.getTranslateTransform() },
          ]}
          {...panResponder.panHandlers}
        >
          <View
            style={[
              styles.floatingButton,
              {
                width: floatingButtonWidth,
                height: floatingButtonHeight,
              },
              style?.background ? { backgroundColor: style.background } : null,
            ]}
          >
            <Text
              pointerEvents="none"
              style={[
                styles.floatingButtonText,
                style?.color ? { color: style.color } : null,
                style?.fontSize ? { fontSize: style.fontSize } : null,
              ]}
            >
              vConsole
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {panelVisible ? (
        <View style={styles.overlayWrap}>
          <Animated.View style={[styles.mask, { opacity: maskOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closePanel} />
          </Animated.View>
          <Animated.View
            style={[
              styles.panel,
              {
                height: panelHeight,
                marginBottom: panelKeyboardOffset,
                transform: [{ translateY: panelTranslateY }],
              },
            ]}
          >
            <View style={styles.topTabRow}>{ROOT_TABS.map(renderRootTab)}</View>
            {panelContentReady ? (
              <>
                {renderLogPanel(activeTab === 'Log')}
                {renderNetworkPanel(activeTab === 'Network')}
                {renderSystemPanel(activeTab === 'System')}
                {renderSettingPanel(activeTab === 'Setting')}
                {renderAppPanel(activeTab === 'App')}
              </>
            ) : (
              <View style={styles.loadingContainer}>
                <ActivityIndicator />
              </View>
            )}
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

export function VConsole({
  enable = true,
  exclude = EMPTY_EXCLUDE,
  autoFollow = false,
  network,
  style,
}: VConsoleProps) {
  if (!enable) {
    return null;
  }
  return (
    <Container
      exclude={exclude}
      autoFollow={autoFollow}
      network={network}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  floatingButtonWrap: {
    position: 'absolute',
    zIndex: 9999,
  },
  floatingButton: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#22A455',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  overlayWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  mask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  panel: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topTabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D9D9D9',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  topTabButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  topTabButtonActive: {
    backgroundColor: '#EEF5FF',
  },
  topTabText: {
    color: '#444444',
    fontSize: 13,
    fontWeight: '500',
  },
  topTabTextActive: {
    color: '#246BFD',
  },
  contentArea: {
    flex: 1,
    paddingBottom: Platform.OS === 'android' ? 42 : 16,
  },
  subTabRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  subTabButton: {
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  subTabButtonActive: {
    backgroundColor: '#EEF5FF',
  },
  subTabText: {
    color: '#666666',
    fontSize: 12,
  },
  subTabTextActive: {
    color: '#246BFD',
  },
  logListsWrap: {
    flex: 1,
  },
  listHost: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  listItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'column',
    position: 'relative',
  },
  listItemMain: {
    flex: 1,
    marginRight: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DFDFDF',
  },
  logLevelText: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  logTimeText: {
    fontSize: 11,
    fontWeight: '400',
    color: '#888888',
  },
  logPayload: {
    flex: 1,
  },
  copyButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D0D0',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  copyButtonText: {
    fontSize: 11,
    color: '#333333',
  },
  retryButton: {
    position: 'absolute',
    right: 8,
    top: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D0D0',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  retryButtonText: {
    fontSize: 11,
    color: '#333333',
  },
  valuePrimitive: {
    color: '#222222',
    fontSize: 12,
    flexShrink: 1,
  },
  valuePrimitiveInput: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    textAlignVertical: 'top',
  },
  treeNode: {
    flexDirection: 'column',
    marginBottom: 4,
  },
  treeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrow: {
    color: '#666666',
    fontSize: 11,
    marginRight: 4,
  },
  treeLabel: {
    color: '#444444',
    fontSize: 12,
    fontWeight: '500',
  },
  treeChildren: {
    marginLeft: 14,
    marginTop: 4,
  },
  treeChildRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  treeChildColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  treeKey: {
    color: '#666666',
    fontSize: 12,
  },
  networkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginRight: 36,
  },
  networkCustomDnsIcon: {
    width: 14,
    height: 14,
    marginRight: 6,
    resizeMode: 'contain',
  },
  networkTitle: {
    fontSize: 12,
    color: '#111111',
    fontWeight: '600',
    flexShrink: 1,
  },
  networkBlock: {
    marginTop: 2,
    marginBottom: 2,
  },
  networkLabel: {
    fontSize: 12,
    color: '#444444',
    marginBottom: 2,
  },
  networkErrorLabel: {
    color: LOG_THEME.error.color,
    fontWeight: '600',
  },
  networkErrorText: {
    color: LOG_THEME.error.color,
    fontSize: 12,
  },
  filterInputWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E1E1E1',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  filterInput: {
    height: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#222222',
    backgroundColor: '#FFFFFF',
    paddingVertical: 0,
  },
  actionsRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E1E1E1',
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    minWidth: 62,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D0D0',
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
  },
  actionButtonActive: {
    borderColor: '#246BFD',
  },
  actionButtonText: {
    color: '#333333',
    fontSize: 12,
    fontWeight: '500',
  },
  infoCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  infoCardFill: {
    flex: 1,
  },
  settingScrollContent: {
    paddingBottom: 12,
  },
  settingSectionCard: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E1E1E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  settingGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 12,
  },
  settingSubSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  settingSectionHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingSectionTitleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  settingSectionTitle: {
    fontSize: 13,
    color: '#222222',
    fontWeight: '500',
  },
  settingAddButton: {
    width: 30,
    height: 30,
    marginLeft: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D0D0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  settingAddButtonText: {
    fontSize: 18,
    color: '#333333',
    lineHeight: 20,
  },
  settingRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  settingInput: {
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#222222',
    backgroundColor: '#FFFFFF',
    paddingVertical: 0,
  },
  settingInputHalf: {
    flex: 1,
    marginRight: 8,
  },
  settingRowDeleteButton: {
    minWidth: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D0D0D0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  settingRowDeleteButtonText: {
    fontSize: 12,
    color: '#333333',
  },
  infoText: {
    fontSize: 13,
    color: '#222222',
    marginBottom: 8,
  },
  infoSubText: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
});
