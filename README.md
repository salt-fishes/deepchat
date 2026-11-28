<div align="center">
  <h1>deepchat</h1>
  <p><strong>An independent, open-source DeepSeek API client for Web and Android.</strong><br>
  No separate backend · Bring your own API key · Local-first conversations</p>
  <p>
    <img src="https://img.shields.io/badge/Independent-Open%20Source-2ea44f?style=flat-square" alt="Independent open-source project">
    <img src="https://img.shields.io/github/v/release/salt-fishes/deepchat?style=flat-square" alt="Latest GitHub release">
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT license">
    <img src="https://img.shields.io/badge/Platform-Web%20%7C%20Android-lightgrey?style=flat-square" alt="Web and Android">
    <img src="https://img.shields.io/badge/API%20Key-BYOK-4D6BFE?style=flat-square" alt="Bring your own API key">
  </p>
  <p>
    <a href="https://salt-fishes.github.io/deepchat/" style="display:inline-block;padding:10px 18px;margin:4px;border-radius:8px;background:#4D6BFE;color:#fff;text-decoration:none;font-weight:600;">Open web app</a>
    <a href="https://github.com/salt-fishes/deepchat/releases/latest" style="display:inline-block;padding:10px 18px;margin:4px;border-radius:8px;background:#24292f;color:#fff;text-decoration:none;font-weight:600;">Download Android</a>
    <a href="https://github.com/salt-fishes/deepchat" style="display:inline-block;padding:10px 18px;margin:4px;border-radius:8px;background:#24292f;color:#fff;text-decoration:none;font-weight:600;">Source code</a>
  </p>
  <p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="https://github.com/salt-fishes/deepchat/issues">Report an issue</a></p>
</div>

The Android app closely recreates the look and feel of the original DeepSeek app.

## Quick Start

1. **Open deepchat** on the [web](https://salt-fishes.github.io/deepchat/) or install the [Android APK](https://github.com/salt-fishes/deepchat/releases/latest). See [Downloads](#downloads) for package and installation details.
2. **Add your API key.** Open **Settings → Account management**, enter your [DeepSeek API](https://platform.deepseek.com/) key, and save it. The app validates the key before saving.
3. **Start chatting.** The same Account management page can test the connection, remove the saved key, and refresh your official DeepSeek balance: total, top-up, and granted balances in the currency reported by DeepSeek.

## Features

| Capability            | Highlights                                                                                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat**              | Manage conversations, search history, edit prompts, regenerate replies, switch branches, stop generation, and continue eligible replies. Streamed responses support Markdown, code highlighting, KaTeX, and Mermaid.                                                                   |
| **Think and search**  | Choose from three thinking effort levels, search the web, read links, and view source citations. **Settings → Personalization** controls thinking collapse and default thinking/search options. Composer changes apply only to the current conversation while the app is open.         |
| **Files and voice**   | Upload, paste, or drag attachments. Android also supports taking and cropping photos. Press and hold an empty input to dictate, or have replies read aloud. Voice previews use the speech API and may incur charges.                                                                   |
| **Personalization**   | English and Simplified Chinese, light/dark/system appearance, and chat text sizing independent of the interface. Android supports a swipe gesture for the conversation list and respects reduced-motion preferences.                                                                   |
| **Data and usage**    | Import/export ZIP backups and clear chats under **Settings → Data**. **Usage statistics** shows local chat request counts and reported input/output tokens for today, the last 7 days, or the last 30 days. Counting starts with this version and is not a platform billing statement. |
| **Multi-device sync** | Optional. Paste a sync code from your own server once per device; text chats then sync silently and merge by ID. API keys, drafts, and attachment originals stay local. Requires HTTPS.                                                                                                |
| **Updates**           | Settings checks this repository’s latest stable GitHub Release, shows release notes, and links to the APK when available. Updates are never installed automatically.                                                                                                                   |

## Downloads

| Platform    | Get it                                                                                                                                                                                 | Notes                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web**     | [Open the web app](https://salt-fishes.github.io/deepchat/) or download the web bundle from [GitHub Releases](https://github.com/salt-fishes/deepchat/releases/latest) when available. | Serve the bundle over HTTP(S). Opening `index.html` directly through `file://` requires browser storage and cross-origin API requests to work in that context. |
| **Android** | Download `deepchat-release-signed.apk` from [GitHub Releases](https://github.com/salt-fishes/deepchat/releases/latest).                                                                | Current package ID: `com.deepchat.app`. The APK is self-signed, so Android may ask you to allow installation from that source.                                 |

If you are upgrading from the old `com.example.chatdemo` package, **back up your history before uninstalling it**. Current builds use `com.deepchat.app`.

## Development

Requirements: **Node.js 24+** and **pnpm**.

```sh
git clone https://github.com/salt-fishes/deepchat.git
cd deepchat
pnpm install
pnpm dev
```

The development server runs at <http://localhost:8090>. `pnpm build` writes the static web app to `dist/`; you can also download the web bundle from Releases when available.

| Command       | Purpose                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`    | Start the development server on port 8090.                                                                    |
| `pnpm build`  | Build the static web app into `dist/`.                                                                        |
| `pnpm test`   | Run the script test suite.                                                                                    |
| `pnpm apk`    | Build and sync web assets, then build an Android debug APK on Windows. See [Android build notes](ANDROID.md). |
| `pnpm type`   | Run TypeScript checks.                                                                                        |
| `pnpm lint`   | Run oxlint.                                                                                                   |
| `pnpm format` | Format the source with oxfmt.                                                                                 |

### API configuration

[rspack.config.ts](rspack.config.ts) defaults to `https://api.deepseek.com` and supports a build-time `apiOrigin` override.

| Area                      | Endpoint / behavior                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Chat**                  | Uses `deepseek-flash` through Anthropic-compatible `POST /anthropic/v1/messages`.                                 |
| **Files**                 | Uses `POST /anthropic/v1/files`.                                                                                  |
| **Search and extensions** | Web search, link reading, automatic titles, and the `latest_reminder` message role require DeepSeek’s extensions. |
| **Speech**                | ASR uses `POST /v1/tools/asr`; TTS uses `POST /v1/tools/tts`.                                                     |
| **Balance**               | Always uses DeepSeek’s official `GET https://api.deepseek.com/user/balance` endpoint.                             |

### Release tooling

Use these commands for the release workflow:

| Command                | Purpose                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm release:check`   | Validate release version consistency and readiness.                                         |
| `pnpm apk:release`     | Build the signed Android Release APK.                                                       |
| `pnpm release:package` | Package `deepchat-release-signed.apk`, the web ZIP, checksums, release notes, and manifest. |

See [RELEASE.md](RELEASE.md) for the release process and [CHANGELOG.md](CHANGELOG.md) for version history.

## Privacy and data

| Data                                           | Storage                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| **API key and preferences**                    | `localStorage` on the device.                                                          |
| **Web conversations and original attachments** | IndexedDB.                                                                             |
| **Android conversations**                      | Native WCDB.                                                                           |
| **Usage statistics**                           | A separate local IndexedDB database containing daily totals, not message text or keys. |

Chat, attachments, and speech send the relevant content to the configured API service. Official balance checks contact DeepSeek directly.

## Backups and deletion

- **Import:** deepchat validates the ZIP archive and asks for confirmation before **replacing** local history.
- **Export:** includes conversations and locally available original images. It excludes API keys, settings, usage statistics, and original non-image attachments.
- **Clear chats:** under **Settings → Data**, removes local conversations, attachments, and unsent drafts, and stops active replies. It does not remove settings, usage statistics, or files already uploaded to the API.

See the [ZIP format notes](src/services/chat/history/README.md) for archive details.

## Multi-device sync

Sync is optional and off until a device is configured.

- **Enable:** Settings → Account → Multi-device sync. Paste the `dsc1.…` code (it fills in the server address), or enter the server address and key separately. There is no pairing prompt afterwards.
- **What syncs:** session titles, messages, branch pointers, deletions, and image originals. Messages merge by ID; titles and branch selection use last-write-wins; deletions win over edits. Images are stored by SHA-256 on the server and downloaded on demand on other devices.
- **What stays local:** API keys, drafts, interface settings, and non-image attachments.
- **When it runs:** app launch, returning to the foreground, network recovery, shortly after messages are saved, and a visible-app poll. Fully closed apps do not sync until they are opened again.
- **Server:** any HTTPS service implementing `GET /v1/changes` and `POST /v1/push` works. A reference Node 22 + SQLite service (single owner key, independent `sync.db`) can run next to an existing bot deployment.

Sync requires HTTPS; Android WebView rejects self-signed certificates.

## Known limitations

- A DeepSeek API key is required. Web search, link reading, automatic titles, and `latest_reminder` depend on DeepSeek’s service extensions.
- ZIP backups are not full device or account snapshots: keys, settings, usage statistics, and original non-image attachments are not included.
- Hosting over `file://` may require special browser storage and cross-origin API permissions; HTTP(S) hosting is recommended.
- Android release APKs are self-signed for direct distribution, not Google Play App Signing builds. The `pnpm apk` helper uses `gradlew.bat` and is Windows-only.

## License

[MIT](LICENSE). Include the license when redistributing the build (`dist/LICENSE`). Third-party components retain their own licenses. Based on [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo).
