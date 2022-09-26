import React, { Component } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import EventBus, { Bus } from '../utils/EventBus';
import { ConsoleContext } from '../ConsoleContext';

interface LogFragmentProps {
  width: number;
}

interface LogFragmentState {
  consoleStack: any[];
}

export default class LogFragment extends Component<
  LogFragmentProps,
  LogFragmentState
> {
  static contextType = ConsoleContext;

  private bus: Bus;
  constructor(props: LogFragmentProps) {
    super(props);
    this.trackConsole();
    this.bus = EventBus.on<{ method: string; args: any[] }>(
      'console',
      (event) => {
        const { method, args } = event;
        switch (method) {
          case 'log':
            this.setState((prev) => {
              return {
                consoleStack: prev.consoleStack.concat(args),
              };
            });
            break;
          case 'warn':
            break;
        }
        return true;
      }
    );
    this.state = {
      consoleStack: [],
    };
  }

  componentWillUnmount() {
    this.bus.remove();
  }

  trackConsole = () => {
    const log = console.log;
    const warn = console.warn;
    console.log = function () {
      EventBus.emit('console', { method: 'log', args: arguments });
      // @ts-ignore
      log.apply(console, arguments);
    };
    console.warn = function () {
      EventBus.emit('console', { method: 'warn', args: arguments });
      // @ts-ignore
      warn.apply(console, arguments);
    };
  };

  handleClearClick = () => {
    this.setState({ consoleStack: [] });
  };

  handleHideClick = () => {
    this.context.hide();
  };

  renderItem = ({ item }: { item: any }) => {
    const value = Object.keys(item).reduce(
      (pre, cur) => pre + ' ' + JSON.stringify(item[cur]),
      ''
    );
    return (
      <View style={styles.item}>
        <Text selectable={true}>{value}</Text>
      </View>
    );
  };

  keyExtractor = (_: any, index: number) => {
    return index + '';
  };
  render() {
    return (
      <View style={[styles.container, { width: this.props.width }]}>
        <FlatList
          data={this.state.consoleStack}
          renderItem={this.renderItem}
          keyExtractor={this.keyExtractor}
        />
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={this.handleClearClick}
          >
            <Text>Clear</Text>
          </TouchableOpacity>
          <View style={styles.footerLine} />
          <TouchableOpacity
            style={styles.footerButton}
            onPress={this.handleHideClick}
          >
            <Text>Hide</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    borderBottomWidth: 1,
    borderBottomColor: '#d5d5d5',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  footer: {
    height: 40,
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ededed',
  },
  footerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLine: {
    height: '70%',
    width: 1,
    backgroundColor: '#d5d5d5',
  },
});
