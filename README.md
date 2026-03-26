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
- Network tab captures `XMLHttpRequest` requests/responses without breaking original request behavior.
- System/App tabs read info from native module bridges (`NativeModules.Vconsole`).

![snapshot](./docs/snapshot/Simulator%20Screenshot%20-%20iPhone%2017%20Pro.png)

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
