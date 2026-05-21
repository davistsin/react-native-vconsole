# react-native-vconsole

vconsole

## Installation

```sh
npm install react-native-vconsole
```

## Usage


```tsx
import { VConsole } from 'react-native-vconsole';

export default function App() {
  return (
    <>
      {/* your app content */}
      <VConsole
        enable={true}
        autoFollow={true}
        style={{
          width: 96,
          height: 40,
          background: '#111111',
          color: '#FFFFFF',
          fontSize: 13,
        }}
        exclude={{
          domains: ['localhost:8081'],
          ip: true,
        }}
        network={{
          customDNS: {
            enabled: false,
            rules: [{ domain: 'api.example.com', ip: '192.168.0.1' }],
          },
          customHeaders: {
            enabled: true,
            headers: [{ key: 'x-debug-token', value: 'demo-token' }],
          },
        }}
      />
    </>
  );
}
```

## Android Integration

`react-native-vconsole` no longer registers `NetworkingModule.setCustomClientBuilder(...)` automatically on Android.
If you want `customDNS` and `customHeaders` to affect React Native JS requests on Android, wire the builder in your host app and compose it with any existing logic there.

```kotlin
import com.facebook.react.modules.network.NetworkingModule
import com.vconsole.VconsoleNetworkConfig

override fun onCreate() {
  super.onCreate()

  NetworkingModule.setCustomClientBuilder { builder ->
    // Keep your app's existing OkHttp customizations here.
    VconsoleNetworkConfig.apply(builder)
  }
}
```

If your app already uses `NetworkingModule.setCustomClientBuilder(...)`, keep a single registration and call `VconsoleNetworkConfig.apply(builder)` inside that callback instead of registering a second one.

## VConsole Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `enable` | `boolean` | `true` | Whether to enable and render vConsole. |
| `autoFollow` | `boolean` | `true` | Whether Log/Network lists auto-scroll to bottom on first open and when new entries arrive while follow mode is active. |
| `style` | `{ width?: number; height?: number; background?: string; color?: string; fontSize?: number }` | `{}` | Floating button style overrides. |
| `exclude` | `{ domains?: string[]; ip?: boolean }` | `{}` | Network capture exclusion rules. |
| `exclude.domains` | `string[]` | `[]` | Hosts to exclude from Network tab capture, keeping previous host-based matching behavior (e.g. `localhost:8081`). |
| `exclude.ip` | `boolean` | `false` | When `true`, requests whose hostname is an IP address (IPv4/IPv6) will be skipped in Network tab capture. |
| `network` | `{ customDNS?: { enabled?: boolean; rules?: Array<{ domain?: string; ip?: string }> }; customHeaders?: { enabled?: boolean; headers?: Array<{ key?: string; value?: string }> }; forwardProxy?: { enabled?: boolean; endpoint?: string } }` | `undefined` | Runtime-editable network settings shown in the `Setting` tab. This release implements `customDNS` and `customHeaders`; `forwardProxy` is reserved for a later release. |

## Features

- Draggable floating button (`vConsole`) with screen-boundary constraints.
- Bottom sheet panel (7/9 screen height) with `Log / Network / System / App / Setting` tabs.
- Log tab captures `console.log/info/warn/error` without breaking original console behavior.
- Log tab supports keyword filter (debounced) across log text content.
- Network tab captures `XMLHttpRequest` requests/responses without breaking original request behavior.
- Setting tab lets you toggle and edit `customDNS` and `customHeaders` rows at runtime.
- Android can apply `customDNS` and `customHeaders` to React Native JS requests when the host app composes `VconsoleNetworkConfig.apply(builder)` into its `NetworkingModule.setCustomClientBuilder(...)` callback.
- iOS applies `customHeaders` and best-effort host override handling to React Native JS requests through a custom native request chain.
- Network tab supports `Retry`, which replays a request with the original method/url/headers/body (excluding unsafe forbidden headers).
- Network tab supports keyword filter (debounced) by request URL.
- `autoFollow` controls Log/Network bottom-follow behavior: on first open it scrolls to bottom, new entries auto-follow only when follow mode is active, dragging away from bottom pauses follow, and scrolling back to bottom or tapping `Bottom` re-enables follow (`autoFollow` must be `true`).
- App tab reads info from native module bridges (`NativeModules.Vconsole`).

<img src="./docs/snapshot/Simulator Screenshot - iPhone 17 Pro - 2026-03-27 at 01.22.36.png" width="360">
<img src="./docs/snapshot/Simulator Screenshot - iPhone 17 Pro - 2026-03-27 at 01.22.57.png" width="360">

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
