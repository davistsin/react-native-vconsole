export type VConsoleTab = 'Log' | 'Network' | 'System' | 'App';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export type LogFilterTab = 'All' | LogLevel;

export interface LogEntry {
  id: number;
  level: LogLevel;
  args: unknown[];
  text: string;
  timestamp: number;
}

export interface NetworkEntry {
  id: number;
  method: string;
  url: string;
  status?: number;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseHeaders: Record<string, string>;
  responseData?: unknown;
}

export interface SystemInfo {
  manufacturer: string;
  model: string;
  osVersion: string;
  networkType: string;
  isNetworkReachable: string;
  totalMemory: number;
  availableMemory: number;
}

export interface AppInfo {
  appVersion: string;
  buildNumber: string;
}
