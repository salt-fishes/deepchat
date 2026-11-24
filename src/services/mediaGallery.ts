import { Capacitor, registerPlugin } from '@capacitor/core'

/** 设备相册最近图片；thumbnail 为可直接用于 <img src> 的 JPEG dataURL */
export type RecentPhoto = { id: string; thumbnail: string }

interface MediaGalleryPlugin {
  getRecentPhotos(options?: { limit?: number }): Promise<{ photos: RecentPhoto[] }>
  getPhoto(options: { id: string }): Promise<{ data: string; mimeType: string }>
  takePhoto(): Promise<{ data: string; mimeType: string }>
}

const MediaGallery = registerPlugin<MediaGalleryPlugin>('MediaGallery')

/** 仅 Android APK 内可用（依赖原生 MediaGalleryPlugin）；Web 端隐藏最近图片行 */
export const isMediaGalleryAvailable = (): boolean => Capacitor.isNativePlatform()

export const RECENT_PHOTO_LIMIT = 24
const RECENT_PHOTO_TTL = 60_000
let recent: { photos: RecentPhoto[]; expires: number } | undefined
let pending: Promise<RecentPhoto[]> | undefined

/** In-memory only: show the last thumbnails while refreshing the native album. */
export const getCachedRecentPhotos = (): RecentPhoto[] =>
  recent && recent.expires > Date.now() ? recent.photos : []

export const refreshRecentPhotos = (): Promise<RecentPhoto[]> => {
  pending ??= getRecentPhotos(RECENT_PHOTO_LIMIT).then((photos) => {
    recent = photos.length ? { photos, expires: Date.now() + RECENT_PHOTO_TTL } : undefined
    return photos
  }).finally(() => { pending = undefined })
  return pending
}

/** 最近图片列表；权限被拒或查询失败时返回空数组 */
export const getRecentPhotos = async (limit = 24): Promise<RecentPhoto[]> => {
  if (!isMediaGalleryAvailable()) {
    return []
  }
  try {
    const { photos } = await MediaGallery.getRecentPhotos({ limit })
    // 原生层返回裸 base64，这里拼上 dataURL 前缀
    return (photos ?? []).map((photo) => ({
      ...photo,
      thumbnail: `data:image/jpeg;base64,${photo.thumbnail}`,
    }))
  } catch {
    // 权限被拒或系统查询失败：按无照片处理
    return []
  }
}

/** 按相册 id 取原图 base64；文件过大时原生层已降采样 */
export const getPhotoDataUrl = async (id: string): Promise<string | null> => {
  if (!isMediaGalleryAvailable()) {
    return null
  }
  try {
    const { data, mimeType } = await MediaGallery.getPhoto({ id })
    return data ? `data:${mimeType};base64,${data}` : null
  } catch {
    return null
  }
}

/**
 * 调起系统相机拍照并返回 dataURL；用户取消时返回 null，其他失败时抛错由调用方回退。
 * WebView 的 <input capture> 在 Android 上只会弹通用文件选择器，所以拍照必须走这条原生链路。
 */
export const takePhotoDataUrl = async (): Promise<string | null> => {
  if (!isMediaGalleryAvailable()) {
    throw new Error('unavailable')
  }
  try {
    const { data, mimeType } = await MediaGallery.takePhoto()
    return data ? `data:${mimeType};base64,${data}` : null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('cancelled')) {
      return null
    }
    throw error
  }
}
