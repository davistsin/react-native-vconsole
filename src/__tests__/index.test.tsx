import {
  clearLogEntries,
  getLogEntries,
  installConsoleProxy,
  uninstallConsoleProxy,
} from '../core/consoleProxy';
import {
  clearNetworkEntries,
  getNetworkEntries,
  installXhrProxy,
  uninstallXhrProxy,
} from '../core/xhrProxy';

describe('console proxy', () => {
  afterEach(() => {
    clearLogEntries();
    uninstallConsoleProxy();
  });

  it('captures console.log without breaking original call', () => {
    const spy = jest.spyOn(console, 'log');

    installConsoleProxy();
    console.log('hello', { a: 1 });

    const logs = getLogEntries();
    expect(logs.length).toBe(1);
    expect(logs[0]?.level).toBe('log');
    expect(logs[0]?.args[0]).toBe('hello');
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('xhr proxy', () => {
  class FakeXMLHttpRequest {
    static lastInstance: FakeXMLHttpRequest | undefined;

    readyState = 0;
    responseText = '{"ok":true}';
    responseType = '';
    responseURL = '';
    status = 0;
    method = '';
    url = '';
    requestHeaders: Record<string, string> = {};
    private listeners: Record<string, Array<() => void>> = {};

    constructor() {
      FakeXMLHttpRequest.lastInstance = this;
    }

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
      this.responseURL = url;
    }

    setRequestHeader(header: string, value: string) {
      this.requestHeaders[header] = value;
    }

    addEventListener(event: string, listener: () => void) {
      this.listeners[event] = [...(this.listeners[event] ?? []), listener];
    }

    getAllResponseHeaders() {
      return 'content-type: application/json\r\n';
    }

    send() {
      this.readyState = 4;
      this.status = 200;
      this.listeners.readystatechange?.forEach((listener) => listener());
    }
  }

  const originalXHR = global.XMLHttpRequest;

  afterEach(() => {
    clearNetworkEntries();
    uninstallXhrProxy();
    global.XMLHttpRequest = originalXHR;
    FakeXMLHttpRequest.lastInstance = undefined;
  });

  it('rewrites requests through proxy config and records original url', () => {
    global.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;

    installXhrProxy({
      proxy: {
        enabled: true,
        endpoint: 'https://proxy.test/debug',
        headers: {
          'x-debug-proxy': '1',
        },
      },
    });

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.test/users');
    xhr.send();

    expect(FakeXMLHttpRequest.lastInstance?.url).toBe(
      'https://proxy.test/debug?url=https%3A%2F%2Fapi.test%2Fusers'
    );
    expect(FakeXMLHttpRequest.lastInstance?.requestHeaders).toEqual({
      'x-debug-proxy': '1',
    });

    const entries = getNetworkEntries();
    expect(entries[0]?.url).toBe(
      'https://proxy.test/debug?url=https%3A%2F%2Fapi.test%2Fusers'
    );
    expect(entries[0]?.originalUrl).toBe('https://api.test/users');
  });

  it('does not inject proxy headers for excluded hosts', () => {
    global.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;

    installXhrProxy({
      proxy: {
        enabled: true,
        endpoint: 'https://proxy.test/debug',
        excludeHosts: ['api.test'],
        headers: {
          'x-debug-proxy': '1',
        },
      },
    });

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.test/users');
    xhr.send();

    expect(FakeXMLHttpRequest.lastInstance?.url).toBe('https://api.test/users');
    expect(FakeXMLHttpRequest.lastInstance?.requestHeaders).toEqual({});
    expect(getNetworkEntries()[0]?.originalUrl).toBeUndefined();
  });
});
