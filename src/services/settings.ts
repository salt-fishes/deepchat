import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import type { ThinkingEffort } from './api/types.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'
export type ChatFontSize = 'small' | 'default' | 'large' | 'extraLarge'
export const chatFontOffset = { small: -2, default: 0, large: 2, extraLarge: 4 } as const

/** 深度思考强度：仅深度思考开启时生效，对应 output_config.effort */
export type { ThinkingEffort }

/** 本机设置，存 localStorage：API Key、语言、主题、位置、朗读音色、深度思考与智能搜索开关、侧边栏收起状态 */
type Settings = {
  apiKey: string | null
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  thinkingEffort: ThinkingEffort
  compactThinking: boolean
  search: boolean
  siderCollapsed: boolean
  chatFontSize: ChatFontSize
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  thinkingEffort: 'chat-demo:thinking-effort',
  compactThinking: 'chat-demo:compact-thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
  chatFontSize: 'deepchat:chat-font-size',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

/** 未保存过时使用服务端默认档位 high（标准） */
const initialThinkingEffort = (): ThinkingEffort => {
  const saved = read(KEYS.thinkingEffort)
  return saved === 'low' || saved === 'max' ? saved : 'high'
}

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  thinkingEffort: initialThinkingEffort(),
  compactThinking: read(KEYS.compactThinking) !== 'false',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  chatFontSize: (() => {
    const saved = read(KEYS.chatFontSize)
    return saved === 'small' || saved === 'large' || saved === 'extraLarge' ? saved : 'default'
  })(),
}))

export const setChatFontSize = (chatFontSize: ChatFontSize) => {
  write(KEYS.chatFontSize, chatFontSize)
  useSettings.setState({ chatFontSize })
}

type ChatPreferences = Pick<Settings, 'thinking' | 'thinkingEffort' | 'search'>
export const useChatPreferences = create(() => new Map<string | null, Partial<ChatPreferences>>())

export const setChatPreferences = (id: string | null, patch: Partial<ChatPreferences>) =>
  useChatPreferences.setState((current) => new Map(current).set(id, { ...current.get(id), ...patch }), true)

export const clearChatPreferences = (id: string | null) => {
  const next = new Map(useChatPreferences.getState())
  if (next.delete(id)) {useChatPreferences.setState(next, true)}
}

export const moveChatPreferences = (id: string) => {
  const next = new Map(useChatPreferences.getState())
  const draft = next.get(null)
  if (draft) {
    next.delete(null)
    next.set(id, draft)
    useChatPreferences.setState(next, true)
  }
}

export const getChatPreferences = (id: string | null): ChatPreferences => ({
  ...useSettings.getState(), ...useChatPreferences.getState().get(id),
})

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = (apiKey: string | null) => {
  write(KEYS.apiKey, apiKey)
  useSettings.setState({ apiKey })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setThinkingEffort = (thinkingEffort: ThinkingEffort) => {
  write(KEYS.thinkingEffort, thinkingEffort)
  useSettings.setState({ thinkingEffort })
}

export const setCompactThinking = (compactThinking: boolean) => {
  write(KEYS.compactThinking, String(compactThinking))
  useSettings.setState({ compactThinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}
