// apps/mobile/app/_layout.tsx
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Host } from '@expo/ui'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Host style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }} />
        </Host>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
