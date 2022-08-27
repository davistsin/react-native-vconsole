# react-native-vconsole

developer debug panel

## Installation

Not yet. In programing.

```sh
npm install react-native-vconsole
```

## Usage

```js
import VConsole from "react-native-vconsole";

export default function App() {
  return (
    <VConsole>
      <View style={styles.container}>
        <Button
          title="test log"
          onPress={() => {
            console.log('this is log', 'kkk', 111, { a: 1 });
          }}
        />
        <Button
          title="test fetch"
          onPress={() => {
            console.log('this is log', 'kkk', 111, { a: 1 });
          }}
        />
      </View>
    </VConsole>
  );
}
```

## Feature

### Log

| console method | support |
|:---------------|:--------|
| assert         | -       |
| clear          | ing     |
| context        | -       |
| count          | ing     |
| countReset     | ing     |
| debug          | -       |
| dir            | -       |
| dirxml         | -       |
| error          | ing     |
| group          | -       |
| groupCollapsed | -       |
| groupEnd       | -       |
| info           | ing     |
| log            | ✅       |
| memory         | -       |
| profile        | -       |
| profileEnd     | -       |
| table          | ing     |
| time           | ing     |
| timeEnd        | ing     |
| timeLog        | ing     |
| timeStamp      | ing     |
| trace          | -       |
| warn           | ing     |


### Network

In programing.

### System

| Button         | support |
|:---------------|:--------|
| Developer Menu | ing     |
| Relaunch       | ing     |

Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
