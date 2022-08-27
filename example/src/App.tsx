import * as React from 'react';
import { StyleSheet, View, Button } from 'react-native';
import VConsole from 'react-native-vconsole';

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    backgroundColor: '#9632d4',
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
});
