import { Capacitor, registerPlugin } from '@capacitor/core'

export type NativeSharedImage = { path: string; name: string; mimeType: string }
export type NativeIntent =
  | { kind: 'new-chat' }
  | { kind: 'pick-images' }
  | { kind: 'take-photo' }
  | { kind: 'share'; text?: string; images: NativeSharedImage[] }

interface AppIntentsPlugin {
  consume(): Promise<{ intents: NativeIntent[] }>
}

const AppIntents = registerPlugin<AppIntentsPlugin>('AppIntents')

export const consumeNativeIntents = async (): Promise<NativeIntent[]> => {
  if (!Capacitor.isNativePlatform()) {
    return []
  }
  try {
    const { intents } = await AppIntents.consume()
    return intents ?? []
  } catch {
    return []
  }
}

export const nativeImageToFile = async (image: NativeSharedImage): Promise<File> => {
  const response = await fetch(Capacitor.convertFileSrc(image.path))
  if (!response.ok) {
    throw new Error('Shared image is not readable')
  }
  const blob = await response.blob()
  return new File([blob], image.name || `shared-${Date.now()}.jpg`, {
    type: blob.type || image.mimeType || 'image/jpeg',
  })
}
