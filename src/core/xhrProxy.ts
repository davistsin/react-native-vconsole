import type { NetworkEntry } from '../types';

type NetworkListener = (entries: NetworkEntry[]) => void;
type InstallXhrProxyOptions = {
  excludeHosts?: string[];
  excludeIp?: boolean;
};

const MAX_NETWORK_COUNT = 500;

const listeners = new Set<NetworkListener>();
const entries: NetworkEntry[] = [];

let isInstalled = false;
let networkId = 1;
let OriginalXHR: typeof XMLHttpRequest | undefined;
let ignoredHosts = new Set<string>();
let ignoredIpHost = false;

function normalizeHosts(hosts?: string[]): Set<string> {
  return new Set(
    (hosts ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean)
  );
}

function getHostFromUrl(rawUrl: string): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  const isAbsoluteHttp = /^https?:\/\//i.test(rawUrl);
  const isProtocolRelative = /^\/\//.test(rawUrl);
  if (!isAbsoluteHttp && !isProtocolRelative) {
    return undefined;
  }

  try {
    const normalizedUrl = isProtocolRelative ? `https:${rawUrl}` : rawUrl;
    return new URL(normalizedUrl).host.toLowerCase();
  } catch {
    const normalizedUrl = isProtocolRelative ? `https:${rawUrl}` : rawUrl;
    const matched = normalizedUrl.match(/^https?:\/\/([^/]+)/i);
    return matched?.[1]?.toLowerCase();
  }
}

function getHostnameFromUrl(rawUrl: string): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  const isAbsoluteHttp = /^https?:\/\//i.test(rawUrl);
  const isProtocolRelative = /^\/\//.test(rawUrl);
  if (!isAbsoluteHttp && !isProtocolRelative) {
    return undefined;
  }

  const normalizedUrl = isProtocolRelative ? `https:${rawUrl}` : rawUrl;
  try {
    return new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    const authority = normalizedUrl.match(/^https?:\/\/([^/?#]+)/i)?.[1];
    if (!authority) {
      return undefined;
    }
    if (authority.startsWith('[')) {
      const endIndex = authority.indexOf(']');
      return endIndex > 1
        ? authority.slice(1, endIndex).toLowerCase()
        : undefined;
    }
    return authority.split(':')[0]?.toLowerCase();
  }
}

function isIpv4Address(hostname: string): boolean {
  const segments = hostname.split('.');
  if (segments.length !== 4) {
    return false;
  }
  return segments.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function isIpv6Address(hostname: string): boolean {
  return hostname.includes(':') && /^[0-9a-f:.]+$/i.test(hostname);
}

function isIpAddressHostname(hostname: string): boolean {
  return isIpv4Address(hostname) || isIpv6Address(hostname);
}

function shouldSkipNetworkCapture(rawUrl: string): boolean {
  const host = getHostFromUrl(rawUrl);
  if (host && ignoredHosts.has(host)) {
    return true;
  }
  if (!ignoredIpHost) {
    return false;
  }
  const hostname = getHostnameFromUrl(rawUrl);
  if (!hostname) {
    return false;
  }
  return isIpAddressHostname(hostname);
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === 'string') {
    return error;
  }
  return undefined;
}

function isInvalidHttpUrl(rawUrl: string): boolean {
  if (!rawUrl) {
    return true;
  }
  if (/^https?:\/\//i.test(rawUrl) || /^\/\//.test(rawUrl)) {
    return false;
  }
  if (rawUrl.startsWith('/')) {
    return false;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl);
  return hasScheme || !rawUrl.includes('/');
}

function markNetworkError(entry: NetworkEntry, reason: string) {
  entry.status = entry.status ?? 0;
  entry.isError = true;
  entry.errorReason = reason;
  entry.responseHeaders = {};
  entry.responseData = undefined;
}

function notify() {
  const next = [...entries];
  listeners.forEach((listener) => {
    listener(next);
  });
}

function trimEntries() {
  if (entries.length > MAX_NETWORK_COUNT) {
    entries.splice(0, entries.length - MAX_NETWORK_COUNT);
  }
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function getHeaderCaseInsensitive(
  headers: Record<string, string>,
  key: string
): string | undefined {
  const target = key.toLowerCase();
  const foundKey = Object.keys(headers).find(
    (item) => item.toLowerCase() === target
  );
  return foundKey ? headers[foundKey] : undefined;
}

function parseBlobLikeJson(blobLike: unknown): Promise<unknown> | undefined {
  if (
    typeof blobLike === 'object' &&
    blobLike !== null &&
    'text' in blobLike &&
    typeof (blobLike as { text?: unknown }).text === 'function'
  ) {
    const textFn = (blobLike as { text: () => Promise<string> }).text;
    return textFn()
      .then((text) => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })
      .catch(() => '[Blob response]');
  }

  if (typeof Response !== 'undefined') {
    try {
      const response = new Response(blobLike as never);
      return response
        .text()
        .then((text) => {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        })
        .catch(() => '[Blob response]');
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function parseResponseData(
  xhr: XMLHttpRequest,
  responseHeaders: Record<string, string>
): unknown | Promise<unknown> {
  const responseType = xhr.responseType ?? '';
  const canReadResponseText = responseType === '' || responseType === 'text';

  if (canReadResponseText) {
    try {
      const responseText = xhr.responseText;
      if (!responseText) {
        return '';
      }
      try {
        return JSON.parse(responseText);
      } catch {
        return responseText;
      }
    } catch {
      // Some RN runtimes still throw for responseText access.
      return xhr.response ?? '';
    }
  }

  if (responseType === 'json') {
    return xhr.response ?? null;
  }

  if (responseType === 'blob') {
    const contentType =
      getHeaderCaseInsensitive(responseHeaders, 'content-type') ?? '';
    if (contentType.toLowerCase().includes('application/json')) {
      const parsed = parseBlobLikeJson(xhr.response);
      if (parsed) {
        return parsed;
      }
    }
    return '[Blob response]';
  }

  if (responseType === 'arraybuffer') {
    return '[ArrayBuffer response]';
  }

  return xhr.response ?? '';
}

function parseHeaders(rawHeaders?: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawHeaders) {
    return result;
  }

  rawHeaders
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const splitIndex = line.indexOf(':');
      if (splitIndex > 0) {
        const key = line.slice(0, splitIndex).trim();
        const value = line.slice(splitIndex + 1).trim();
        result[key] = value;
      }
    });
  return result;
}

export function installXhrProxy(options?: InstallXhrProxyOptions) {
  ignoredHosts = normalizeHosts(options?.excludeHosts);
  ignoredIpHost = options?.excludeIp === true;

  if (isInstalled || typeof XMLHttpRequest === 'undefined') {
    return;
  }

  OriginalXHR = global.XMLHttpRequest;
  if (!OriginalXHR) {
    return;
  }

  class PatchedXMLHttpRequest extends OriginalXHR {
    private _entryId = 0;
    private _requestHeaders: Record<string, string> = {};
    private _method = 'GET';
    private _url = '';

    open(method: string, url: string, ...rest: unknown[]) {
      this._method = (method || 'GET').toUpperCase();
      this._url = url;
      return super.open(method, url, ...(rest as []));
    }

    setRequestHeader(header: string, value: string) {
      this._requestHeaders[header] = value;
      return super.setRequestHeader(header, value);
    }

    send(body?: unknown) {
      if (shouldSkipNetworkCapture(this._url)) {
        return super.send(body as never);
      }

      const entry: NetworkEntry = {
        id: networkId++,
        method: this._method,
        url: this._url,
        startedAt: Date.now(),
        requestHeaders: { ...this._requestHeaders },
        requestBody: body ?? undefined,
        responseHeaders: {},
      };

      this._entryId = entry.id;
      entries.push(entry);
      trimEntries();
      notify();

      this.addEventListener('readystatechange', () => {
        if (this.readyState !== 4) {
          return;
        }

        const current = entries.find((item) => item.id === this._entryId);
        if (!current) {
          return;
        }

        // Some internal RN/Metro requests start as relative paths (e.g. /symbolicate).
        // Re-check with responseURL at completion to apply host filters correctly.
        const finalUrl = this.responseURL || this._url;
        if (shouldSkipNetworkCapture(finalUrl)) {
          const index = entries.findIndex((item) => item.id === this._entryId);
          if (index >= 0) {
            entries.splice(index, 1);
            notify();
          }
          return;
        }

        const finishedAt = Date.now();
        current.status = this.status;
        current.finishedAt = current.finishedAt ?? finishedAt;
        current.durationMs =
          current.durationMs ?? finishedAt - current.startedAt;
        if (current.isError) {
          notify();
          return;
        }
        try {
          current.responseHeaders = parseHeaders(this.getAllResponseHeaders());
        } catch {
          current.responseHeaders = {};
        }
        if (this.status === 0) {
          const reason = isInvalidHttpUrl(this._url)
            ? `Invalid URL: ${this._url}`
            : 'Network request failed';
          markNetworkError(current, reason);
          notify();
          return;
        }
        try {
          const parsedData = parseResponseData(this, current.responseHeaders);
          if (isPromiseLike(parsedData)) {
            current.responseData = '[Parsing blob response...]';
            notify();
            parsedData
              .then((resolved) => {
                current.responseData = resolved;
                notify();
              })
              .catch(() => {
                current.responseData = '[Blob response]';
                notify();
              });
            return;
          }
          current.responseData = parsedData;
        } catch {
          current.responseData = '[Unreadable response]';
        }
        notify();
      });

      this.addEventListener('timeout', () => {
        const current = entries.find((item) => item.id === this._entryId);
        if (!current) {
          return;
        }
        current.finishedAt = current.finishedAt ?? Date.now();
        current.durationMs =
          current.durationMs ?? current.finishedAt - current.startedAt;
        markNetworkError(
          current,
          this.timeout > 0
            ? `Request timeout (${this.timeout}ms)`
            : 'Request timeout'
        );
        notify();
      });

      this.addEventListener('error', () => {
        const current = entries.find((item) => item.id === this._entryId);
        if (!current) {
          return;
        }
        current.finishedAt = current.finishedAt ?? Date.now();
        current.durationMs =
          current.durationMs ?? current.finishedAt - current.startedAt;
        const reason = isInvalidHttpUrl(this._url)
          ? `Invalid URL: ${this._url}`
          : 'Network request failed';
        markNetworkError(current, reason);
        notify();
      });

      this.addEventListener('abort', () => {
        const current = entries.find((item) => item.id === this._entryId);
        if (!current) {
          return;
        }
        current.finishedAt = current.finishedAt ?? Date.now();
        current.durationMs =
          current.durationMs ?? current.finishedAt - current.startedAt;
        markNetworkError(current, 'Request aborted');
        notify();
      });

      try {
        return super.send(body as never);
      } catch (error) {
        entry.finishedAt = Date.now();
        entry.durationMs = entry.finishedAt - entry.startedAt;
        const fallbackReason = isInvalidHttpUrl(this._url)
          ? `Invalid URL: ${this._url}`
          : 'Network request failed';
        markNetworkError(entry, getErrorMessage(error) ?? fallbackReason);
        notify();
        throw error;
      }
    }
  }

  global.XMLHttpRequest = PatchedXMLHttpRequest as typeof XMLHttpRequest;
  isInstalled = true;
}

export function uninstallXhrProxy() {
  if (!isInstalled || !OriginalXHR) {
    return;
  }
  global.XMLHttpRequest = OriginalXHR;
  isInstalled = false;
}

export function getNetworkEntries(): NetworkEntry[] {
  return [...entries];
}

export function clearNetworkEntries() {
  entries.length = 0;
  notify();
}

export function subscribeNetworkEntries(listener: NetworkListener) {
  listeners.add(listener);
  listener(getNetworkEntries());
  return () => {
    listeners.delete(listener);
  };
}
