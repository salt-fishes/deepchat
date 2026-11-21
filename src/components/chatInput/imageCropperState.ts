import { create } from 'zustand'

/**
 * 剪裁器的全局状态：附件卡片（拍照、相册、最近图片、粘贴都走这里）的「查看/剪裁」入口
 * 以及拍照后的回览都打开这个全屏浮层。Promise 式 API：
 * - 确认时 resolve File：未做过任何裁剪操作时原样返回原文件，否则返回裁剪出的新文件
 * - 取消时 resolve null
 */
type CropMode = 'preview' | 'crop'

type CropRequest = {
  /** 递增序号，同一张图重复打开也会刷新依赖 */
  id: number
  /** 待裁剪图片的本地 blob URL，由状态层创建与回收 */
  src: string
  /** 原文件名，裁剪输出沿用其主名 */
  name: string
  /** preview：只看图不显示裁剪框；crop：显示裁剪框可拖动缩放 */
  mode: CropMode
  /** 原文件对象，未裁剪确认时原样交回 */
  file: File
}

export const useImageCropper = create<{ request: CropRequest | null }>(() => ({
  request: null,
}))

let seq = 0
let resolver: ((file: File | null) => void) | null = null

export const openCropper = (file: File, mode: CropMode = 'preview'): Promise<File | null> => {
  // 上一次剪裁尚未结束时（理论上浮层会挡住入口）直接视为取消
  resolver?.(null)
  const promise = new Promise<File | null>((resolve) => {
    resolver = resolve
  })
  useImageCropper.setState({
    request: { id: ++seq, src: URL.createObjectURL(file), name: file.name, mode, file },
  })
  return promise
}

/** 关闭剪裁器：file 为 null 表示取消，否则是确认输出的文件（可能就是原文件） */
export const resolveCropper = (file: File | null) => {
  const { request } = useImageCropper.getState()
  if (request) {
    URL.revokeObjectURL(request.src)
  }
  useImageCropper.setState({ request: null })
  resolver?.(file)
  resolver = null
}
