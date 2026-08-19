import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" options={{ gestureEnabled: true }} />
      <Stack.Screen name="verify" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
