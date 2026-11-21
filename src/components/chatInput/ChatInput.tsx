import clsx from 'clsx'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  IconCloseOutline16,
  IconGlobeLanguageOutline14,
  IconPlusCircleOutline16,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import { setSearch, setThinking, useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { sendMessage, stopReply, useChatStore } from '../../services/chat/store.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  replaceDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { useUploads } from '../../services/attachments.js'
import { DraftAttachments } from './DraftAttachments.js'
import { AttachSheet } from './AttachSheet.js'
import { openCropper } from './imageCropperState.js'
import { useVoiceInput } from './useVoiceInput.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import { ThinkingEffortTrigger } from './ThinkingEffort.js'
import styles from './ChatInput.module.css'

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return <Input key={sessionId === null ? 'new' : `session:${sessionId}`} sessionId={sessionId} />
})

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  const [sheetOpen, setSheetOpen] = useState(false)
  const attachButtonRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory || !ensureApiKey()) {
      return
    }
    const error = addDraftFiles(sessionId, files, useSettings.getState().apiKey ?? '')
    if (error) {
      showToast(error)
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory && ensureApiKey()) {
        retryDraftAttachment(sessionId, id, useSettings.getState().apiKey ?? '')
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  /**
   * 图片附件的查看/剪裁入口：view 模式整图回览、crop 模式直接进裁剪框。
   * 确认后原文件原样返回时不重传；裁剪过的原位替换并重新上传。
   */
  const editImage = useCallback(
    async (id: string, mode: 'preview' | 'crop') => {
      if (useChatStore.getState().importingHistory || !ensureApiKey()) {
        return
      }
      const attachment = getDraft(sessionId).attachments.find((item) => item.id === id)
      if (!attachment?.isImage) {
        return
      }
      const result = await openCropper(attachment.file, mode)
      if (!result || result === attachment.file) {
        return
      }
      const error = replaceDraftAttachment(
        sessionId,
        id,
        result,
        useSettings.getState().apiKey ?? ''
      )
      if (error) {
        showToast(error)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 转写结果插入到光标处，并把光标移到插入内容之后 */
  const voice = useVoiceInput((transcript) => {
    const textarea = textareaRef.current
    const current = getDraft(sessionId).text
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    setText(current.slice(0, start) + transcript + current.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      textarea?.setSelectionRange(start + transcript.length, start + transcript.length)
    })
  })

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容
  const recording = voice.status === 'recording'

  /** 空输入时长按进入语音输入：按住说话，松开自动转写填入（移动端替代麦克风按钮） */
  const longPressTimer = useRef<number | null>(null)
  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  const onInputPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (
      !isMobile ||
      !event.isPrimary ||
      text !== '' ||
      !voice.available ||
      // idle 长按开始说话；recording 允许再次长按收尾（首次授权弹窗会打断按住）
      (voice.status !== 'idle' && voice.status !== 'recording') ||
      useChatStore.getState().importingHistory
    ) {
      return
    }
    clearLongPress()
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      if (!ensureApiKey()) {
        return
      }
      // 收起键盘，频谱接管输入区
      textareaRef.current?.blur()
      void voice.toggle()
    }, 450)
  }

  // 按住说话：录音中松开手指即结束并转写（手指可能已滑出输入区命中范围，挂全局）
  const voiceToggleRef = useRef(voice.toggle)
  voiceToggleRef.current = voice.toggle
  const voiceStatusRef = useRef(voice.status)
  voiceStatusRef.current = voice.status
  useEffect(() => {
    if (voice.status !== 'recording') {
      return
    }
    const stop = () => {
      if (voiceStatusRef.current === 'recording') {
        voiceToggleRef.current()
      }
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [voice.status])
  useEffect(() => clearLongPress, [])

  // 排队、上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  const canSend = !importingHistory && !streaming && voice.status === 'idle' && draftReady

  const send = () => {
    if (
      useChatStore.getState().importingHistory ||
      voice.status !== 'idle' ||
      !prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    ) {
      return
    }
    // 文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿。
    if (!ensureApiKey() || !sendMessage(sessionId)) {
      return
    }
    stopReadAloud()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  return (
    <div
      className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          textareaRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      <DraftAttachments
        items={attachments}
        onRetry={retryFile}
        onRemove={removeFile}
        onView={(id) => void editImage(id, 'preview')}
      />
      <div
        className={styles.textareaWrapper}
        // 长按语音挂 wrapper：录音中 textarea 隐藏（visibility:hidden 不可命中），频谱接管
        onPointerDown={onInputPointerDown}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onContextMenu={(event) => {
          // 长按语音依赖长按手势，屏蔽空输入框上的原生长按菜单
          if (isMobile && text === '') {
            event.preventDefault()
          }
        }}
      >
        <textarea
          ref={textareaRef}
          className={clsx(styles.textarea, recording && isMobile && styles.textareaHidden)}
          placeholder={t('chatInputPlaceholderChat')}
          rows={2}
          // 移动端不自动聚焦，避免一打开就弹出键盘
          autoFocus={!isMobile}
          disabled={importingHistory}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onMouseDown={(event) => {
            // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
            if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              acceptFiles(files)
            }
          }}
        />
        {recording && isMobile ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
        <div className={styles.mirror} aria-hidden>
          {`${text}\n`}
        </div>
      </div>
      <div className={styles.functionRow}>
        {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
        <div className={styles.toggles}>
          <Tooltip content={t('deactivatedThinkTooltip')}>
            <div className={clsx(styles.toggle, styles.thinkToggle, thinking && styles.selected)}>
              <button
                type="button"
                className={styles.toggleMain}
                aria-label={t('thinkingSwitch')}
                aria-pressed={thinking}
                onClick={() => setThinking(!thinking)}
              >
                <IconThinkOutline14 />
                <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
              </button>
              {/* 深度思考开启时露出思考强度箭头 */}
              {thinking ? <ThinkingEffortTrigger /> : null}
            </div>
          </Tooltip>
          <Tooltip content={t('deactivatedSearchTooltip')}>
            <button
              type="button"
              className={clsx(styles.toggle, search && styles.selected)}
              aria-label={t('search')}
              aria-pressed={search}
              onClick={() => setSearch(!search)}
            >
              <IconGlobeLanguageOutline14 />
              <span className={styles.toggleLabel}>{t('search')}</span>
            </button>
          </Tooltip>
        </div>
        <div className={styles.right}>
          <IconButton
            ref={attachButtonRef}
            size="m"
            tone="primary"
            icon={sheetOpen ? <IconCloseOutline16 /> : <IconPlusCircleOutline16 />}
            tooltip={t('uploadFile')}
            aria-expanded={sheetOpen}
            disabled={importingHistory}
            onClick={() => setSheetOpen((value) => !value)}
          />
          {streaming && sessionId ? (
            <button
              type="button"
              className={styles.sendButton}
              aria-label={t('chatInputStopButtonTooltip')}
              onClick={() => {
                stopReadAloud()
                stopReply(sessionId)
              }}
            >
              <IconStopFill16 />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.sendButton, !canSend && styles.disabled)}
              aria-label={t('send')}
              aria-disabled={!canSend}
              onClick={send}
            >
              <IconSendOutline16 />
            </button>
          )}
        </div>
      </div>
      <AttachSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onFiles={acceptFiles}
        anchorRef={attachButtonRef}
        isMobile={isMobile}
      />
      {dragging ? <DragMask /> : null}
    </div>
  )
}
