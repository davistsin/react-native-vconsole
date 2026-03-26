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
        exclude={{
          domains: ['localhost:8081'],
          ip: true,
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
| `exclude` | `{ domains?: string[]; ip?: boolean }` | `{}` | Network capture exclusion rules. |
| `exclude.domains` | `string[]` | `[]` | Hosts to exclude from Network tab capture, keeping previous host-based matching behavior (e.g. `localhost:8081`). |
| `exclude.ip` | `boolean` | `false` | When `true`, requests whose hostname is an IP address (IPv4/IPv6) will be skipped in Network tab capture. |

## Features

- Draggable floating button (`vConsole`) with screen-boundary constraints.
- Bottom sheet panel (7/9 screen height) with `Log / Network / System / App` tabs.
- Log tab captures `console.log/info/warn/error` without breaking original console behavior.
- Log tab supports keyword filter (debounced) across log text content.
- Network tab captures `XMLHttpRequest` requests/responses without breaking original request behavior.
- Network tab supports `Retry`, which replays a request with the original method/url/headers/body (excluding unsafe forbidden headers).
- Network tab supports keyword filter (debounced) by request URL.
- System/App tabs read info from native module bridges (`NativeModules.Vconsole`). Display System/App infomation.

<img src="./docs/snapshot/Simulator Screenshot - iPhone 17 Pro - 2026-03-27 at 01.22.36.png" width="360">
<img src="./docs/snapshot/Simulator Screenshot - iPhone 17 Pro - 2026-03-27 at 01.22.57.png" width="360">

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
