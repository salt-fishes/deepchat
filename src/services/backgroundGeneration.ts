import { Capacitor, registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'

interface GenerationPlugin {
  start(): Promise<void>
  stop(): Promise<void>
}

const Generation = registerPlugin<GenerationPlugin>('Generation')
let active = false
let running = false
let desired = false
let syncing: Promise<void> | undefined

const sync = (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    return Promise.resolve()
  }
  // Android 14+ restricts starting dataSync services from the background. Start
  // while the activity is still foreground so generation can survive app switch.
  desired = active
  if (syncing) {
    return syncing
  }
  syncing = (async () => {
    while (running !== desired) {
      const next = desired
      try {
        if (next) {
          await Generation.start()
        } else {
          await Generation.stop()
        }
        running = next
      } catch {
        break
      }
    }
  })().finally(() => {
    syncing = undefined
  })
  return syncing
}

if (Capacitor.isNativePlatform()) {
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('deepchat:resume'))
    }
    void sync()
  })
  window.addEventListener('pagehide', () => {
    active = false
    void sync()
  })
}

/** Start from the foreground and keep the service until generation ends. */
export const setBackgroundGenerationActive = (value: boolean) => {
  if (active === value) {
    return
  }
  active = value
  void sync()
}
