export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_MAX_HEIGHT = 1800
export const SHARE_CARD_BODY_MAX_HEIGHT = 1080
export const SHARE_CARD_MAX_TEXT_LENGTH = 6000
export const SHARE_CARD_FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif'

const BEIJING_OFFSET_MINUTES = 8 * 60
const getBeijingTime = (value: number | Date): Date => {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getTime() + BEIJING_OFFSET_MINUTES * 60_000)
}

const BODY_FONT_SIZE = 36
const BODY_LINE_HEIGHT = 54
const CARD_PADDING = 84
const BODY_TOP = 300
const CARD_FOOTER_HEIGHT = 150

const pad = (value: number) => String(value).padStart(2, '0')

export const formatShareCardDate = (value: number | Date): string => {
  const date = getBeijingTime(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** 分享卡片使用纯文本：保留段落和代码内容，去掉 Markdown 装饰与引用角标。 */
export const normalizeShareCardText = (
  value: string,
  maxLength = SHARE_CARD_MAX_TEXT_LENGTH
): string => {
  let text = value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[citation:\d+\]/gi, '')
    .replace(/^[ \t]*```[^\n]*$/gm, '')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-+*][ \t]+\[[ xX]\][ \t]+/gm, '• ')
    .replace(/^[ \t]*[-+*][ \t]+/gm, '• ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const limit = Math.max(0, Math.trunc(maxLength))
  if (limit === 0) {
    return ''
  }
  const characters = Array.from(text)
  if (characters.length > limit) {
    text = `${characters.slice(0, limit - 1).join('')}…`
  }
  return text
}

const wordTokens = (value: string): string[] =>
  value.match(/[A-Za-z0-9]+(?:[._'’:/@%+-][A-Za-z0-9]+)*|\s+|[^\s]/gu) ?? []

/** 中文按字换行，英文尽量按单词换行；超长单词再按字拆分。 */
export const wrapShareCardLines = (
  value: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] => {
  if (!(maxWidth > 0)) {
    return []
  }
  const lines: string[] = []
  for (const paragraph of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let line = ''
    let pendingSpace = false
    const pushLine = () => {
      lines.push(line.trimEnd())
      line = ''
      pendingSpace = false
    }
    for (const token of wordTokens(paragraph)) {
      if (/^\s+$/.test(token)) {
        pendingSpace = line.length > 0
        continue
      }
      const prefix = pendingSpace && line ? ' ' : ''
      if (measure(`${line}${prefix}${token}`) <= maxWidth) {
        line += `${prefix}${token}`
        pendingSpace = false
        continue
      }
      if (line) {
        pushLine()
      }
      if (measure(token) <= maxWidth) {
        line = token
        continue
      }
      for (const character of Array.from(token)) {
        if (line && measure(`${line}${character}`) > maxWidth) {
          pushLine()
        }
        line += character
      }
    }
    if (line || !paragraph) {
      lines.push(line.trimEnd())
    }
  }
  while (lines.length > 1 && lines.at(-1) === '') {
    lines.pop()
  }
  return lines.length ? lines : ['']
}

/** 按最大高度截断，并保证省略号能与最后一行文字一起放下。 */
export const fitShareCardLines = ({
  lines,
  maxHeight,
  lineHeight,
  maxWidth,
  measure,
}: {
  lines: string[]
  maxHeight: number
  lineHeight: number
  maxWidth: number
  measure: (text: string) => number
}): { lines: string[]; truncated: boolean } => {
  const maxLines = Math.max(1, Math.floor(Math.max(0, maxHeight) / Math.max(1, lineHeight)))
  if (lines.length <= maxLines) {
    return { lines, truncated: false }
  }
  const fitted = lines.slice(0, maxLines)
  let last = fitted.at(-1) ?? ''
  while (last && measure(`${last}…`) > maxWidth) {
    last = Array.from(last).slice(0, -1).join('')
  }
  if (!last && fitted.length > 1) {
    fitted.pop()
    last = fitted.at(-1) ?? ''
    while (last && measure(`${last}…`) > maxWidth) {
      last = Array.from(last).slice(0, -1).join('')
    }
  }
  fitted[fitted.length - 1] = `${last}…`
  return { lines: fitted, truncated: true }
}

export const getShareCardHeight = (lineCount: number): number =>
  Math.min(
    SHARE_CARD_MAX_HEIGHT,
    Math.max(720, BODY_TOP + Math.max(1, lineCount) * BODY_LINE_HEIGHT + CARD_FOOTER_HEIGHT)
  )

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

const canvasFile = (canvas: HTMLCanvasElement, name: string): Promise<File> =>
  new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob || blob.size === 0) {
          reject(new Error('Empty share card'))
          return
        }
        resolve(new File([blob], name, { type: 'image/png' }))
      }, 'image/png')
    } catch (error) {
      reject(error)
    }
  })

/** Canvas 生成截图式 PNG；高度随正文收缩，超长正文按测量结果截断。 */
export const createShareCardFile = async ({
  text,
  createdAt,
  dateLabel,
  disclaimer,
}: {
  text: string
  createdAt: number | Date
  dateLabel: string
  disclaimer: string
}): Promise<File> => {
  const measureCanvas = document.createElement('canvas')
  const measureContext = measureCanvas.getContext('2d')
  if (!measureContext) {
    throw new Error('Canvas is unavailable')
  }
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  const bodyFont = `400 ${BODY_FONT_SIZE}px ${SHARE_CARD_FONT_FAMILY}`
  measureContext.font = bodyFont
  const normalized = normalizeShareCardText(text)
  const bodyWidth = SHARE_CARD_WIDTH - CARD_PADDING * 2
  const fitted = fitShareCardLines({
    lines: wrapShareCardLines(
      normalized,
      bodyWidth,
      (value) => measureContext.measureText(value).width
    ),
    maxHeight: SHARE_CARD_BODY_MAX_HEIGHT,
    lineHeight: BODY_LINE_HEIGHT,
    maxWidth: bodyWidth,
    measure: (value) => measureContext.measureText(value).width,
  })

  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = getShareCardHeight(fitted.lines.length)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is unavailable')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.fillStyle = '#4d6bff'
  roundedRect(context, CARD_PADDING, 78, 62, 62, 18)
  context.fill()
  context.strokeStyle = '#ffffff'
  context.lineWidth = 4
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(CARD_PADDING + 17, 97)
  context.lineTo(CARD_PADDING + 31, 111)
  context.lineTo(CARD_PADDING + 46, 97)
  context.stroke()
  context.beginPath()
  context.moveTo(CARD_PADDING + 18, 119)
  context.lineTo(CARD_PADDING + 45, 119)
  context.stroke()

  context.fillStyle = '#4d6bff'
  context.font = `650 42px ${SHARE_CARD_FONT_FAMILY}`
  context.textBaseline = 'alphabetic'
  context.fillText('deepchat', CARD_PADDING + 82, 124)
  context.textAlign = 'left'

  context.fillStyle = 'rgba(77, 107, 255, 0.09)'
  context.font = '170px Georgia, "Times New Roman", serif'
  context.textAlign = 'right'
  context.textBaseline = 'top'
  context.fillText('“', SHARE_CARD_WIDTH - CARD_PADDING, 112)
  context.fillText('“', SHARE_CARD_WIDTH - CARD_PADDING - 132, 112)
  context.textAlign = 'left'

  context.fillStyle = '#20283a'
  context.font = bodyFont
  context.textBaseline = 'top'
  fitted.lines.forEach((line, index) => {
    context.fillText(line, CARD_PADDING, BODY_TOP + index * BODY_LINE_HEIGHT, bodyWidth)
  })

  const footerY = canvas.height - 102
  context.strokeStyle = 'rgba(23, 32, 51, 0.1)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(CARD_PADDING, footerY - 28)
  context.lineTo(SHARE_CARD_WIDTH - CARD_PADDING, footerY - 28)
  context.stroke()
  context.fillStyle = '#7b8499'
  context.font = `400 24px ${SHARE_CARD_FONT_FAMILY}`
  context.fillText(dateLabel, CARD_PADDING, footerY)
  context.textAlign = 'right'
  context.fillText(disclaimer, SHARE_CARD_WIDTH - CARD_PADDING, footerY, bodyWidth)
  context.textAlign = 'left'

  const date = formatShareCardDate(createdAt).replaceAll('-', '') || 'answer'
  return canvasFile(canvas, `deepchat-answer-${date}.png`)
}
