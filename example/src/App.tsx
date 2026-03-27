import { useCallback, useEffect } from 'react';
import { Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { VConsole } from 'react-native-vconsole';

export default function App() {
  const sendNetworkRequest = useCallback(async () => {
    try {
      await fetch('https://jsonplaceholder.typicode.com/posts/1', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('network request failed', error);
    }
  }, []);

  useEffect(() => {
    console.log('vConsole mounted', { from: 'example app' });
    console.info('console.info message');
    console.warn('console.warn message');
    console.error('console.error message');

    const interval = setInterval(() => {
      sendNetworkRequest();
      console.log('console.log message', { from: 'example app' });
    }, 5000);

    return () => clearInterval(interval);
  }, [sendNetworkRequest]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>react-native-vconsole example</Text>
        <Button
          title="Generate Logs"
          onPress={() => console.log({ nested: { hello: 'world' } })}
        />
        <View style={styles.spacer} />
        <Button title="Send Network Request" onPress={sendNetworkRequest} />
      </View>
      <VConsole
        enable={true}
        autoFollow={true}
        exclude={{
          domains: ['localhost:8081'],
          ip: true,
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  spacer: {
    height: 12,
  },
});
