import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { ACCEPT, isImage, resolveMimeType } from '../../services/attachments.js'
import {
  getCachedRecentPhotos,
  getPhotoFile,
  isMediaGalleryAvailable,
  pickPhotoFiles,
  refreshRecentPhotos,
  takePhotoFile,
  type RecentPhoto,
} from '../../services/mediaGallery.js'
import { openImageFile } from '../media/imageWorkbenchState.js'
import { useTranslate } from '../../i18n/index.js'
import type { DraftAttachment } from '../../services/chat/drafts.js'
import { showToast } from '../base/toastState.js'
import styles from './AttachSheet.module.css'

/** 由 ACCEPT_FILE_EXTS 过滤出图片后缀；相机/相册入口只暴露校验管线真正接受的格式 */
const IMAGE_ACCEPT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']
  .map((ext) => `.${ext}`)
  .join(',')

type PendingAction = 'camera' | 'album' | 'photo' | 'files'

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
  const operationRef = useRef(0)
  const [adding, setAdding] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
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

  const invalidateOperation = useCallback(() => {
    operationRef.current++
  }, [])

  useEffect(() => {
    if (!open) {
      setAdding(false)
      setPendingAction(null)
      return
    }
    return invalidateOperation
  }, [open, invalidateOperation])

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

  const beginAction = (action: PendingAction): number | null => {
    if (adding) {
      return null
    }
    const operation = ++operationRef.current
    setAdding(true)
    setPendingAction(action)
    return operation
  }

  const finishAction = (operation: number) => {
    if (operationRef.current === operation) {
      setAdding(false)
      setPendingAction(null)
    }
  }

  const isActive = (operation: number) => operationRef.current === operation

  /** 图片逐张进入统一工作台；确认的才进入本批，取消的不会添加。 */
  const reviewFiles = async (files: File[]): Promise<File[]> => {
    const reviewed: File[] = []
    for (const file of files) {
      if (!isImage(resolveMimeType(file))) {
        reviewed.push(file)
        continue
      }
      const result = await openImageFile(file, 'preview')
      if (result) {
        reviewed.push(result)
      }
    }
    return reviewed
  }

  const commitFiles = (files: File[], recentPhotoId?: string) => {
    if (files.length > 0 && onFiles(files, recentPhotoId) && !isMobile) {
      onClose()
    }
  }

  const handleFiles = async (fileList: FileList | null) => {
    const list = Array.from(fileList ?? [])
    if (list.length === 0) {
      return
    }
    const operation = beginAction('files')
    if (operation === null) {
      return
    }
    try {
      const reviewed = await reviewFiles(list)
      if (isActive(operation)) {
        commitFiles(reviewed)
      }
    } catch {
      if (isActive(operation)) {
        showToast({ key: 'attachPhotoUnavailable', type: 'error' })
      }
    } finally {
      finishAction(operation)
    }
  }

  /**
   * 拍照：优先原生相机 intent；原生不可用时回退到 WebView 文件选择。
   * 拍完进入全屏回览/裁剪界面，确认后才加入草稿，取消则丢弃。
   */
  const takeCameraPhoto = async () => {
    const operation = beginAction('camera')
    if (operation === null) {
      return
    }
    try {
      if (isMediaGalleryAvailable()) {
        try {
          const file = await takePhotoFile()
          if (!isActive(operation)) {
            return
          }
          if (!file) {
            return
          }
          commitFiles(await reviewFiles([file]))
          return
        } catch {
          // 原生链路不可用：走回退
        }
      }
      if (isActive(operation)) {
        cameraInputRef.current?.click()
      }
    } finally {
      finishAction(operation)
    }
  }

  /** API 33+ 优先系统照片选择器；旧版或不支持时回退到多选文件输入。 */
  const pickAlbumPhotos = async () => {
    const operation = beginAction('album')
    if (operation === null) {
      return
    }
    try {
      if (isMediaGalleryAvailable()) {
        try {
          const files = await pickPhotoFiles()
          if (!isActive(operation)) {
            return
          }
          if (files.length > 0) {
            commitFiles(await reviewFiles(files))
          }
          return
        } catch {
          // 原生链路不可用：走回退
        }
      }
      if (isActive(operation)) {
        galleryInputRef.current?.click()
      }
    } finally {
      finishAction(operation)
    }
  }

  const togglePhoto = async (id: string, attachmentId?: string) => {
    if (attachmentId) {
      onRemove(attachmentId)
      return
    }
    const operation = beginAction('photo')
    if (operation === null) {
      return
    }
    try {
      const file = await getPhotoFile(id)
      if (!isActive(operation)) {
        return
      }
      if (!file) {
        showToast({ key: 'attachPhotoUnavailable', type: 'error' })
        return
      }
      commitFiles(await reviewFiles([file]), id)
    } catch {
      if (isActive(operation)) {
        showToast({ key: 'attachPhotoUnavailable', type: 'error' })
      }
    } finally {
      finishAction(operation)
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
        <button
          type="button"
          className={styles.card}
          disabled={adding}
          onClick={() => void takeCameraPhoto()}
        >
          <IconCameraOutline16 />
          <span role={pendingAction === 'camera' ? 'status' : undefined}>
            {pendingAction === 'camera' ? t('attachProcessing') : t('attachCamera')}
          </span>
        </button>
        <button
          type="button"
          className={styles.card}
          disabled={adding}
          onClick={() => void pickAlbumPhotos()}
        >
          <IconPhotoOutline16 />
          <span role={pendingAction === 'album' ? 'status' : undefined}>
            {pendingAction === 'album' ? t('attachProcessing') : t('attachAlbum')}
          </span>
        </button>
        <button
          type="button"
          className={styles.card}
          disabled={adding}
          onClick={() => fileInputRef.current?.click()}
        >
          <IconPaperclipOutline16 />
          <span role={pendingAction === 'files' ? 'status' : undefined}>
            {pendingAction === 'files' ? t('attachProcessing') : t('attachFiles')}
          </span>
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
          <div className={styles.sheetBody} aria-busy={adding}>
            {content}
          </div>
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
      ref={(node) => {
        popoverRef.current = floatingRef.current = node
      }}
      className={styles.popover}
      data-app-exiting={!open || undefined}
      aria-busy={adding}
      style={position ?? undefined}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </div>,
    document.body
  )
}
