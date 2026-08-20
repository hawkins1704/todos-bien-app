import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" options={{ gestureEnabled: true }} />
      <Stack.Screen name="sign-up" options={{ gestureEnabled: true }} />
      <Stack.Screen name="confirm-email" options={{ gestureEnabled: true }} />
      <Stack.Screen name="forgot-password" options={{ gestureEnabled: true }} />
      <Stack.Screen name="reset-password" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
