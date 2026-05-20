export type VConsoleDNSRule = {
  domain?: string;
  ip?: string;
};

export type VConsoleHeaderRule = {
  key?: string;
  value?: string;
};

export type VConsoleCustomDNSConfig = {
  enabled?: boolean;
  rules?: VConsoleDNSRule[];
};

export type VConsoleCustomHeadersConfig = {
  enabled?: boolean;
  headers?: VConsoleHeaderRule[];
};

export type VConsoleForwardProxyConfig = {
  enabled?: boolean;
  endpoint?: string;
};

export type VConsoleNetworkConfig = {
  customDNS?: VConsoleCustomDNSConfig;
  customHeaders?: VConsoleCustomHeadersConfig;
  forwardProxy?: VConsoleForwardProxyConfig;
};

export type NativeDNSRule = {
  domain: string;
  ip: string;
};

export type NativeHeaderRule = {
  key: string;
  value: string;
};

export type NativeNetworkConfig = {
  customDNS: {
    enabled: boolean;
    rules: NativeDNSRule[];
  };
  customHeaders: {
    enabled: boolean;
    headers: NativeHeaderRule[];
  };
};

export function normalizeDnsRules(rules?: VConsoleDNSRule[]): NativeDNSRule[] {
  return (rules ?? [])
    .map((rule) => ({
      domain: rule.domain?.trim().toLowerCase() ?? '',
      ip: rule.ip?.trim() ?? '',
    }))
    .filter((rule) => rule.domain && rule.ip);
}

export function normalizeHeaderRules(
  headers?: VConsoleHeaderRule[]
): NativeHeaderRule[] {
  return (headers ?? [])
    .map((header) => ({
      key: header.key?.trim() ?? '',
      value: header.value?.trim() ?? '',
    }))
    .filter((header) => header.key);
}

export function buildNativeNetworkConfig(
  network?: VConsoleNetworkConfig
): NativeNetworkConfig {
  return {
    customDNS: {
      enabled: network?.customDNS?.enabled === true,
      rules: normalizeDnsRules(network?.customDNS?.rules),
    },
    customHeaders: {
      enabled: network?.customHeaders?.enabled === true,
      headers: normalizeHeaderRules(network?.customHeaders?.headers),
    },
  };
}

export function createEmptyDnsRule(): VConsoleDNSRule {
  return { domain: '', ip: '' };
}

export function createEmptyHeaderRule(): VConsoleHeaderRule {
  return { key: '', value: '' };
}
