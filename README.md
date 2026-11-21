# chat-demo

English | [简体中文](README.zh-CN.md)

A static chat client for the [DeepSeek API](https://platform.deepseek.com/), with an Android app built from the same sources. **No backend required**: the browser or app talks directly to the configured API service.

- [Live demo](https://salt-fishes.github.io/chat-demo/)
- [Download the Android APK](https://github.com/salt-fishes/chat-demo/releases/latest)
- [Android build and integration notes](ANDROID.md)

Enter your own API key under **Settings → API Key** on first use.

## Features

- **Conversations**: multiple sessions with automatic titles, renaming and deletion; edit prompts, regenerate replies, switch message branches, stop generation and continue eligible replies.
- **Thinking and search**: deep thinking with three effort levels, web search, link reading and source citations. Thinking is collapsed into a live preview by default and can be turned off in Settings.
- **Attachments**: upload, paste or drag files. On Android, take photos, pick recent images and crop freely.
- **Voice**: press and hold an empty input to record and transcribe; replies can be read aloud.
- **Rendering**: Markdown, syntax highlighting, KaTeX math and Mermaid diagrams. Long replies are revealed in small batches as they stream.
- **Interface**: English and Simplified Chinese, light/dark/system themes, mobile layout, location settings and ZIP history import/export.
- **Interaction**: swipe right from any page to open the conversation list on Android, with edge-to-edge support, keyboard avoidance and respect for the system "reduce motion" setting.

## Quick start

### Use it online

Open the [live demo](https://salt-fishes.github.io/chat-demo/) and enter your API key in Settings.

### Run the static page locally

Download the source archive from [Releases](https://github.com/salt-fishes/chat-demo/releases), or build `dist/` and open `dist/index.html` directly. When opened via `file://`, the browser and the API service must allow storage and cross-origin requests from local pages; serving `dist/` from a static server is more reliable.

### Android app

Install `chatdemo-release-signed.apk` from [Releases](https://github.com/salt-fishes/chat-demo/releases/latest). The app is self-signed, so allow installation from unknown sources when prompted. It uses the same signing certificate as earlier releases and can be installed over them.

### Build from source

Install Node.js 22.12+ and pnpm:

```sh
git clone https://github.com/salt-fishes/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

Open http://localhost:8090. Build the static site with:

```sh
pnpm build
```

The output is written to `dist/`. See [ANDROID.md](ANDROID.md) for Android packaging commands and platform details.

## Data and privacy

API keys and settings are stored in the browser's `localStorage`; conversations and original attachments live in IndexedDB, isolated by browser profile and site origin. Sending messages, uploading attachments and using speech features sends the relevant content to the configured API service.

History import/export in Settings uses ZIP archives. After confirmation and validation, importing replaces all local conversations and attachments. Exports contain conversations and locally available original images, but exclude API keys, settings and original non-image attachments. See the [history format documentation (Chinese)](src/services/chat/history/README.md).

**Settings → Data → Delete all chats** clears all local conversations, original attachments and unsent drafts after confirmation, stops ongoing replies and returns to a new chat. Your API key and settings are preserved; files already uploaded to the API service are not deleted.

## Development

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Build into `dist/` |
| `pnpm apk` | Build the web app and an Android debug APK |
| `pnpm type` | Run TypeScript type checks |
| `pnpm lint` | Lint with oxlint |
| `pnpm format` | Format with oxfmt |

[rspack.config.ts](rspack.config.ts) connects to `https://api.deepseek.com` by default; use `createConfig({ apiOrigin, devServer })` to customize it. Chat uses `deepseek-flash` through Anthropic-compatible Messages / Files APIs and speech uses ASR / TTS endpoints. Search, link reading, titles and `latest_reminder` require a service that implements those extensions; attachment formats are validated by the server.

```text
src/
  app/                 Layout, themes, gestures and global styles
  components/          Chat, input, settings, Markdown and other UI
  i18n/                English and Chinese translations
  services/
    api/               API requests, SSE and protocol types
    chat/              Conversations, branches, storage and history archives
    markdown/          Parsing, highlighting, diagrams and streaming reveal
    speech/            Recording and read-aloud playback
  utils/               Shared utilities
android/               Capacitor Android shell (see ANDROID.md)
```

## License

[MIT](LICENSE). The build copies the license to `dist/LICENSE`; please include it when distributing. Third-party dependencies are subject to their own licenses.

Based on [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo), with an Android shell, interaction, performance and visual improvements added.
