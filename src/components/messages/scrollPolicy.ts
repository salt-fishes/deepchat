/** 距底部小于该值时视为在底部。 */
export const STICKY_THRESHOLD = 40

/** 流式输出期间只有用户点“跳到最新”才恢复跟随，避免程序滚动误判。 */
export const shouldFollowAfterScroll = (streaming: boolean, distanceFromBottom: number) =>
  !streaming && distanceFromBottom < STICKY_THRESHOLD
