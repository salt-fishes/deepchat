export type UsageTotals = {
  requests: number
  input: number
  output: number
  missingInput: number
  missingOutput: number
}

export type UsageDay = UsageTotals & { date: string }

export type UsageTrendDay = UsageDay & { height: number }

export type UsageAverage = {
  kind: 'empty' | 'unrecorded' | 'partial' | 'complete'
  value: number | null
  missingInput: number
  missingOutput: number
}

const emptyTotals = (): UsageTotals => ({
  requests: 0,
  input: 0,
  output: 0,
  missingInput: 0,
  missingOutput: 0,
})

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** 补齐所选周期内没有记录的日期，并按时间正序返回，便于绘制趋势。 */
export const buildUsageTrend = (
  daily: UsageDay[],
  days: 1 | 7 | 30,
  now = new Date()
): UsageTrendDay[] => {
  const byDate = new Map(daily.map((row) => [row.date, row]))
  const rows: UsageTrendDay[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const key = localDateKey(date)
    rows.push({ date: key, ...(byDate.get(key) ?? emptyTotals()), height: 0 })
  }
  return normalizeUsageTrend(rows)
}

/** 柱高只按区间内最大请求数归一化；全零区间保持零高度。 */
export const normalizeUsageTrend = (rows: UsageDay[]): UsageTrendDay[] => {
  const maxRequests = Math.max(0, ...rows.map((row) => row.requests))
  return rows.map((row) => ({
    ...row,
    height: maxRequests > 0 ? (row.requests / maxRequests) * 100 : 0,
  }))
}

/**
 * 输入/输出缺失可能发生在同一请求，无法从聚合数据还原“两者都完整的请求数”。
 * 因此有任一缺失时不展示平均值，只保留精确的分项缺失次数。
 */
export const summarizeUsageAverage = (totals: UsageTotals): UsageAverage => {
  const missingInput = Math.max(0, totals.missingInput)
  const missingOutput = Math.max(0, totals.missingOutput)
  if (totals.requests <= 0) {
    return { kind: 'empty', value: null, missingInput, missingOutput }
  }
  if (missingInput === 0 && missingOutput === 0) {
    return {
      kind: 'complete',
      value: (totals.input + totals.output) / totals.requests,
      missingInput,
      missingOutput,
    }
  }
  return {
    kind:
      missingInput === totals.requests && missingOutput === totals.requests
        ? 'unrecorded'
        : 'partial',
    value: null,
    missingInput,
    missingOutput,
  }
}

export const usageTrendLabelIndexes = (count: number): number[] => {
  if (count <= 1) {
    return count === 1 ? [0] : []
  }
  const indexes = [0, Math.floor((count - 1) / 3), Math.floor(((count - 1) * 2) / 3), count - 1]
  return [...new Set(indexes)]
}
