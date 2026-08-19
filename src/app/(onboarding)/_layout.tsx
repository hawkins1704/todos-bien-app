import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="profile" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="contacts" />
      <Stack.Screen name="plan" />
      <Stack.Screen name="ready" />
    </Stack>
  );
}
