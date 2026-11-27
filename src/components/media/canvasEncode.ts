const DEFAULT_QUALITY = 0.92
export const CANVAS_ENCODE_TIMEOUT = 8000

const dataUrlToBlob = (dataUrl: string): Blob => {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) {
    throw new Error('Invalid canvas data URL')
  }
  const header = dataUrl.slice(0, comma)
  const type = /data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg'
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type })
}

/**
 * Android WebView 在个别大图/后台切换场景下可能不触发 canvas.toBlob 回调。
 * 超时后用 toDataURL 同步兜底，避免确认 Promise 永久等待。
 */
export const encodeCanvas = (
  canvas: HTMLCanvasElement,
  quality = DEFAULT_QUALITY,
  timeout = CANVAS_ENCODE_TIMEOUT
): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined
    const finish = (blob: Blob | null, error?: unknown) => {
      if (settled) {
        return
      }
      settled = true
      globalThis.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Empty crop output'))
      }
    }
    timer = globalThis.setTimeout(() => {
      try {
        finish(dataUrlToBlob(canvas.toDataURL('image/jpeg', quality)))
      } catch (error) {
        finish(null, error)
      }
    }, timeout)
    try {
      canvas.toBlob((blob) => finish(blob), 'image/jpeg', quality)
    } catch (error) {
      finish(null, error)
    }
  })
