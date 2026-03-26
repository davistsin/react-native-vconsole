import { NativeModules, Platform } from 'react-native';
import { VConsole } from './VConsole';
import type { AppInfo, SystemInfo } from './types';
import type { VConsoleProps } from './VConsole';

const LINKING_ERROR =
  `The package 'react-native-vconsole' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const Vconsole = NativeModules.Vconsole
  ? NativeModules.Vconsole
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export function getSystemInfo(): Promise<SystemInfo> {
  return Vconsole.getSystemInfo();
}

export function getAppInfo(): Promise<AppInfo> {
  return Vconsole.getAppInfo();
}

export { VConsole };
export type { AppInfo, SystemInfo, VConsoleProps };
