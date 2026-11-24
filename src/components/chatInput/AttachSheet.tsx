import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useAnchoredPosition } from '../base/anchored.js'
import { registerOverlayToken } from '../base/Modal.js'
import {
  IconCameraOutline16,
  IconCheckOutline16,
  IconPaperclipOutline16,
  IconPhotoOutline16,
} from '../base/icons.js'
import { ACCEPT } from '../../services/attachments.js'
import {
  getPhotoDataUrl,
  getCachedRecentPhotos,
  isMediaGalleryAvailable,
  refreshRecentPhotos,
  takePhotoDataUrl,
  type RecentPhoto,
} from '../../services/mediaGallery.js'
import { openCropper } from './imageCropperState.js'
import { useTranslate } from '../../i18n/index.js'
import type { DraftAttachment } from '../../services/chat/drafts.js'
import { showToast } from '../base/toastState.js'
import styles from './AttachSheet.module.css'

/** 由 ACCEPT_FILE_EXTS 过滤出图片后缀；相机/相册入口只暴露校验管线真正接受的格式 */
const IMAGE_ACCEPT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']
  .map((ext) => `.${ext}`)
  .join(',')

export const AttachSheet = ({
  open,
  onClose,
  onFiles,
  attachments,
  onRemove,
  anchorRef,
  isMobile,
}: {
  open: boolean
  onClose: () => void
  onFiles: (files: File[], recentPhotoId?: string) => boolean
  attachments: DraftAttachment[]
  onRemove: (id: string) => void
  /** 桌面 popover 的锚点（加号按钮） */
  anchorRef?: React.RefObject<HTMLButtonElement | null>
  isMobile: boolean
}) => {
  const t = useTranslate()
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mobileSheetRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const popoverVisible = useExitPresence(open && !isMobile ? true : null, popoverRef)
  const [photos, setPhotos] = useState<RecentPhoto[]>([])
  const [photosState, setPhotosState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const pendingPhoto = useRef<AbortController | null>(null)
  const [adding, setAdding] = useState(false)
  const { floatingRef, position } = useAnchoredPosition<HTMLButtonElement, HTMLDivElement>(
    !!popoverVisible && !isMobile,
    // 桌面端贴加号上方展开；锚点为外部传入的加号按钮
    {
      side: 'top',
      align: 'end',
      offset: 8,
      maxHeight: 420,
      minSpace: 240,
      anchorRef,
    }
  )

  useLayoutEffect(() => {
    if (mobileSheetRef.current) {
      mobileSheetRef.current.inert = !open
    }
  }, [open, isMobile])

  useEffect(() => {
    if (!open) {
      setAdding(false)
      return
    }
    return () => {
      pendingPhoto.current?.abort()
      pendingPhoto.current = null
    }
  }, [open])

  // 首帧使用有效缓存，后台刷新；权限被拒或无照片则整行隐藏。
  useLayoutEffect(() => {
    if (!open) {
      return
    }
    if (!isMediaGalleryAvailable()) {
      setPhotosState('unavailable')
      return
    }
    let cancelled = false
    const cached = getCachedRecentPhotos()
    setPhotos(cached)
    setPhotosState(cached.length ? 'ready' : 'loading')
    refreshRecentPhotos().then((list) => {
      if (cancelled) {
        return
      }
      setPhotos(list)
      setPhotosState(list.length > 0 ? 'ready' : 'unavailable')
    })
    return () => {
      cancelled = true
    }
  }, [open])

  // 返回键关闭（复用弹窗关闭栈）；仅打开时入栈
  useEffect(() => {
    if (!open) {
      return
    }
    return registerOverlayToken(onClose)
  }, [open, onClose])

  const handleFiles = (files: FileList | null) => {
    const list = Array.from(files ?? [])
    if (list.length === 0) {
      return
    }
    if (onFiles(list) && !isMobile) {
      onClose()
    }
  }

  /**
   * 拍照：优先原生相机 intent（WebView 的 <input capture> 在 Android 上只弹文件选择器）；
   * 原生调起失败（无相机应用等）才回退到 WebView 文件选择。
   * 拍完进入全屏回览/剪裁界面，确认后才加入草稿，取消则丢弃。
   */
  const takeCameraPhoto = async () => {
    if (isMediaGalleryAvailable()) {
      try {
        const dataUrl = await takePhotoDataUrl()
        if (!dataUrl) {
          return
        }
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' })
        const result = await openCropper(file, 'preview')
        if (!result) {
          return
        }
        if (onFiles([result]) && !isMobile) {
          onClose()
        }
        return
      } catch {
        // 原生链路不可用：走回退
      }
    }
    cameraInputRef.current?.click()
  }

  const togglePhoto = async (id: string, attachmentId?: string) => {
    if (pendingPhoto.current) {
      return
    }
    if (attachmentId) {
      onRemove(attachmentId)
      return
    }
    const controller = new AbortController()
    pendingPhoto.current = controller
    setAdding(true)
    try {
      const dataUrl = await getPhotoDataUrl(id)
      if (controller.signal.aborted) {
        return
      }
      if (!dataUrl) {
        showToast({ key: 'attachPhotoUnavailable', type: 'error' })
        return
      }
      const blob = await (await fetch(dataUrl, { signal: controller.signal })).blob()
      if (!controller.signal.aborted) {
        const file = new File([blob], `photo_${id}.jpg`, { type: blob.type || 'image/jpeg' })
        if (onFiles([file], id) && !isMobile) {
          onClose()
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        showToast({ key: 'attachPhotoUnavailable', type: 'error' })
      }
    } finally {
      if (pendingPhoto.current === controller) {
        pendingPhoto.current = null
        setAdding(false)
      }
    }
  }

  const content = (
    <>
      {photosState === 'ready' ? (
        <div className={styles.photosRow}>
          {photos.map((photo, index) => {
            const selected = attachments.find((item) => item.recentPhotoId === photo.id)
            return (
              <button
                key={photo.id}
                type="button"
                className={styles.photo}
                aria-label={t('attachRecentPhoto', { number: index + 1 })}
                aria-pressed={Boolean(selected)}
                disabled={adding}
                onClick={() => void togglePhoto(photo.id, selected?.id)}
              >
                <img className={styles.photoThumb} src={photo.thumbnail} alt="" />
                <span className={styles.photoCheck} aria-hidden="true">
                  {selected ? <IconCheckOutline16 /> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
      <div className={styles.cards}>
        <button type="button" className={styles.card} onClick={() => void takeCameraPhoto()}>
          <IconCameraOutline16 />
          <span>{t('attachCamera')}</span>
        </button>
        <button
          type="button"
          className={styles.card}
          onClick={() => galleryInputRef.current?.click()}
        >
          <IconPhotoOutline16 />
          <span>{t('attachAlbum')}</span>
        </button>
        <button type="button" className={styles.card} onClick={() => fileInputRef.current?.click()}>
          <IconPaperclipOutline16 />
          <span>{t('attachFiles')}</span>
        </button>
      </div>
      {/* 三个入口共用校验/上传管线；accept 按入口收窄，真实校验仍由 validateFiles 把关 */}
      <input
        ref={cameraInputRef}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        hidden
        accept={IMAGE_ACCEPT}
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept={ACCEPT}
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
    </>
  )

  if (isMobile) {
    // 移动端面板从输入卡片下方展开，与卡片保持独立轮廓。
    return (
      <div
        ref={mobileSheetRef}
        className={clsx(styles.sheetWrap, open && styles.open)}
        aria-hidden={!open}
      >
        <div className={styles.sheet}>
          <div className={styles.sheetBody}>{content}</div>
        </div>
      </div>
    )
  }

  if (!popoverVisible) {
    return null
  }

  // 桌面端：加号上方的锚定浮层
  return createPortal(
    <div
      ref={(node) => { popoverRef.current = floatingRef.current = node }}
      className={styles.popover}
      data-app-exiting={!open || undefined}
      style={position ?? undefined}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </div>,
    document.body
  )
}
