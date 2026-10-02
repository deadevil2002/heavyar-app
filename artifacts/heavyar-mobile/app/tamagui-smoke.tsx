import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TamaguiSmokeCard } from '@/components/ui/tamagui-smoke-card';

export default function TamaguiSmokeScreen() {
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.cardWrap}>
        <TamaguiSmokeCard direction="rtl" />
      </View>
      <View style={styles.cardWrap}>
        <TamaguiSmokeCard direction="ltr" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#011130',
  },
  content: {
    alignItems: 'center',
    gap: 20,
    justifyContent: 'center',
    minHeight: '100%',
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  cardWrap: {
    width: '100%',
  },
});
