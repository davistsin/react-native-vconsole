import React, { PureComponent } from 'react';
import {
  Animated,
  Dimensions,
  InteractionManager,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import PanelBody from './components/PanelBody';

interface VConsolePanelProps {
  visible: boolean;
  onClose: () => any;
}

interface VConsolePanelState {
  bgVisible: boolean;
  bgFadeAnim: Animated.Value;
  windowOffset: Animated.Value;
}

export default class VConsolePanel extends PureComponent<
  VConsolePanelProps,
  VConsolePanelState
> {
  constructor(props: VConsolePanelProps) {
    super(props);
    this.state = {
      bgVisible: false,
      bgFadeAnim: new Animated.Value(0),
      windowOffset: new Animated.Value(this.getPanelHeight()),
    };
  }

  componentDidUpdate() {
    if (this.props.visible && !this.state.bgVisible) {
      InteractionManager.runAfterInteractions(() => {
        this.setState({ bgVisible: true });
      });
    }
    if (!this.props.visible && this.state.bgVisible) {
      InteractionManager.runAfterInteractions(() => {
        this.setState({ bgVisible: false });
      });
    }
    Animated.timing(this.state.windowOffset, {
      useNativeDriver: false,
      toValue: this.props.visible ? 0 : this.getPanelHeight(),
      duration: 300,
    }).start();
  }

  getPanelHeight() {
    return Dimensions.get('window').height * 0.8;
  }

  handleEmptyAreaClick = () => {
    this.props.onClose();
  };

  render() {
    return (
      <>
        {this.state.bgVisible && (
          <View style={styles.bg}>
            <TouchableOpacity
              style={{ width: '100%', height: '100%' }}
              onPress={this.handleEmptyAreaClick}
            />
          </View>
        )}
        <Animated.View
          style={[
            styles.body,
            { width: '100%', height: this.getPanelHeight() },
            { transform: [{ translateY: this.state.windowOffset }] },
          ]}
        >
          <PanelBody />
        </Animated.View>
      </>
    );
  }
}

const styles = StyleSheet.create({
  bg: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  body: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
  },
});
