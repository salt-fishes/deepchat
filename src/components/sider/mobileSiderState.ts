import { create } from 'zustand'

/**
 * 移动端侧边栏（推挤式）：open 为最终开合状态；dragging 为跟手拖动；
 * settling 为松手后的速度感知收尾。gestureEpoch 让外部开合使旧手势失效。
 */
export const useMobileSider = create<{
  open: boolean
  dragging: boolean
  settling: boolean
  gestureEpoch: number
}>(() => ({ open: false, dragging: false, settling: false, gestureEpoch: 0 }))

let gestureEpoch = 0

const setOpen = (open: boolean) => {
  const current = useMobileSider.getState()
  if (current.open === open && !current.dragging && !current.settling) {
    return
  }
  useMobileSider.setState({
    open,
    dragging: false,
    settling: false,
    gestureEpoch: ++gestureEpoch,
  })
}

export const openMobileSider = () => setOpen(true)
export const closeMobileSider = () => setOpen(false)
export const setSiderDragging = (dragging: boolean) =>
  useMobileSider.setState({ dragging, settling: false })
export const setSiderSettling = (settling: boolean) => useMobileSider.setState({ settling })
