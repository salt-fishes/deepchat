import { addDraftFiles, setDraftText } from './chat/drafts.js'
import { newChat } from './chat/store.js'
import { ensureApiKey, closeSettings } from '../components/settings/settingsDialogState.js'
import { closeMobileSider } from '../components/sider/mobileSiderState.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { openImageFile, openImageFiles } from '../components/media/imageWorkbenchState.js'
import { showToast } from '../components/base/toastState.js'
import { pickPhotoFiles, takePhotoFile } from './mediaGallery.js'
import { useSettings } from './settings.js'
import { consumeNativeIntents, nativeImageToFile, type NativeIntent } from './nativeIntents.js'

let routing = false

const addFiles = (files: File[]): boolean => {
  if (files.length === 0) {
    return false
  }
  if (!ensureApiKey()) {
    return false
  }
  const error = addDraftFiles(null, files, useSettings.getState().apiKey ?? '')
  if (error) {
    showToast(error)
    return false
  }
  return true
}

const prepareImages = async (files: File[]): Promise<File[]> => {
  if (files.length === 1) {
    const result = await openImageFile(files[0], 'preview')
    return result ? [result] : []
  }
  return openImageFiles(files, 'preview')
}

const focusComposer = () => {
  requestAnimationFrame(() => window.dispatchEvent(new Event('deepchat:focus-composer')))
}

const route = async (intent: NativeIntent) => {
  closeSettings()
  closeMobileSider()
  closeSearchPanel()
  newChat()
  switch (intent.kind) {
    case 'new-chat':
      focusComposer()
      return
    case 'share': {
      if (intent.text) {
        setDraftText(null, intent.text)
        focusComposer()
      }
      const results = await Promise.allSettled(intent.images.map(nativeImageToFile))
      const readable = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      )
      const files = await prepareImages(readable)
      const added = addFiles(files)
      if (added) {
        focusComposer()
        showToast({ key: 'shareTargetImagesAdded' })
      } else if (intent.text) {
        showToast({ key: 'shareTargetTextAdded' })
      }
      return
    }
    case 'pick-images': {
      const selected = await pickPhotoFiles()
      const files = await prepareImages(selected)
      if (addFiles(files)) {
        focusComposer()
      }
      return
    }
    case 'take-photo': {
      const file = await takePhotoFile()
      if (!file) {
        return
      }
      const result = await openImageFile(file, 'preview')
      if (result && addFiles([result])) {
        focusComposer()
      }
    }
  }
}

/** Drain launcher shortcuts and system share intents after the chat store is ready. */
export const routeNativeIntents = async () => {
  if (routing) {
    return
  }
  routing = true
  try {
    for (;;) {
      const intents = await consumeNativeIntents()
      if (intents.length === 0) {
        return
      }
      for (const intent of intents) {
        try {
          await route(intent)
        } catch {
          // A cancelled picker/camera or unreadable shared image must not block later intents.
        }
      }
    }
  } finally {
    routing = false
  }
}
