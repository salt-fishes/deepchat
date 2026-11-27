import {
  memo,
  createElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createContext, useContext } from 'react'
import type { Node, Root } from 'mdast'
import { Link, MarkdownImage } from './Link.js'
import { Deferred } from './RenderBudget.js'
import { CitationLink } from '../search/CitationLink.js'

let mathModule: Promise<typeof import('./MathFormula.js')> | undefined
const loadMath = () => (mathModule ??= import('./MathFormula.js'))
let codeModule: Promise<typeof import('./CodeBlock.js')> | undefined
const loadCode = () => (codeModule ??= import('./CodeBlock.js'))
const LazyCode = ({
  code,
  infostring,
  loading,
  enhanced,
}: {
  code: string
  infostring: string
  loading: boolean
  enhanced: boolean
}) => {
  const componentRef = useRef<typeof import('./CodeBlock.js') | null>(null)
  const [, refresh] = useState(false)
  useEffect(() => {
    let active = true
    void loadCode().then(
      (module) => {
        if (active) {
          componentRef.current = module
          refresh((value) => !value)
        }
      },
      () => {}
    )
    return () => {
      active = false
    }
  }, [])
  return componentRef.current
    ? createElement(componentRef.current.CodeBlock, { code, infostring, loading, enhanced })
    : null
}
const LazyMath = ({
  value,
  inline,
  loading,
}: {
  value: string
  inline: boolean
  loading: boolean
}) => {
  const module = useMathComponent()
  return module
    ? createElement(inline ? module.InlineMath : module.MathBlock, { value, loading })
    : null
}
const MathBlock = (props: { value: string; loading: boolean }) => (
  <LazyMath {...props} inline={false} />
)
const InlineMath = (props: { value: string; loading: boolean }) => <LazyMath {...props} inline />
const useMathComponent = () => {
  const componentRef = useRef<typeof import('./MathFormula.js') | null>(null)
  const [, refresh] = useState(false)
  useEffect(() => {
    let active = true
    void loadMath().then(
      (module) => {
        if (active) {
          componentRef.current = module
          refresh((value) => !value)
        }
      },
      () => {}
    )
    return () => {
      active = false
    }
  }, [])
  return componentRef.current
}

const blockData = (node: Pick<Node, 'type' | 'position'>) => ({
  'data-markdown-block': node.type,
  'data-markdown-block-start': node.position?.start.offset,
})

const InlineMathFallback = memo(function InlineMathFallback({ value }: { value: string }) {
  return <>{value}</>
})
const MathBlockFallback = memo(function MathBlockFallback({
  value,
  start,
}: {
  value: string
  start?: number
}) {
  return (
    <p
      className="ds-markdown-paragraph"
      data-markdown-block="math"
      data-markdown-block-start={start}
    >
      {value}
    </p>
  )
})

export const MathBudgetContext = createContext(false)

const Html = memo(function Html({ value }: { value: string }) {
  if (/^<br\s*\/?>$/i.test(value)) {
    return <br />
  }
  return <span className="ds-markdown-html">{value}</span>
})

const AnimateText = createContext(false)
const AnimateMath = createContext(false)

const List = memo(function List({
  node,
  loading,
}: {
  node: import('mdast').List
  loading: boolean
}) {
  const ListTag = node.ordered ? 'ol' : 'ul'
  return (
    <ListTag start={node.ordered ? node.start || undefined : undefined} {...blockData(node)}>
      {node.children.map((child, index) => {
        const checked = child.checked
        const isTaskItem = typeof checked === 'boolean'
        return (
          <li
            key={index}
            className={isTaskItem ? 'ds-markdown-task-list-item' : undefined}
            {...blockData(child)}
          >
            {isTaskItem ? (
              <span className="ds-markdown-task-checkbox">{checked ? '☑  ' : '□  '}</span>
            ) : null}
            <MarkdownBlockContentOrDefinitionContent nodes={child.children} loading={loading} />
          </li>
        )
      })}
    </ListTag>
  )
})

const Table = memo(function Table({
  node,
  loading,
}: {
  node: import('mdast').Table
  loading: boolean
}) {
  const columnCount = node.children[0]?.children.length
  return (
    <div className="markdown-table-wrapper" {...blockData(node)}>
      <table>
        {node.children[0] ? (
          <thead>
            <tr>
              {node.children[0].children.map((cell, i) => (
                <th key={i}>
                  <MarkdownPhrasingContent nodes={cell.children} loading={loading} />
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        {node.children[1] ? (
          <tbody>
            {node.children.slice(1).map((row, ri) => (
              <tr key={ri}>
                {row.children.map((cell, ci) => (
                  <td key={ci}>
                    <MarkdownPhrasingContent nodes={cell.children} loading={loading} />
                  </td>
                ))}
                {Array.from({ length: columnCount - (row.children.length || 0) }).map((_, i) => (
                  <td key={`ptd_${i}`} />
                ))}
              </tr>
            ))}
          </tbody>
        ) : null}
      </table>
    </div>
  )
})

const MarkdownPhrasingContent = memo(function MarkdownPhrasingContent({
  nodes,
  loading,
}: {
  nodes: import('mdast').PhrasingContent[]
  loading: boolean
}) {
  return (
    <>
      {nodes.map((node, index) => (
        <MarkdownPhrasingContentItem key={index} node={node} loading={loading} />
      ))}
    </>
  )
})

const MarkdownPhrasingContentItem = memo(function MarkdownPhrasingContentItem({
  node,
  loading,
}: {
  node: import('mdast').PhrasingContent
  loading: boolean
}) {
  switch (node.type) {
    case 'inlineMath':
      return (
        <Deferred load={loadMath}>
          {(ready) =>
            ready ? (
              <InlineMath value={node.value} loading={loading} />
            ) : (
              <InlineMathFallback value={node.value} />
            )
          }
        </Deferred>
      )
    case 'break':
      return <br />
    case 'emphasis':
      return (
        <em>
          <MarkdownPhrasingContent nodes={node.children} loading={loading} />
        </em>
      )
    case 'image':
      return <MarkdownImage node={node} />
    case 'html':
      return <Html value={node.value} />
    case 'inlineCode':
      return <code>{node.value}</code>
    case 'link':
      return (
        <Link node={node}>
          <MarkdownPhrasingContent nodes={node.children} loading={loading} />
        </Link>
      )
    case 'strong':
      return (
        <strong>
          <MarkdownPhrasingContent nodes={node.children} loading={loading} />
        </strong>
      )
    case 'text':
      return <TextContent>{node.value}</TextContent>
    case 'citation':
      return <CitationLink source={node.source} />
    default:
      return null
  }
})

const TextContent = memo(function TextContent({ children }: { children: string }) {
  const animate = useContext(AnimateText)
  const previous = useRef('')
  const prefixLength =
    animate && children.startsWith(previous.current) ? previous.current.length : children.length
  useLayoutEffect(() => {
    previous.current = children
  }, [children])
  const result: ReactNode[] = []
  let offset = 0
  const breaks = children.match(/\r?\n/g)
  children.split(/\r?\n/).forEach((line, index) => {
    const split = Math.max(0, prefixLength - offset)
    const tail = line.slice(split)
    result.push(
      <span key={index + 's'}>
        {line.slice(0, split)}
        {tail ? (
          <span className="ds-streaming-text" key={line.length}>
            {tail}
          </span>
        ) : null}
      </span>,
      <br key={index + 'br'} />
    )
    offset += line.length + (breaks?.[index]?.length ?? 0)
  })
  result.pop()
  return result
})

const MarkdownBlockContentOrDefinitionContent = memo(
  function MarkdownBlockContentOrDefinitionContent({
    nodes,
    loading,
  }: {
    nodes: Array<import('mdast').BlockContent | import('mdast').DefinitionContent>
    loading: boolean
  }) {
    return nodes.map((node, index) => {
      switch (node.type) {
        case 'math':
          return (
            <Deferred key={index} load={loadMath}>
              {(ready) =>
                ready ? (
                  <MathBlock value={node.value} loading={loading} />
                ) : (
                  <MathBlockFallback value={node.value} start={node.position?.start.offset} />
                )
              }
            </Deferred>
          )
        case 'thematicBreak':
          return <hr key={index} {...blockData(node)} />
        case 'blockquote':
          return (
            <blockquote key={index} {...blockData(node)}>
              <MarkdownBlockContentOrDefinitionContent nodes={node.children} loading={loading} />
            </blockquote>
          )
        case 'html':
          return <Html key={index} value={node.value} />
        case 'heading':
          return node.children.length === 0
            ? null
            : createElement(
                `h${node.depth}`,
                { key: index, ...blockData(node) },
                <MarkdownPhrasingContent nodes={node.children} loading={loading} />
              )
        case 'paragraph':
          return (
            <p key={index} className="ds-markdown-paragraph" {...blockData(node)}>
              <MarkdownPhrasingContent nodes={node.children} loading={loading} />
            </p>
          )
        case 'code':
          return (
            <Deferred key={index} load={loadCode} loading={loading}>
              {(ready) => (
                <LazyCode
                  code={node.value}
                  infostring={node.lang || 'text'}
                  loading={loading}
                  enhanced={ready}
                />
              )}
            </Deferred>
          )
        case 'table':
          return <Table node={node} loading={loading} key={index} />
        case 'list':
          return <List key={index} node={node} loading={loading} />
        default:
          return null
      }
    })
  }
)

export const MarkdownAstRenderer = memo(function MarkdownAstRenderer({
  ast,
  onUpdate,
  className,
  loading = false,
  deferExtras = false,
}: {
  ast: Root
  onUpdate: () => void
  className?: string
  loading?: boolean
  deferExtras?: boolean
}) {
  const onUpdateRef = useRef<() => void>(() => 0)
  onUpdateRef.current = onUpdate
  useLayoutEffect(() => {
    onUpdateRef.current()
  }, [ast.children])
  const fast = useContext(MathBudgetContext)
  const enhanced = !fast && !deferExtras
  const content = useMemo(
    () => (
      <AnimateText.Provider value={loading}>
        <AnimateMath.Provider value={enhanced}>
          <MarkdownBlockContentOrDefinitionContent
            nodes={
              ast.children as Array<
                import('mdast').BlockContent | import('mdast').DefinitionContent
              >
            }
            loading={loading}
          />
        </AnimateMath.Provider>
      </AnimateText.Provider>
    ),
    [ast.children, loading, enhanced]
  )
  return (
    <div
      className={`ds-markdown${className ? ` ${className}` : ''}`}
      data-markdown-block-root="true"
    >
      {content}
    </div>
  )
})
