export const EDIT_USER_MESSAGE_EVENT = 'deepchat:edit-user-message'

export type EditUserMessageDetail = {
  sessionId: string
  userId: string
}

/** 助手长按菜单的「修改」入口：由 UserMessage 监听并进入编辑态。 */
export const requestUserMessageEdit = (sessionId: string, userId: string) => {
  window.dispatchEvent(
    new CustomEvent<EditUserMessageDetail>(EDIT_USER_MESSAGE_EVENT, {
      detail: { sessionId, userId },
    })
  )
}
