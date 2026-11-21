import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition } from '../base/anchored.js'
import { registerOverlayToken } from '../base/Modal.js'
import {
  IconCameraOutline16,
  IconPaperclipOutline16,
  IconPhotoOutline16,
} from '../base/icons.js'
import { ACCEPT } from '../../services/attachments.js'
import {
  getPhotoDataUrl,
  getRecentPhotos,
  isMediaGalleryAvailable,
  takePhotoDataUrl,
  type RecentPhoto,
} from '../../services/mediaGallery.js'
import { openCropper } from './imageCropperState.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './AttachSheet.module.css'

/** 由 ACCEPT_FILE_EXTS 过滤出图片后缀；相机/相册入口只暴露校验管线真正接受的格式 */
const IMAGE_ACCEPT = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif',
]
  .map((ext) => `.${ext}`)
  .join(',')

export const AttachSheet = ({
  open,
  onClose,
  onFiles,
  anchorRef,
  isMobile,
}: {
  open: boolean
  onClose: () => void
  onFiles: (files: File[]) => void
  /** 桌面 popover 的锚点（加号按钮） */
  anchorRef?: React.RefObject<HTMLButtonElement | null>
  isMobile: boolean
}) => {
  const t = useTranslate()
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<RecentPhoto[]>([])
  const [photosState, setPhotosState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [adding, setAdding] = useState(false)
  const { floatingRef, position } = useAnchoredPosition<HTMLButtonElement, HTMLDivElement>(
    open && !isMobile,
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

  // 打开时拉取最近图片；权限被拒或无照片则整行隐藏
  useEffect(() => {
    if (!open) {
      setAdding(false)
      return
    }
    if (!isMediaGalleryAvailable()) {
      setPhotosState('unavailable')
      return
    }
    let cancelled = false
    setPhotosState('loading')
    getRecentPhotos(24).then((list) => {
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
    onFiles(list)
    onClose()
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
        onFiles([result])
        onClose()
        return
      } catch {
        // 原生链路不可用：走回退
      }
    }
    cameraInputRef.current?.click()
  }

  /** 最近图片单击直接添加原图（缩略图右侧圆圈才是多选），添加后收起面板 */
  const addSingle = async (id: string) => {
    if (adding) {
      return
    }
    setAdding(true)
    try {
      const dataUrl = await getPhotoDataUrl(id)
      if (!dataUrl) {
        return
      }
      const blob = await (await fetch(dataUrl)).blob()
      onFiles([new File([blob], `photo_${id}.jpg`, { type: 'image/jpeg' })])
      onClose()
    } finally {
      setAdding(false)
    }
  }

  const content = (
    <>
      {photosState === 'ready' ? (
        <div className={styles.photosRow}>
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              className={styles.photo}
              disabled={adding}
              onClick={() => void addSingle(photo.id)}
            >
              <img className={styles.photoThumb} src={photo.thumbnail} alt="" />
            </button>
          ))}
        </div>
      ) : null}
      {photosState === 'loading' ? <div className={styles.photosRow} aria-hidden /> : null}
      <div className={styles.cards}>
        <button type="button" className={styles.card} onClick={() => void takeCameraPhoto()}>
          <IconCameraOutline16 />
          <span>{t('attachCamera')}</span>
        </button>
        <button type="button" className={styles.card} onClick={() => galleryInputRef.current?.click()}>
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
    // 移动端：面板常驻挂载于输入容器内部，随 grid 行高展开收起，与输入框连成一体
    return (
      <div
        className={clsx(styles.sheetWrap, open && styles.open)}
        aria-hidden={!open}
      >
        <div className={styles.sheet}>
          <div className={styles.sheetBody}>{content}</div>
        </div>
      </div>
    )
  }

  if (!open) {
    return null
  }

  // 桌面端：加号上方的锚定浮层
  return createPortal(
    <div
      ref={floatingRef}
      className={styles.popover}
      style={position ?? undefined}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </div>,
    document.body
  )
}
