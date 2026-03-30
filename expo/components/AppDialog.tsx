import React, { useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Animated, Dimensions } from 'react-native';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface DialogButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'danger';
}

interface AppDialogProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: DialogButton[];
  onClose: () => void;
}

export default React.memo(function AppDialog({ visible, title, message, buttons, onClose }: AppDialogProps) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const stackedButtons = buttons.length > 2;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 65,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim]);

  const handleButtonPress = useCallback((btn: DialogButton) => {
    onClose();
    btn.onPress?.();
  }, [onClose]);

  const getButtonStyle = (style?: 'default' | 'cancel' | 'danger') => {
    switch (style) {
      case 'danger':
        return styles.dangerButton;
      case 'cancel':
        return styles.cancelButton;
      default:
        return styles.defaultButton;
    }
  };

  const getButtonTextStyle = (style?: 'default' | 'cancel' | 'danger') => {
    switch (style) {
      case 'danger':
        return styles.dangerButtonText;
      case 'cancel':
        return styles.cancelButtonText;
      default:
        return styles.defaultButtonText;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.dialog,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <View style={styles.accentBar} />
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </View>
          <View style={styles.divider} />
          <View style={[styles.buttonsRow, buttons.length === 1 && styles.singleButton, stackedButtons && styles.stackedButtonsRow]}>
            {buttons.map((btn, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.button,
                  getButtonStyle(btn.style),
                  !stackedButtons && buttons.length > 1 && styles.flexButton,
                  stackedButtons && styles.fullWidthButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => handleButtonPress(btn)}
              >
                <Text
                  style={[styles.buttonText, getButtonTextStyle(btn.style)]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {btn.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});

const DIALOG_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  dialog: {
    width: DIALOG_WIDTH,
    backgroundColor: Colors.card,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accentBar: {
    height: 3,
    backgroundColor: Colors.gold,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
  },
  buttonsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
  stackedButtonsRow: {
    flexDirection: 'column',
  },
  singleButton: {
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  flexButton: {
    flex: 1,
  },
  fullWidthButton: {
    width: '100%',
    minWidth: undefined,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  defaultButton: {
    backgroundColor: Colors.gold,
  },
  cancelButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  dangerButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  defaultButtonText: {
    color: Colors.primary,
  },
  cancelButtonText: {
    color: Colors.textSecondary,
  },
  dangerButtonText: {
    color: Colors.error,
  },
});
