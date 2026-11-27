import { Capacitor, registerPlugin } from '@capacitor/core'

interface ExternalLinksPlugin {
  openInApp(options: { url: string; title?: string; dark?: boolean }): Promise<void>
  openExternal(options: { url: string }): Promise<void>
}

const ExternalLinks = registerPlugin<ExternalLinksPlugin>('ExternalLinks')

export const sanitizeWebUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Open inside the app. Web builds dispatch to the internal link viewer. */
export const openInAppLink = (value: string, title?: string): boolean => {
  const url = sanitizeWebUrl(value)
  if (!url) {
    return false
  }
  if (Capacitor.isNativePlatform()) {
    void ExternalLinks.openInApp({
      url,
      title,
      dark: document.body.hasAttribute('data-ds-dark-theme'),
    }).catch(() => {})
  } else {
    window.dispatchEvent(new CustomEvent('deepchat:open-link', { detail: { url, title } }))
  }
  return true
}

/** Explicit escape hatch to the user's default browser. */
export const openExternalLink = (value: string): boolean => {
  const url = sanitizeWebUrl(value)
  if (!url) {
    return false
  }
  if (Capacitor.isNativePlatform()) {
    void ExternalLinks.openExternal({ url }).catch(() => {})
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  return true
}
