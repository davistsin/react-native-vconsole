import {
  clearLogEntries,
  getLogEntries,
  installConsoleProxy,
  uninstallConsoleProxy,
} from '../core/consoleProxy';

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
