# deepchat

[English](README.md) · 简体中文

deepchat 是一个使用 [DeepSeek API](https://platform.deepseek.com/) 的独立开源聊天客户端，提供网页和 Android 版本。无需部署后端，使用自己的 API Key 即可。

Android 版的界面与交互近乎还原原版 DeepSeek 客户端。

[打开网页版](https://salt-fishes.github.io/deepchat/) · [下载 Android 版](https://github.com/salt-fishes/deepchat/releases/latest) · [反馈问题](https://github.com/salt-fishes/deepchat/issues)

## 开始使用

打开网页版，或从 GitHub Releases 下载 `deepchat-release-signed.apk`。APK 为自签名，Android 可能会询问是否允许从当前来源安装。如果还在用包名为 `com.example.chatdemo` 的旧版，请先备份聊天记录，再卸载旧版。当前版本的包名是 `com.deepchat.app`。

进入 **设置 → 账号管理**，输入并保存 DeepSeek API Key。应用会先验证密钥，再保存。同页可测试连接、清除本机密钥，以及查询 DeepSeek 开放平台返回的总可用余额、充值余额与赠送余额。

## 功能

- **对话**：新建、搜索和管理会话，编辑提问、重新生成、切换消息分支、停止生成和续写。回复以流式输出，支持 Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- **思考与搜索**：三档思考强度，支持联网搜索、链接阅读和来源引用。到「设置 → 个性化」调整思考内容折叠方式、默认思考强度和默认搜索开关。输入框里的临时切换只作用于本次打开应用期间的当前对话。
- **附件与语音**：可上传、粘贴或拖入附件，Android 还支持拍照和裁剪。长按空输入框可语音转写，回复支持朗读。设置中可试听音色，试听会调用语音接口，可能产生费用。
- **外观**：支持简体中文和英文、浅色／深色／跟随系统；聊天字号独立于应用界面。Android 可以用滑动手势打开会话列表，界面遵循系统的减少动态效果偏好。
- **数据管理**：用 ZIP 导入、导出历史，或清空会话。「使用统计」可以查看今天、近 7 天、近 30 天的本机聊天请求次数和 API 返回的输入／输出 Token。从当前版本开始统计，不回填历史，不等同于平台账单。
- **检查更新**：查询本仓库最新正式发布，展示更新说明及可用的 APK 下载入口，不自动安装。

## 数据和隐私

API Key 和设置保存在当前设备的 `localStorage`。Web 端用 IndexedDB 保存会话和附件原件，Android 端的会话数据用原生 WCDB 保存。使用统计单独保存在 IndexedDB，只记录每日用量，不包含聊天正文或密钥。聊天、附件和语音功能会把相应内容发给所配置的 API 服务；额度查询直接访问 DeepSeek 官方接口。

导入会先校验 ZIP，确认后**替换**本机历史。导出包含会话和本机仍有原件的图片，不包含密钥、设置、用量统计或非图片附件原件。清空会话会移除本机会话、附件及未发送草稿，并停止进行中的回复；不会清除设置、用量统计或已上传到服务端的文件。详见 [历史备份格式](src/services/chat/history/README.md)。

## 从源代码构建

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/salt-fishes/deepchat.git
cd deepchat
pnpm install
pnpm dev
```

开发地址为 <http://localhost:8090>。`pnpm build` 将网页构建到 `dist/`，也可从 Releases 下载已发布的网页包。建议通过 HTTP(S) 托管；直接双击 `index.html` 时，浏览器和 API 服务都需要允许 `file://` 页面的存储和跨域请求。

| 命令 | 用途 |
| --- | --- |
| `pnpm apk` | 在 Windows 上构建网页、同步资源并生成 Android 调试 APK。参见 [Android 构建说明](ANDROID.md)。 |
| `pnpm type` | 检查 TypeScript 类型。 |
| `pnpm lint` | 运行 oxlint 检查。 |
| `pnpm format` | 使用 oxfmt 格式化源码。 |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`，可在构建时指定 `apiOrigin`。聊天使用 `deepseek-flash` 和 Anthropic 兼容的 Messages／Files 接口；联网搜索、链接阅读、自动标题和 `latest_reminder` 需要服务方支持相应扩展。语音走 ASR／TTS 接口。额度固定查 DeepSeek 官方接口。

## 许可证

项目使用 [MIT 许可证](LICENSE)，分发构建产物时请附上 `dist/LICENSE`。第三方依赖适用各自的许可证。本项目基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)。
