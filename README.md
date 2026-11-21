# deepchat

English · [简体中文](README.zh-CN.md)

deepchat is an independent, open-source chat client for the [DeepSeek API](https://platform.deepseek.com/). It runs on the web and Android without a separate backend. Bring your own API key.

The Android version closely recreates the look and feel of the original DeepSeek app.

[Open the web app](https://salt-fishes.github.io/deepchat/) · [Download for Android](https://github.com/salt-fishes/deepchat/releases/latest) · [Report an issue](https://github.com/salt-fishes/deepchat/issues)

## Getting started

Open the web app, or download `deepchat-release-signed.apk` from GitHub Releases. The Android APK is self-signed; Android may ask you to allow installation from that source. If upgrading from the old `com.example.chatdemo` package, back up your history before uninstalling it. Current builds use `com.deepchat.app`.

Open **Settings → Account management**, enter a DeepSeek API key and save it. The app validates the key before saving. The same page lets you test the connection, remove the saved key, and refresh your official DeepSeek balance (total, top-up and granted balance in the currency reported by DeepSeek).

## What you can do

- **Chat:** manage conversations, search history, edit prompts, regenerate replies, switch branches, stop generation and continue eligible replies. Replies stream with Markdown, highlighted code, KaTeX and Mermaid support.
- **Think and search:** choose from three thinking effort levels, search the web, read links and view source citations. Under **Settings → Personalization**, choose whether to collapse thinking and set defaults for thinking effort and web search. Changes made in the composer stay in the current conversation while the app is open.
- **Use files and voice:** upload, paste or drag attachments; on Android you can also take or crop photos. Press and hold an empty input to dictate, or have replies read aloud. You can preview the available voices in Settings; previews use the speech API and may incur charges.
- **Make it yours:** choose English or Simplified Chinese, use light, dark or system appearance, and change chat text size without scaling the interface. Android supports a swipe gesture for opening the conversation list; the interface respects reduced-motion preferences.
- **Manage data:** import or export ZIP backups and clear chats under **Settings → Data**. **Usage statistics** shows local chat request counts and reported input/output tokens for today, the last 7 days or the last 30 days. It starts counting with this version and is not a platform billing statement.
- **Check for updates:** Settings checks this repository’s latest stable GitHub Release, shows release notes and links to the APK when available. It never installs an update automatically.

## Data and privacy

The API key and preferences are stored in `localStorage` on the device. Web conversations and original attachments use IndexedDB; Android conversation storage uses native WCDB. The separate local usage database uses IndexedDB and contains daily totals, not message text or keys. Chat, attachments and speech send the relevant content to the configured API service; official balance checks contact DeepSeek directly.

Import validates the archive and asks for confirmation before **replacing** local history. Exports include conversations and locally available original images, but not keys, settings, usage statistics or original non-image attachments. Clearing chats removes local conversations, attachments and unsent drafts and stops active replies. It does not remove your settings, usage statistics or files already uploaded to the API. See the [ZIP format notes](src/services/chat/history/README.md).

## Build from source

With Node.js 22.12+ and pnpm:

```sh
git clone https://github.com/salt-fishes/deepchat.git
cd deepchat
pnpm install
pnpm dev
```

The development server runs at <http://localhost:8090>. `pnpm build` writes the static web app to `dist/`. You can also download the web bundle from Releases when available. Serve it over HTTP(S); opening `index.html` directly requires browser storage and cross-origin API requests to work from `file://`.

| Command | Purpose |
| --- | --- |
| `pnpm apk` | Build and sync the web assets, then build an Android debug APK on Windows. See [Android build notes](ANDROID.md). |
| `pnpm type` | Run TypeScript checks. |
| `pnpm lint` | Run oxlint. |
| `pnpm format` | Format the source with oxfmt. |

[rspack.config.ts](rspack.config.ts) defaults to `https://api.deepseek.com` and supports a build-time `apiOrigin` override. Chat uses `deepseek-flash` through the Anthropic-compatible Messages and Files endpoints; search, link reading, automatic titles and `latest_reminder` require DeepSeek’s extensions. Speech uses the ASR and TTS endpoints. Balance lookup always uses DeepSeek’s official endpoint.

## License

[MIT](LICENSE). Include the license when redistributing the build (`dist/LICENSE`). Third-party components retain their own licenses. Based on [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo).
