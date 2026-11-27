import type { Image, Link as LinkNode } from 'mdast'
import { memo, type MouseEvent, type ReactNode } from 'react'
import { openInAppLink } from '../../services/externalLinks.js'
import { openImageViewer } from '../media/imageWorkbenchState.js'

const sanitizeUrl = (url: string) => {
  // 如果URL没有协议，添加默认的https协议
  if (url && !url.match(/^[a-zA-Z]+:\/\//) && !url.startsWith('mailto:')) {
    url = `https://${url}`
  }

  try {
    const parsedUrl = new URL(url)
    if (['http:', 'https:', 'mailto:'].includes(parsedUrl.protocol)) {
      return parsedUrl.toString()
    }
    return undefined
  } catch {
    return undefined
  }
}

export const Link = memo(function Link({
  node,
  children,
}: {
  node: LinkNode
  children: ReactNode
}) {
  // 页内锚点显示链接文字。
  if (node.url.startsWith('#')) {
    return children
  }

  // 邮件地址显示链接文字。
  if (node.url.startsWith('mailto:')) {
    return children
  }

  // URL 解析失败时只显示链接文字。
  const href = sanitizeUrl(node.url)
  if (!href) {
    return <span>{children}</span>
  }

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    openInAppLink(href, node.title || undefined)
  }

  return (
    <a
      href={href}
      title={node.title || undefined}
      rel="noreferrer"
      onClick={open}
      onAuxClick={open}
    >
      {children}
    </a>
  )
})

/** Remote images load only when explicitly opened, not on every message render. */
export function MarkdownImage({ node }: { node: Image }) {
  const url = sanitizeUrl(node.url)
  const name = node.alt || node.title || url || node.url
  if (!url || !/^https?:\/\//.test(url)) {
    return <span>{name}</span>
  }
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    openImageViewer({ src: url, name })
  }
  return (
    <a href={url} title={node.title ?? ''} rel="noreferrer" onClick={open} onAuxClick={open}>
      {name}
    </a>
  )
}
