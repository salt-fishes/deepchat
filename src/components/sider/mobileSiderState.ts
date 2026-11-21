import { create } from 'zustand'

/**
 * 移动端侧边栏抽屉（推挤式）：open 为最终开合状态；
 * dragging 表示手势拖动中（暂停 transform 过渡，由手势直写 DOM）。
 */
export const useMobileSider = create<{ open: boolean; dragging: boolean }>(() => ({
  open: false,
  dragging: false,
}))

export const openMobileSider = () => useMobileSider.setState({ open: true, dragging: false })

export const closeMobileSider = () => useMobileSider.setState({ open: false, dragging: false })

export const setSiderDragging = (dragging: boolean) => useMobileSider.setState({ dragging })
