/** 五档聊天字号：标准固定在第 3 档，旧 small/default/large/extraLarge 保持原偏移。 */
export const FONT_SIZE_STEPS = ['extraSmall', 'small', 'default', 'large', 'extraLarge'] as const

export type FontSizeStep = (typeof FONT_SIZE_STEPS)[number]
export type ChatFontSize = FontSizeStep

export const FONT_SIZE_STANDARD_STEP = 2
export const FONT_SIZE_OFFSETS = [-4, -2, 0, 2, 4] as const

export const chatFontOffset: Record<ChatFontSize, number> = {
  extraSmall: -4,
  small: -2,
  default: 0,
  large: 2,
  extraLarge: 4,
}

export const isChatFontSize = (value: unknown): value is ChatFontSize =>
  typeof value === 'string' && (FONT_SIZE_STEPS as readonly string[]).includes(value)

/** 读取旧存储值或未知值时返回安全默认值，不写回或迁移原数据。 */
export const normalizeChatFontSize = (value: unknown): ChatFontSize =>
  isChatFontSize(value) ? value : 'default'

export const clampFontSizeStep = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(FONT_SIZE_STEPS.length - 1, Math.max(0, Math.trunc(value)))
    : FONT_SIZE_STANDARD_STEP

export const fontSizeStep = (size: ChatFontSize): number =>
  FONT_SIZE_STEPS.indexOf(normalizeChatFontSize(size))

export const chatFontSizeAtStep = (step: number): ChatFontSize =>
  FONT_SIZE_STEPS[clampFontSizeStep(step)]

export const normalizeSystemFontScale = (scale: number): number =>
  Number.isFinite(scale) && scale > 0 ? scale : 1
