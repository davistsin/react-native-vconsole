import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  NativeModules,
} from 'react-native';

const { Vconsole } = NativeModules;

interface SystemFragmentProps {
  width: number;
}

interface SystemFragmentState {}

export default class SystemFragment extends Component<
  SystemFragmentProps,
  SystemFragmentState
> {
  showDevMenu = () => {
    Vconsole.showDevOptionsDialog();
  };
  reloadApp = () => {
    if (__DEV__) {
    }
  };
  renderButton(title: string, onPress: () => void) {
    return (
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.7}
        onPress={onPress}
      >
        <Text style={styles.buttonText}>{title}</Text>
      </TouchableOpacity>
    );
  }
  render() {
    return (
      <View style={[styles.container, { width: this.props.width }]}>
        {__DEV__ && this.renderButton('Developer Menu', this.showDevMenu)}
        {this.renderButton('Reload app', this.reloadApp)}
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
