import React, { Component } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LogFragment from './LogFragment';
import NetworkFragment from './NetworkFragment';
import SystemFragment from './SystemFragment';

interface PanelBodyProps {}
interface PanelBodyState {
  bodyWidth: number;
  tabIndex: number;
}

export default class PanelBody extends Component<
  PanelBodyProps,
  PanelBodyState
> {
  private scrollView: ScrollView | null = null;

  constructor(props: PanelBodyProps) {
    super(props);
    this.state = {
      bodyWidth: 0,
      tabIndex: 0,
    };
  }

  handleTabClick = (name: string) => {
    switch (name) {
      case 'log':
        this.scrollView?.scrollTo({ x: 0, y: 0, animated: false });
        this.setState({ tabIndex: 0 });
        break;
      case 'network':
        this.scrollView?.scrollTo({
          x: this.state.bodyWidth,
          y: 0,
          animated: false,
        });
        this.setState({ tabIndex: 1 });
        break;
      case 'system':
        this.scrollView?.scrollToEnd({ animated: false });
        this.setState({ tabIndex: 2 });
        break;
    }
  };
  render() {
    const { bodyWidth, tabIndex } = this.state;
    return (
      <View style={styles.container}>
        <View style={styles.tabLayout}>
          <TouchableOpacity
            style={tabIndex === 0 ? styles.tabItemFocus : styles.tabItem}
            onPress={() => {
              this.handleTabClick('log');
            }}
          >
            <Text>Log</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={tabIndex === 1 ? styles.tabItemFocus : styles.tabItem}
            onPress={() => {
              this.handleTabClick('network');
            }}
          >
            <Text>Network</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={tabIndex === 2 ? styles.tabItemFocus : styles.tabItem}
            onPress={() => {
              this.handleTabClick('system');
            }}
          >
            <Text>System</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          ref={(c) => {
            this.scrollView = c;
          }}
          scrollEnabled={false}
          pagingEnabled={true}
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          onLayout={(event) => {
            this.setState({
              bodyWidth: event.nativeEvent.layout.width,
            });
          }}
        >
          <LogFragment width={bodyWidth} />
          <NetworkFragment width={bodyWidth} />
          <SystemFragment width={bodyWidth} />
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  tabLayout: {
    width: '100%',
    height: 50,
    display: 'flex',
    flexDirection: 'row',
    borderBottomColor: '#d5d5d5',
    borderBottomWidth: 1,
  },
  tabItem: {
    paddingHorizontal: 20,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#d5d5d5',
    backgroundColor: '#ededed',
  },
  tabItemFocus: {
    paddingHorizontal: 20,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e8e8e8',
    backgroundColor: '#ffffff',
  },
});
