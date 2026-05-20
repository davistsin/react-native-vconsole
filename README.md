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
        proxy={{
          defaultEnable: false,
          endpoint: 'https://proxy.example.com/debug',
          targetQueryName: 'url',
          headers: {
            'x-debug-proxy': '1',
          },
        }}
      />
    </>
  );
}
```

## VConsole Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `enable` | `boolean` | `true` | Whether to enable and render vConsole. |
| `autoFollow` | `boolean` | `true` | Whether Log/Network lists auto-scroll to bottom on first open and when new entries arrive while follow mode is active. |
| `style` | `{ width?: number; height?: number; background?: string; color?: string; fontSize?: number }` | `{}` | Floating button style overrides. |
| `exclude` | `{ domains?: string[]; ip?: boolean }` | `{}` | Network capture exclusion rules. |
| `exclude.domains` | `string[]` | `[]` | Hosts to exclude from Network tab capture, keeping previous host-based matching behavior (e.g. `localhost:8081`). |
| `exclude.ip` | `boolean` | `false` | When `true`, requests whose hostname is an IP address (IPv4/IPv6) will be skipped in Network tab capture. |
| `proxy` | `{ defaultEnable?: boolean; endpoint?: string; targetQueryName?: string; headers?: Record<string, string>; includeHosts?: string[]; excludeHosts?: string[]; rewriteUrl?: ({ method, url }) => string \| undefined }` | `undefined` | JS-layer request rewrite proxy for captured XHR requests. `defaultEnable` only controls the initial state; the System tab proxy switch controls runtime state. |

## Features

- Draggable floating button (`vConsole`) with screen-boundary constraints.
- Bottom sheet panel (7/9 screen height) with `Log / Network / System / App` tabs.
- Log tab captures `console.log/info/warn/error` without breaking original console behavior.
- Log tab supports keyword filter (debounced) across log text content.
- Network tab captures `XMLHttpRequest` requests/responses without breaking original request behavior.
- Network tab can rewrite requests through a JS-layer proxy. When proxy rewrite is active, Network entries show both the actual request URL and the original URL.
- Network tab supports `Retry`, which replays a request with the original method/url/headers/body (excluding unsafe forbidden headers).
- Network tab supports keyword filter (debounced) by request URL.
- `autoFollow` controls Log/Network bottom-follow behavior: on first open it scrolls to bottom, new entries auto-follow only when follow mode is active, dragging away from bottom pauses follow, and scrolling back to bottom or tapping `Bottom` re-enables follow (`autoFollow` must be `true`).
- System/App tabs read info from native module bridges (`NativeModules.Vconsole`).

<img src="./docs/snapshot/Simulator Screenshot - iPhone 17 Pro - 2026-03-27 at 01.22.36.png" width="360">
<img src="./docs/snapshot/Simulator Screenshot - iPhone 17 Pro - 2026-03-27 at 01.22.57.png" width="360">

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
