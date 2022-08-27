import React, { Component } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SystemFragmentProps {
  width: number;
}

interface SystemFragmentState {}

export default class SystemFragment extends Component<
  SystemFragmentProps,
  SystemFragmentState
> {
  render() {
    return (
      <View style={[styles.container, { width: this.props.width }]}>
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.7}
          onPress={() => {}}
        >
          <Text style={styles.buttonText}>Developer Menu</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    marginTop: 16,
    marginLeft: 16,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
  },
});
