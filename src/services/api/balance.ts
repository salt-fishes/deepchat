import { ApiError, request } from './client.js'

type BalanceEntry = {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

const isBalanceEntry = (entry: unknown): entry is BalanceEntry => {
  if (!entry || typeof entry !== 'object') {return false}
  const fields = entry as Record<string, unknown>
  return typeof fields.currency === 'string' && /^[A-Z]{3}$/.test(fields.currency) &&
    ['total_balance', 'granted_balance', 'topped_up_balance'].every((key) =>
      typeof fields[key] === 'string' && /^-?\d+(\.\d+)?$/.test(fields[key])
    )
}

export const getDeepSeekBalance = async (apiKey: string, signal: AbortSignal) => {
  // Do not send credentials to an alternate host or follow a redirect.
  const response = await request('https://api.deepseek.com/user/balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
    redirect: 'error',
    signal,
  })
  const body = await response.json() as { is_available?: unknown; balance_infos?: unknown }
  if (!body || typeof body.is_available !== 'boolean' || !Array.isArray(body.balance_infos) ||
      !body.balance_infos.every(isBalanceEntry)) {
    throw new ApiError('protocol', 'Invalid balance response')
  }
  return { available: body.is_available, balances: body.balance_infos as BalanceEntry[] }
}
