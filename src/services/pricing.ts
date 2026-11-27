import type { ChatModel, MessageUsage } from './api/types.js'

export type PricingPeriod = 'peak' | 'offPeak'

export type TokenRate = {
  /** 人民币 / 百万 tokens */
  unitPrice: number
  amount: number
  tokens: number
}

export type UsageEstimate = {
  model: ChatModel
  period: PricingPeriod
  cacheHit: TokenRate
  cacheMiss: TokenRate
  output: TokenRate
  totalAmount: number
  contextTokens: number
  /** 上下文窗口为 1M；超过窗口时展示上限 100%。 */
  contextPercent: number
}

export const CONTEXT_WINDOW_TOKENS = 1_000_000
const TOKENS_PER_MILLION = 1_000_000
const BEIJING_OFFSET_MINUTES = 8 * 60

/**
 * DeepSeek 官方刊例价（人民币 / 百万 tokens），2026-11-27 核对。
 * https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 */
export const MODEL_PRICING = {
  'deepseek-flash': {
    peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
    offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
  },
  'deepseek-v4-pro': {
    peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
    offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
  },
} as const satisfies Record<
  ChatModel,
  Record<PricingPeriod, { cacheHit: number; cacheMiss: number; output: number }>
>

/** 用 UTC 字段做 +8 小时换算，避免运行环境的本地时区影响峰谷判断。 */
export const getBeijingTime = (value: number | Date): Date => {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getTime() + BEIJING_OFFSET_MINUTES * 60_000)
}

/** 北京时间工作日 09:00–12:00、14:00–18:00 为高峰；节假日调休不在此估算范围内。 */
export const getPricingPeriod = (value: number | Date): PricingPeriod => {
  const date = getBeijingTime(value)
  const weekday = date.getUTCDay()
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  const workday = weekday >= 1 && weekday <= 5
  const peak = (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60)
  return workday && peak ? 'peak' : 'offPeak'
}

const tokens = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0

const amount = (count: number, unitPrice: number): TokenRate => ({
  tokens: count,
  unitPrice,
  amount: (count / TOKENS_PER_MILLION) * unitPrice,
})

/**
 * cache_creation_input_tokens 与未命中的普通输入同价，合并为「缓存未命中」。
 * cache_read_input_tokens 为 0 时，调用方可直接省略「缓存命中」行。
 */
export const estimateMessageCost = ({
  model,
  usage,
  createdAt,
}: {
  model: ChatModel | null
  usage: MessageUsage | undefined
  createdAt: number | Date
}): UsageEstimate | null => {
  if (
    !model ||
    !usage ||
    !MODEL_PRICING[model] ||
    Number.isNaN(getBeijingTime(createdAt).getTime())
  ) {
    return null
  }
  const period = getPricingPeriod(createdAt)
  const rates = MODEL_PRICING[model][period]
  const cacheHit = amount(tokens(usage.cache_read_input_tokens), rates.cacheHit)
  const cacheMiss = amount(
    tokens(usage.input_tokens) + tokens(usage.cache_creation_input_tokens),
    rates.cacheMiss
  )
  const output = amount(tokens(usage.output_tokens), rates.output)
  const contextTokens = cacheHit.tokens + cacheMiss.tokens + output.tokens
  return {
    model,
    period,
    cacheHit,
    cacheMiss,
    output,
    totalAmount: cacheHit.amount + cacheMiss.amount + output.amount,
    contextTokens,
    contextPercent: Math.min(100, (contextTokens / CONTEXT_WINDOW_TOKENS) * 100),
  }
}
