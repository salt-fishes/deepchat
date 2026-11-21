import { cityNames, regionCodes, regionNameOverrides, provinceNames } from './locationData.js'

export { regionCodes } from './locationData.js'

export const provinces = Object.entries(provinceNames).map(([code, name]) => ({
  code,
  name,
  cities: Object.entries(cityNames)
    .filter(([city]) => city.startsWith(code.slice(0, 2)))
    .map(([code, name]) => ({ code, name })),
}))

export type UserLocation = {
  region: string
  province?: string
  city?: string
}

const regions = new Set(regionCodes)
const regionNames = {
  'zh-CN': new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  'en-US': new Intl.DisplayNames(['en-US'], { type: 'region' }),
}

export const getRegionName = (code: string, locale: 'zh-CN' | 'en-US'): string =>
  regions.has(code)
    ? (regionNameOverrides[locale][code] ?? regionNames[locale].of(code) ?? code)
    : ''

export const normalizeLocation = (value: unknown): UserLocation | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const location = value as Record<string, unknown>
  const { region, province, city } = location
  if (typeof region !== 'string' || !regions.has(region)) {
    return null
  }
  if (region !== 'CN') {
    return { region }
  }
  if (province === undefined) {
    return city === undefined ? { region } : null
  }
  const selectedProvince = provinces.find((item) => item.code === province)
  if (!selectedProvince) {
    return null
  }
  if (city === undefined) {
    return { region, province: selectedProvince.code }
  }
  const selectedCity = selectedProvince.cities.find((item) => item.code === city)
  return selectedCity ? { region, province: selectedProvince.code, city: selectedCity.code } : null
}

/** 归一化行政区划名：去掉各级后缀再比较，容忍“浙江”“浙江省”等写法差异 */
const stripRegionSuffix = (value: string) =>
  value
    .replace(/(维吾尔|壮族|回族)?自治区$/u, '')
    .replace(/特别行政区$/u, '')
    .replace(/自治州$/u, '')
    .replace(/[省市地区盟]$/u, '')
    .trim()

/** 用中文名把反查到的省/市匹配到本地的行政区划代码；找不到的层级原样留空 */
const matchChinaLocation = (provinceName: string, cityName: string): UserLocation | null => {
  const provinceKey = stripRegionSuffix(provinceName)
  const province = provinceKey
    ? provinces.find(
        (item) =>
          stripRegionSuffix(item.name) === provinceKey ||
          provinceKey.startsWith(stripRegionSuffix(item.name))
      )
    : undefined
  if (!province) {
    return null
  }
  const cityKey = stripRegionSuffix(cityName)
  const city = cityKey
    ? province.cities.find(
        (item) =>
          stripRegionSuffix(item.name) === cityKey || cityKey.startsWith(stripRegionSuffix(item.name))
      )
    : undefined
  return {
    region: 'CN',
    province: province.code,
    ...(city ? { city: city.code } : {}),
  }
}

type ReverseGeocodeResult = {
  countryCode: string
  /** 一级行政区（中国的省），其余国家可为空 */
  subdivision?: string
  city?: string
}

/** BigDataCloud 免费客户端接口：无需 Key、支持 CORS、对国内可达性较好 */
const reverseGeocodeBigDataCloud = async (
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult | null> => {
  const response = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`
  )
  if (!response.ok) {
    return null
  }
  const data: unknown = await response.json()
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const record = data as Record<string, unknown>
  return {
    countryCode: String(record.countryCode ?? '').toUpperCase(),
    subdivision:
      typeof record.principalSubdivision === 'string' ? record.principalSubdivision : undefined,
    city: typeof record.city === 'string' ? record.city : undefined,
  }
}

/** Nominatim (OSM) 兜底：免费无需 Key，国内可达性一般 */
const reverseGeocodeNominatim = async (
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult | null> => {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=zh&zoom=10`
  )
  if (!response.ok) {
    return null
  }
  const data: unknown = await response.json()
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const record = data as Record<string, unknown>
  const address = record.address
  if (typeof address !== 'object' || address === null) {
    return null
  }
  const fields = address as Record<string, unknown>
  return {
    countryCode: String(fields.country_code ?? '').toUpperCase(),
    subdivision: typeof fields.state === 'string' ? fields.state : undefined,
    city: typeof fields.city === 'string' ? fields.city : undefined,
  }
}

/**
 * 经纬度反查为 UserLocation（设置里位置信息的自动定位填入）。
 * 中国境内按省/市中文名匹配本地行政区划代码；境外匹配国家码；查不到返回 null。
 */
export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<UserLocation | null> => {
  let result: ReverseGeocodeResult | null = null
  try {
    result = await reverseGeocodeBigDataCloud(latitude, longitude)
  } catch {
    // 网络失败走兜底
  }
  if (!result) {
    try {
      result = await reverseGeocodeNominatim(latitude, longitude)
    } catch {
      return null
    }
  }
  if (!result || !regions.has(result.countryCode)) {
    return null
  }
  if (result.countryCode !== 'CN') {
    return { region: result.countryCode }
  }
  return matchChinaLocation(result.subdivision ?? '', result.city ?? '')
}
