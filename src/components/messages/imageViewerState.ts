import { create } from 'zustand'

/** A stored attachment or a remote image explicitly opened from a message. */
export type ViewerImage = { name: string } & ({ id: string } | { src: string })

export const useImageViewer = create(() => ({ image: null as ViewerImage | null }))

export const openImageViewer = (image: ViewerImage) => useImageViewer.setState({ image })

export const closeImageViewer = () => useImageViewer.setState({ image: null })
