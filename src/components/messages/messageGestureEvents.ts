export const EDIT_USER_MESSAGE_EVENT = 'deepchat:edit-user-message'

export type EditUserMessageDetail = {
  sessionId: string
  userId: string
}

/** 用户或助手菜单请求编辑提问：由会话底部 ChatInput 监听并进入编辑态。 */
export const requestUserMessageEdit = (sessionId: string, userId: string) => {
  window.dispatchEvent(
    new CustomEvent<EditUserMessageDetail>(EDIT_USER_MESSAGE_EVENT, {
      detail: { sessionId, userId },
    })
  )
}
