import { create } from 'zustand'

export type ImageWorkbenchMode = 'preview' | 'crop'

/** 消息附件或远程图片共用的查看入口。 */
export type ViewerImage = {
  name: string
  mimeType?: string
} & ({ id: string } | { src: string })

export type ImageWorkbenchSource =
  | { kind: 'file'; file: File }
  | { kind: 'stored'; id: string; name: string; mimeType?: string }
  | { kind: 'remote'; src: string; name: string; mimeType?: string }

export type ImageWorkbenchRequest = {
  id: number
  source: ImageWorkbenchSource
  mode: ImageWorkbenchMode
  /** 同一消息内的图片序列；查看器左右滑动时使用。 */
  gallery?: ViewerImage[]
  index?: number
  /** 草稿/拍照流程等待文件；消息查看不需要 Promise。 */
  resolve?: (file: File | null) => void
}

export const useImageWorkbench = create<{ request: ImageWorkbenchRequest | null }>(() => ({
  request: null,
}))

let sequence = 0
let resolver: ((file: File | null) => void) | null = null

const show = (
  request: Omit<ImageWorkbenchRequest, 'id' | 'resolve'>,
  resolve?: (file: File | null) => void
) => {
  resolver?.(null)
  resolver = resolve ?? null
  useImageWorkbench.setState({ request: { ...request, id: ++sequence, resolve } })
}

/** 本地文件入口：确认返回原文件或裁剪文件，取消返回 null。 */
export const openImageFile = (
  file: File,
  mode: ImageWorkbenchMode = 'preview'
): Promise<File | null> =>
  new Promise<File | null>((resolve) => {
    show({ source: { kind: 'file', file }, mode }, resolve)
  })

/** 批量图片入口按顺序回览；每张独立确认，取消的图片不会出现在结果中。 */
export const openImageFiles = async (
  files: Iterable<File>,
  mode: ImageWorkbenchMode = 'preview'
): Promise<File[]> => {
  const confirmed: File[] = []
  for (const file of files) {
    const result = await openImageFile(file, mode)
    if (result) {
      confirmed.push(result)
    }
  }
  return confirmed
}

/** 图片的稳定键：同一附件在多条消息里复用时只保留一次。 */
export const viewerImageKey = (image: ViewerImage) =>
  'id' in image ? `id:${image.id}` : `src:${image.src}`

export const viewerImageSource = (image: ViewerImage): ImageWorkbenchSource =>
  'id' in image
    ? { kind: 'stored', id: image.id, name: image.name, mimeType: image.mimeType }
    : { kind: 'remote', src: image.src, name: image.name, mimeType: image.mimeType }

/** 消息图片入口：查看、下载、左右浏览，裁剪后把图片放回当前会话输入框。 */
export const openImageViewer = (image: ViewerImage, gallery = [image]) => {
  const images: ViewerImage[] = []
  const seen = new Set<string>()
  for (const item of gallery) {
    const key = viewerImageKey(item)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    images.push(item)
  }
  let index = images.findIndex((item) => viewerImageKey(item) === viewerImageKey(image))
  if (index < 0) {
    images.unshift(image)
    index = 0
  }
  show({
    mode: 'preview',
    source: viewerImageSource(image),
    gallery: images,
    index,
  })
}

export const setImageWorkbenchMode = (mode: ImageWorkbenchMode) => {
  const { request } = useImageWorkbench.getState()
  if (request) {
    useImageWorkbench.setState({ request: { ...request, mode } })
  }
}

/** requestId 防止异步裁剪在关闭或打开下一张图后提交旧结果。 */
export const resolveImageWorkbench = (file: File | null, requestId?: number): boolean => {
  const { request } = useImageWorkbench.getState()
  if (!request || (requestId !== undefined && request.id !== requestId)) {
    return false
  }
  useImageWorkbench.setState({ request: null })
  request.resolve?.(file)
  if (resolver === request.resolve) {
    resolver = null
  }
  return true
}

/** 返回键/Esc：先退出裁剪，再关闭整个工作台。 */
export const dismissImageWorkbench = () => {
  const { request } = useImageWorkbench.getState()
  if (request?.mode === 'crop') {
    setImageWorkbenchMode('preview')
  } else {
    resolveImageWorkbench(null)
  }
}

/** 旧 WCDB 附件可能没有 MIME；只用图片元数据补全，不改变原始字节。 */
export const normalizeImageBlob = (blob: Blob, fallbackMimeType: string): Blob => {
  const type = blob.type.startsWith('image/')
    ? blob.type
    : fallbackMimeType.startsWith('image/')
      ? fallbackMimeType
      : 'image/jpeg'
  return blob.type === type ? blob : new Blob([blob], { type })
}
