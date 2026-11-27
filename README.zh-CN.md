<div align="center">
  <h1>deepchat</h1>
  <p><strong>独立、开源的 DeepSeek API 客户端，支持 Web 与 Android。</strong><br>
  无需独立后端 · 自带 API Key · 本地保存会话</p>
  <p>
    <img src="https://img.shields.io/badge/Independent-Open%20Source-2ea44f?style=flat-square" alt="独立开源项目">
    <img src="https://img.shields.io/github/v/release/salt-fishes/deepchat?style=flat-square" alt="最新 GitHub 版本">
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT 许可证">
    <img src="https://img.shields.io/badge/Platform-Web%20%7C%20Android-lightgrey?style=flat-square" alt="Web 与 Android">
    <img src="https://img.shields.io/badge/API%20Key-BYOK-4D6BFE?style=flat-square" alt="自带 API Key">
  </p>
  <p>
    <a href="https://salt-fishes.github.io/deepchat/" style="display:inline-block;padding:10px 18px;margin:4px;border-radius:8px;background:#4D6BFE;color:#fff;text-decoration:none;font-weight:600;">打开网页版</a>
    <a href="https://github.com/salt-fishes/deepchat/releases/latest" style="display:inline-block;padding:10px 18px;margin:4px;border-radius:8px;background:#24292f;color:#fff;text-decoration:none;font-weight:600;">下载 Android 版</a>
    <a href="https://github.com/salt-fishes/deepchat" style="display:inline-block;padding:10px 18px;margin:4px;border-radius:8px;background:#24292f;color:#fff;text-decoration:none;font-weight:600;">源代码</a>
  </p>
  <p><strong>简体中文</strong> · <a href="README.md">English</a> · <a href="https://github.com/salt-fishes/deepchat/issues">反馈问题</a></p>
</div>

Android 版的界面与交互近乎还原原版 DeepSeek 客户端。

## 快速开始

1. **打开 deepchat**：使用[网页版](https://salt-fishes.github.io/deepchat/)，或安装 [Android APK](https://github.com/salt-fishes/deepchat/releases/latest)。包名与安装注意事项见[下载与安装](#下载与安装)。
2. **添加 API Key**：进入 **设置 → 账号管理**，输入并保存 [DeepSeek API](https://platform.deepseek.com/) 密钥。应用会先验证密钥，再保存。
3. **开始对话**：同一账号管理页面还可测试连接、移除已保存的密钥，以及查询 DeepSeek 官方返回的总可用余额、充值余额与赠送余额；金额币种以 DeepSeek 返回结果为准。

## 功能

| 能力           | 说明                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **对话**       | 管理会话、搜索历史、编辑提问、重新生成、切换消息分支、停止生成和续写可继续的回复。回复以流式输出，支持 Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。                                            |
| **思考与搜索** | 三档思考强度，支持联网搜索、链接阅读和来源引用。在 **设置 → 个性化** 中调整思考内容折叠方式及默认思考、搜索选项。输入框里的临时切换只作用于本次打开应用期间的当前对话。                           |
| **附件与语音** | 可上传、粘贴或拖入附件；Android 还支持拍照和裁剪。长按空输入框可语音转写，回复支持朗读。设置中可试听音色，试听会调用语音接口，可能产生费用。                                                      |
| **个性化**     | 支持英文和简体中文、浅色／深色／跟随系统；聊天字号独立于应用界面。Android 支持滑动手势打开会话列表，并遵循系统的减少动态效果偏好。                                                                |
| **数据与用量** | 在 **设置 → 数据** 中导入／导出 ZIP 备份或清空会话。**使用统计** 可查看今天、近 7 天、近 30 天的本机聊天请求次数和 API 返回的输入／输出 Token。从当前版本开始统计，不回填历史，不等同于平台账单。 |
| **检查更新**   | 设置会查询本仓库最新正式 GitHub Release，展示更新说明及可用的 APK 下载入口，不会自动安装更新。                                                                                                    |

## 下载与安装

| 平台        | 获取方式                                                                                                                                                          | 说明                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Web**     | [打开网页版](https://salt-fishes.github.io/deepchat/)，或在有可用构建时从 [GitHub Releases](https://github.com/salt-fishes/deepchat/releases/latest) 下载网页包。 | 建议通过 HTTP(S) 托管。直接通过 `file://` 打开 `index.html` 时，浏览器和 API 服务都需要允许该页面的存储和跨域请求。 |
| **Android** | 从 [GitHub Releases](https://github.com/salt-fishes/deepchat/releases/latest) 下载 `deepchat-release-signed.apk`。                                                | 当前包名：`com.deepchat.app`。APK 为自签名，Android 可能会询问是否允许从当前来源安装。                              |

如果还在用包名为 `com.example.chatdemo` 的旧版，请**先备份聊天记录，再卸载旧版**。当前版本使用 `com.deepchat.app`。

## 开发

环境要求：**Node.js 24+** 和 **pnpm**。

```sh
git clone https://github.com/salt-fishes/deepchat.git
cd deepchat
pnpm install
pnpm dev
```

开发地址为 <http://localhost:8090>。`pnpm build` 将静态网页构建到 `dist/`；有可用构建时，也可从 Releases 下载网页包。

| 命令          | 用途                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`    | 在 8090 端口启动开发服务器。                                                                      |
| `pnpm build`  | 将静态网页构建到 `dist/`。                                                                        |
| `pnpm test`   | 运行脚本测试套件。                                                                                |
| `pnpm apk`    | 在 Windows 上构建并同步网页资源，然后生成 Android 调试 APK。参见 [Android 构建说明](ANDROID.md)。 |
| `pnpm type`   | 检查 TypeScript 类型。                                                                            |
| `pnpm lint`   | 运行 oxlint 检查。                                                                                |
| `pnpm format` | 使用 oxfmt 格式化源码。                                                                           |

### API 配置

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`，并支持构建时指定 `apiOrigin`。

| 模块           | 接口／行为                                                                          |
| -------------- | ----------------------------------------------------------------------------------- |
| **对话**       | 使用 `deepseek-flash`，通过 Anthropic 兼容的 `POST /anthropic/v1/messages` 接口。   |
| **文件**       | 使用 `POST /anthropic/v1/files`。                                                   |
| **搜索与扩展** | 联网搜索、链接阅读、自动标题和 `latest_reminder` 消息角色需要 DeepSeek 的扩展支持。 |
| **语音**       | ASR 使用 `POST /v1/tools/asr`；TTS 使用 `POST /v1/tools/tts`。                      |
| **余额**       | 始终使用 DeepSeek 官方 `GET https://api.deepseek.com/user/balance` 接口。           |

### 发布工具

发布流程使用以下命令：

| 命令                   | 用途                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `pnpm release:check`   | 检查发布版本的一致性与准备情况。                                       |
| `pnpm apk:release`     | 构建带签名的 Android Release APK。                                     |
| `pnpm release:package` | 打包 `deepchat-release-signed.apk`、网页 ZIP、校验和、发布说明和清单。 |

发布流程见 [RELEASE.md](RELEASE.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 隐私与数据

| 数据                   | 存储位置                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| **API Key 与设置**     | 当前设备的 `localStorage`。                                         |
| **Web 会话与附件原件** | IndexedDB。                                                         |
| **Android 会话**       | 原生 WCDB。                                                         |
| **使用统计**           | 单独的本地 IndexedDB 数据库，仅记录每日用量，不包含聊天正文或密钥。 |

聊天、附件和语音功能会把相应内容发送到所配置的 API 服务；官方余额查询直接访问 DeepSeek。

## 备份与删除

- **导入**：deepchat 会先校验 ZIP 归档，并在确认后**替换**本机历史。
- **导出**：包含会话和本机仍有原件的图片，不包含 API Key、设置、用量统计或非图片附件原件。
- **清空会话**：在 **设置 → 数据** 中操作，会移除本机会话、附件及未发送草稿，并停止进行中的回复；不会清除设置、用量统计或已上传到 API 服务的文件。

归档格式详见[历史备份格式说明](src/services/chat/history/README.md)。

## 已知限制

- 需要 DeepSeek API Key。联网搜索、链接阅读、自动标题和 `latest_reminder` 依赖 DeepSeek 的服务扩展。
- ZIP 备份不是完整的设备或账号快照：不包含密钥、设置、用量统计和非图片附件原件。
- 通过 `file://` 托管时，可能需要额外配置浏览器存储和跨域 API 权限；建议使用 HTTP(S) 托管。
- Android 正式 APK 采用自签名，用于直接分发，不是 Google Play App Signing 构建。`pnpm apk` 辅助命令调用 `gradlew.bat`，仅限 Windows。

## 许可证

项目使用 [MIT 许可证](LICENSE)，分发构建产物时请附上 `dist/LICENSE`。第三方组件适用各自的许可证。本项目基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)。
