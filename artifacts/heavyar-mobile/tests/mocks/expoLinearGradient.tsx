import React from 'react';
import { View } from 'react-native';

export function LinearGradient({ children, ...props }: React.ComponentProps<typeof View> & { colors?: readonly string[]; locations?: readonly number[] }) {
  const { colors: _colors, locations: _locations, ...viewProps } = props;
  return <View {...viewProps}>{children}</View>;
}
