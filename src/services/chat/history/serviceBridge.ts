/** Only injected into the Android service's local document. */
export const serviceBridge = (globalThis as typeof globalThis & {
  DeepChatHistoryImport?: { call(method: string, payload: string): string }
}).DeepChatHistoryImport

export const serviceCall = <T>(method: string, payload: object = {}): T => {
  if (!serviceBridge) {
    throw new Error('Android import bridge unavailable')
  }
  const response = JSON.parse(serviceBridge.call(method, JSON.stringify(payload))) as
    | { value: T }
    | { error: string }
  if ('error' in response) {
    throw new Error(response.error)
  }
  return response.value
}
