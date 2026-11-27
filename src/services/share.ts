import { Capacitor, registerPlugin } from '@capacitor/core'

interface SharePlugin {
  shareImage(options: { data: string; mimeType: string; name: string }): Promise<void>
  saveImage(options: { data: string; mimeType: string; name: string }): Promise<{ saved: boolean }>
  shareText(options: { text: string; title?: string }): Promise<void>
}

const Share = registerPlugin<SharePlugin>('Share')

const encode = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })

const payload = async (file: File) => ({
  data: await encode(file),
  mimeType: file.type || 'image/png',
  name: file.name || 'deepchat-share.png',
})

export const shareImageFile = async (file: File) => {
  if (Capacitor.isNativePlatform()) {
    await Share.shareImage(await payload(file))
    return
  }
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: file.name })
    return
  }
  throw new Error('File sharing is unavailable')
}

export const saveImageFile = async (file: File): Promise<boolean> => {
  if (Capacitor.isNativePlatform()) {
    return (await Share.saveImage(await payload(file))).saved
  }
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export const shareText = async (text: string, title?: string) => {
  if (Capacitor.isNativePlatform()) {
    await Share.shareText({ text, title })
    return
  }
  if (navigator.share) {
    await navigator.share({ text, title })
    return
  }
  if (!(await copyTextFallback(text))) {
    throw new Error('Text sharing is unavailable')
  }
}

const copyTextFallback = async (text: string) => {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  return copied
}
