import { create } from 'zustand'

/** 图片查看器当前显示的图片：用附件 id 让查看器自行从 IndexedDB 取原件并管理 URL 生命周期 */
export type ViewerImage = { id: string; name: string }

export const useImageViewer = create(() => ({ image: null as ViewerImage | null }))

export const openImageViewer = (image: ViewerImage) => useImageViewer.setState({ image })

export const closeImageViewer = () => useImageViewer.setState({ image: null })
