import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "هيفيار - Heavyar" }} />
      <View style={styles.container}>
        <Text style={styles.title}>الصفحة غير موجودة</Text>
        <Text style={styles.subtitle}>Page not found</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>العودة للرئيسية / Go Home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  link: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: Colors.gold,
    borderRadius: 12,
  },
  linkText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.primary,
  },
});
