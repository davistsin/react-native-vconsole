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
    static sendImpl: ((instance: FakeXMLHttpRequest) => void) | undefined;

    readyState = 0;
    responseText = '{"ok":true}';
    response: unknown = '{"ok":true}';
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

    emit(event: string) {
      this.listeners[event]?.forEach((listener) => listener());
    }

    getAllResponseHeaders() {
      return 'content-type: application/json\r\n';
    }

    send() {
      if (FakeXMLHttpRequest.sendImpl) {
        FakeXMLHttpRequest.sendImpl(this);
        return;
      }
      this.readyState = 4;
      this.status = 200;
      this.emit('readystatechange');
    }
  }

  const originalXHR = global.XMLHttpRequest;

  afterEach(() => {
    clearNetworkEntries();
    uninstallXhrProxy();
    global.XMLHttpRequest = originalXHR;
    FakeXMLHttpRequest.lastInstance = undefined;
    FakeXMLHttpRequest.sendImpl = undefined;
  });

  it('includes configured custom headers in captured request headers', () => {
    global.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;

    installXhrProxy({
      customHeaders: {
        enabled: true,
        headers: [{ key: 'x-debug-proxy', value: '1' }],
      },
    });

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.test/users');
    xhr.send();

    expect(FakeXMLHttpRequest.lastInstance?.url).toBe('https://api.test/users');
    expect(FakeXMLHttpRequest.lastInstance?.requestHeaders).toEqual({});

    const entries = getNetworkEntries();
    expect(entries[0]?.url).toBe('https://api.test/users');
    expect(entries[0]?.requestHeaders).toEqual({
      'x-debug-proxy': '1',
    });
  });

  it('does not inject custom headers when disabled', () => {
    global.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;

    installXhrProxy({
      customHeaders: {
        enabled: false,
        headers: [{ key: 'x-debug-proxy', value: '1' }],
      },
    });

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.test/users');
    xhr.send();

    expect(FakeXMLHttpRequest.lastInstance?.url).toBe('https://api.test/users');
    expect(FakeXMLHttpRequest.lastInstance?.requestHeaders).toEqual({});
    expect(getNetworkEntries()[0]?.requestHeaders).toEqual({});
  });

  it('marks requests that match active custom dns rules', () => {
    global.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;

    installXhrProxy({
      customDNS: {
        enabled: true,
        rules: [{ domain: 'api.test', ip: '192.168.1.100' }],
      },
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.test/users');
    xhr.send();

    const entries = getNetworkEntries();
    expect(entries[0]?.usedCustomDns).toBe(true);
  });

  it('keeps readable error payload for failed requests', () => {
    global.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;

    FakeXMLHttpRequest.sendImpl = (instance) => {
      instance.responseText = '{"message":"gateway failed"}';
      instance.response = '{"message":"gateway failed"}';
      instance.readyState = 4;
      instance.status = 0;
      instance.emit('readystatechange');
    };

    installXhrProxy();

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.test/users');
    xhr.send();

    const entries = getNetworkEntries();
    expect(entries[0]?.status).toBe(0);
    expect(entries[0]?.isError).toBe(true);
    expect(entries[0]?.responseData).toEqual({
      message: 'gateway failed',
    });
  });
});
