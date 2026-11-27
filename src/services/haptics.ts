import { Capacitor, registerPlugin } from '@capacitor/core'

type HapticStyle = 'light' | 'medium'

interface SystemUiPlugin {
  haptic(options: { style: HapticStyle }): Promise<void>
  getFontScale(): Promise<{ scale: number }>
}

const SystemUi = registerPlugin<SystemUiPlugin>('SystemUi')

/** Light touch feedback without requiring the Android VIBRATE permission. */
export const haptic = (style: HapticStyle = 'light') => {
  if (Capacitor.isNativePlatform()) {
    void SystemUi.haptic({ style }).catch(() => {})
    return
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(style === 'light' ? 8 : 12)
  }
}

export const getSystemFontScale = async (): Promise<number> => {
  if (!Capacitor.isNativePlatform()) {
    return 1
  }
  try {
    const { scale } = await SystemUi.getFontScale()
    return Number.isFinite(scale) && scale > 0 ? scale : 1
  } catch {
    return 1
  }
}
