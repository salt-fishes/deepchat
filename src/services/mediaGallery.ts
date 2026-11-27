import { Capacitor, registerPlugin } from '@capacitor/core'

/** 设备相册最近图片；thumbnail 为可直接用于 <img src> 的 JPEG dataURL */
export type RecentPhoto = { id: string; thumbnail: string }
export type NativePickedPhoto = { path: string; name: string; mimeType: string }

interface MediaGalleryPlugin {
  getRecentPhotos(options?: {
    limit?: number
    requestPermission?: boolean
  }): Promise<{ photos: RecentPhoto[] }>
  getPhoto(options: { id: string }): Promise<{ data: string; mimeType: string }>
  getPhotoFile(options: { id: string }): Promise<NativePickedPhoto>
  takePhoto(): Promise<{ data: string; mimeType: string }>
  takePhotoFile(): Promise<NativePickedPhoto>
  pickPhotos(): Promise<{ photos: NativePickedPhoto[] }>
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

export const refreshRecentPhotos = (requestPermission = false): Promise<RecentPhoto[]> => {
  pending ??= getRecentPhotos(RECENT_PHOTO_LIMIT, requestPermission)
    .then((photos) => {
      recent = photos.length ? { photos, expires: Date.now() + RECENT_PHOTO_TTL } : undefined
      return photos
    })
    .finally(() => {
      pending = undefined
    })
  return pending
}

/**
 * 最近图片列表。默认只在权限已授予时查询，不因打开附件面板强制申请整库权限；
 * 权限被拒、尚未授权或查询失败时返回空数组。
 */
export const getRecentPhotos = async (
  limit = 24,
  requestPermission = false
): Promise<RecentPhoto[]> => {
  if (!isMediaGalleryAvailable()) {
    return []
  }
  try {
    const { photos } = await MediaGallery.getRecentPhotos({ limit, requestPermission })
    return (photos ?? []).map((photo) => ({
      ...photo,
      thumbnail: photo.thumbnail.startsWith('data:')
        ? photo.thumbnail
        : `data:image/jpeg;base64,${photo.thumbnail}`,
    }))
  } catch {
    // 权限被拒或系统查询失败：按无照片处理
    return []
  }
}

const nativePhotoToFile = async (photo: NativePickedPhoto): Promise<File> => {
  const response = await fetch(Capacitor.convertFileSrc(photo.path))
  if (!response.ok) {
    throw new Error('Picked photo is not readable')
  }
  const blob = await response.blob()
  return new File([blob], photo.name || `picked_${Date.now()}.jpg`, {
    type: blob.type || photo.mimeType || 'image/jpeg',
  })
}

const cancelled = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /cancel/i.test(message)
}

/** 原生系统照片选择器：取消返回空数组，失败抛错供 Web 回退。 */
export const pickPhotoFiles = async (): Promise<File[]> => {
  if (!isMediaGalleryAvailable()) {
    throw new Error('unavailable')
  }
  try {
    const { photos } = await MediaGallery.pickPhotos()
    return await Promise.all((photos ?? []).map(nativePhotoToFile))
  } catch (error) {
    if (cancelled(error)) {
      return []
    }
    throw error
  }
}

/** 最近图片快捷入口：原生复制/规范化到 cache 后直接转 File，不再经过 base64。 */
export const getPhotoFile = async (id: string): Promise<File | null> => {
  if (!isMediaGalleryAvailable()) {
    return null
  }
  try {
    return await nativePhotoToFile(await MediaGallery.getPhotoFile({ id }))
  } catch {
    return null
  }
}

/** 调起系统相机拍照；用户取消时返回 null，其他失败时抛错由调用方回退。 */
export const takePhotoFile = async (): Promise<File | null> => {
  if (!isMediaGalleryAvailable()) {
    throw new Error('unavailable')
  }
  try {
    return await nativePhotoToFile(await MediaGallery.takePhotoFile())
  } catch (error) {
    if (cancelled(error)) {
      return null
    }
    throw error
  }
}

/** 兼容旧调用：按相册 id 取原图 base64；文件过大时原生层已降采样。 */
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

/** 兼容旧调用：调起系统相机拍照并返回 dataURL。 */
export const takePhotoDataUrl = async (): Promise<string | null> => {
  if (!isMediaGalleryAvailable()) {
    throw new Error('unavailable')
  }
  try {
    const { data, mimeType } = await MediaGallery.takePhoto()
    return data ? `data:${mimeType};base64,${data}` : null
  } catch (error) {
    if (cancelled(error)) {
      return null
    }
    throw error
  }
}
