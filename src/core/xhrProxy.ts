import type { NetworkEntry } from '../types';

type NetworkListener = (entries: NetworkEntry[]) => void;
type InstallXhrProxyOptions = {
  excludeHosts?: string[];
};

const MAX_NETWORK_COUNT = 500;

const listeners = new Set<NetworkListener>();
const entries: NetworkEntry[] = [];

let isInstalled = false;
let networkId = 1;
let OriginalXHR: typeof XMLHttpRequest | undefined;
let ignoredHosts = new Set<string>();

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

function shouldSkipNetworkCapture(rawUrl: string): boolean {
  const host = getHostFromUrl(rawUrl);
  if (!host) {
    return false;
  }
  return ignoredHosts.has(host);
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

function parseHeaders(rawHeaders: string): Record<string, string> {
  const result: Record<string, string> = {};
  rawHeaders
    .split('\r\n')
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
        current.finishedAt = finishedAt;
        current.durationMs = finishedAt - current.startedAt;
        current.responseHeaders = parseHeaders(this.getAllResponseHeaders());
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

      return super.send(body as never);
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
