import React, { Component } from 'react';
import { StyleSheet, View } from 'react-native';

interface NetworkFragmentProps {
  width: number;
}

interface NetworkFragmentState {}

export default class NetworkFragment extends Component<
  NetworkFragmentProps,
  NetworkFragmentState
> {
  render() {
    return <View style={[styles.container, { width: this.props.width }]} />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'blue',
  },
});
