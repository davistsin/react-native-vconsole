import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  PanResponderInstance,
} from 'react-native';
import ValueXY = Animated.ValueXY;
import VConsolePanel from './VConsolePanel';
import { ConsoleContext } from './ConsoleContext';

interface VConsoleProps {}

interface VConsoleState {
  panelVisible: boolean;
}

export default class VConsole extends Component<VConsoleProps, VConsoleState> {
  private pan: ValueXY;
  private panResponder: PanResponderInstance;

  constructor(props: VConsoleProps) {
    super(props);
    this.state = {
      panelVisible: false,
    };
    this.pan = new Animated.ValueXY();
    this.panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: this.pan.x, dy: this.pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        this.pan.extractOffset();
      },
    });
  }

  handlePanelHide = () => {
    this.setState({ panelVisible: false });
  };

  renderVConsoleFloating() {
    return (
      <Animated.View
        style={[
          styles.floating,
          {
            transform: [{ translateX: this.pan.x }, { translateY: this.pan.y }],
          },
        ]}
        {...this.panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.floatingPress}
          onPress={() => {
            this.setState({ panelVisible: !this.state.panelVisible });
          }}
        >
          <Text style={styles.floatingText}>vConsole</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  render() {
    const { panelVisible } = this.state;
    return (
      <>
        {this.props.children}
        {this.renderVConsoleFloating()}
        <ConsoleContext.Provider value={{ hide: this.handlePanelHide }}>
          <VConsolePanel
            visible={panelVisible}
            onClose={this.handlePanelHide}
          />
        </ConsoleContext.Provider>
      </>
    );
  }
}

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    backgroundColor: 'green',
    borderRadius: 4,
    bottom: 48,
    right: 32,
    width: 100,
    height: 39,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    // elevation: 5,
  },
  floatingPress: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingText: {
    color: '#FFFFFF',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'red',
  },
});
