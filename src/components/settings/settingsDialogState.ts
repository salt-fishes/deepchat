import { create } from 'zustand'
import { useSettings } from '../../services/settings.js'

export type SettingsSection = 'general' | 'api' | 'data' | 'language' | 'appearance' |
  'font' | 'personalization' | 'voice' | 'update' | 'terms' | 'help' | 'usage'

/** 设置弹窗：侧边栏底部、没有 API Key 时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
  direction: null as 'forward' | 'back' | null,
}))

export const openSettings = (section: SettingsSection) =>
  useSettingsDialog.setState({ open: true, section, direction: null })

export const closeSettings = () => useSettingsDialog.setState({ open: false })
export const navigateSettings = (section: SettingsSection, direction: 'forward' | 'back' = 'forward') =>
  useSettingsDialog.setState({ section, direction })

/** 没有 API Key 时直接打开 API 管理。 */
export const ensureApiKey = () => {
  if (useSettings.getState().apiKey) {
    return true
  }
  openSettings('api')
  return false
}
