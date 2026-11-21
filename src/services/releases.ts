import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export const PROJECT_URL = 'https://github.com/salt-fishes/deepchat'
export const RELEASES_URL = `${PROJECT_URL}/releases`

export const readAppVersion = async () => {
  if (Capacitor.isNativePlatform()) {
    const { version, build } = await App.getInfo()
    return { version, label: `${version}(${build})` }
  }
  const version = document.querySelector<HTMLMetaElement>('meta[name="application-version"]')?.content
  if (!version) {throw new Error('App version is unavailable')}
  return { version, label: version }
}

const versionParts = (value: string) => {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/i.exec(value.trim())
  if (!match) {throw new Error('Unsupported version format')}
  const parts = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
  if (!parts.every(Number.isSafeInteger)) {throw new Error('Unsupported version format')}
  return parts
}

export const isNewerVersion = (latest: string, current: string) => {
  const a = versionParts(latest)
  const b = versionParts(current)
  for (const [i, part] of a.entries()) {
    const installed = b[i] ?? 0
    if (part !== installed) {
      return part > installed
    }
  }
  return false
}

export const checkLatestRelease = async (current: string, signal: AbortSignal) => {
  const response = await fetch('https://api.github.com/repos/salt-fishes/deepchat/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  })
  if (response.status === 429 || (response.status === 403 &&
    (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) {
    return { kind: 'rateLimited' } as const
  }
  if (response.status === 404) {return { kind: 'none' } as const}
  if (!response.ok) {throw new Error(`GitHub HTTP ${response.status}`)}
  const release = await response.json() as { tag_name?: unknown; body?: unknown; draft?: boolean; prerelease?: boolean; assets?: { name?: string; state?: string }[] }
  if (!release || typeof release.tag_name !== 'string' || release.draft || release.prerelease) {
    throw new Error('Invalid release response')
  }
  if (!isNewerVersion(release.tag_name, current)) {return { kind: 'current' } as const}
  const tag = encodeURIComponent(release.tag_name)
  const apk = 'deepchat-release-signed.apk'
  return {
    kind: 'new',
    version: release.tag_name,
    notes: typeof release.body === 'string' ? release.body : '',
    url: `${RELEASES_URL}/tag/${tag}`,
    apkUrl: release.assets?.some((asset) => asset.name === apk && asset.state === 'uploaded')
      ? `${RELEASES_URL}/download/${tag}/${apk}`
      : null,
  } as const
}
