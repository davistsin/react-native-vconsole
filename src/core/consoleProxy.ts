import type { LogEntry, LogLevel } from '../types';

type LogListener = (entries: LogEntry[]) => void;
type ConsoleMethod = (...args: unknown[]) => void;

const MAX_LOG_COUNT = 1000;

const listeners = new Set<LogListener>();
const entries: LogEntry[] = [];
const originalConsole: Partial<Record<LogLevel, ConsoleMethod>> = {};

let isInstalled = false;
let logId = 1;

function safeSerialize(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildText(args: unknown[]): string {
  return args.map((item) => safeSerialize(item)).join(' ');
}

function notify() {
  const next = [...entries];
  listeners.forEach((listener) => {
    listener(next);
  });
}

function pushEntry(level: LogLevel, args: unknown[]) {
  entries.push({
    id: logId++,
    level,
    args,
    text: buildText(args),
    timestamp: Date.now(),
  });

  if (entries.length > MAX_LOG_COUNT) {
    entries.splice(0, entries.length - MAX_LOG_COUNT);
  }
}

export function installConsoleProxy() {
  if (isInstalled) {
    return;
  }

  const levels: LogLevel[] = ['log', 'info', 'warn', 'error'];
  levels.forEach((level) => {
    const original = console[level] as ConsoleMethod;
    originalConsole[level] = original;

    console[level] = (...args: unknown[]) => {
      pushEntry(level, args);
      notify();
      original(...args);
    };
  });

  isInstalled = true;
}

export function uninstallConsoleProxy() {
  if (!isInstalled) {
    return;
  }

  const levels: LogLevel[] = ['log', 'info', 'warn', 'error'];
  levels.forEach((level) => {
    const original = originalConsole[level];
    if (original) {
      console[level] = original as ConsoleMethod;
    }
  });

  isInstalled = false;
}

export function getLogEntries(): LogEntry[] {
  return [...entries];
}

export function clearLogEntries() {
  entries.length = 0;
  notify();
}

export function subscribeLogEntries(listener: LogListener) {
  listeners.add(listener);
  listener(getLogEntries());

  return () => {
    listeners.delete(listener);
  };
}
