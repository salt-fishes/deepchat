# deepchat

[English](README.md) | 简体中文

deepchat 是基于 [DeepSeek API](https://platform.deepseek.com/) 的聊天客户端，提供 Web 与 Android 版本。**无需自建后端**：浏览器或 App 直接请求配置的 API 服务。

- [在线体验](https://salt-fishes.github.io/chat-demo/)
- [下载 Android APK](https://github.com/salt-fishes/chat-demo/releases/latest)
- [Android 构建与适配说明](ANDROID.md)

首次使用请在 **设置 → API Key** 中填写自己的密钥。

## 功能

- **对话**：多会话、自动标题、重命名与删除；编辑提问、重新生成、切换消息分支；停止生成与符合条件的继续生成。
- **思考与搜索**：深度思考（三档强度）、联网搜索、链接阅读与来源引用；思考过程默认折叠为最新内容预览，可在设置中关闭。
- **附件**：上传、粘贴与拖拽文件；Android 支持拍照、相册最近图片和自由比例裁剪。
- **语音**：空输入框长按录音并自动转写，回复可朗读。
- **渲染**：Markdown、代码高亮、KaTeX 公式与 Mermaid 图表；长回复分批流式显示。
- **界面**：中英文、浅色/深色/跟随系统、移动端布局、位置设置、历史导入导出。
- **交互**：Android 全页右滑打开历史列表，支持 Edge-to-edge、键盘避让与系统「减少动画」。

## 快速开始

### 在线使用

打开 [在线体验](https://salt-fishes.github.io/chat-demo/)，在设置中填入 API Key 即可。

### 本地静态页面

从 [Releases](https://github.com/salt-fishes/chat-demo/releases) 下载源文件，或构建 `dist/` 后直接双击 `dist/index.html`。直接以 `file://` 打开时，浏览器和 API 服务需允许本地页面的存储与跨域请求；更稳妥的方式是用任意静态服务器托管 `dist/`。

### Android 客户端

在 [Releases](https://github.com/salt-fishes/chat-demo/releases/latest) 下载 `chatdemo-release-signed.apk` 安装。应用为自签名，首次安装需允许「安装未知应用」。APK 与旧版使用同一签名证书，可直接覆盖安装。

### 从源码运行

准备 Node.js 22.12+ 与 pnpm：

```sh
git clone https://github.com/salt-fishes/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

打开 http://localhost:8090 。构建静态产物：

```sh
pnpm build
```

产物位于 `dist/`。Android 打包命令与原生适配细节见 [ANDROID.md](ANDROID.md)。

## 数据与隐私

API Key 和设置保存在浏览器 `localStorage`。Web 端会话及附件原件保存在 IndexedDB；Android 端默认使用原生 WCDB 单表存储（`id + json + blob`），不再依赖 IndexedDB。发送消息、上传附件或使用语音功能时，相关内容会提交给所配置的 API 服务。

设置中的历史导入导出使用 ZIP：导入经确认与校验后替换全部本地会话和附件；导出包含会话与本地可用图片原件，不含 API Key、设置和非图片附件原件。详见[历史导入导出格式](src/services/chat/history/README.md)。

**设置 → 数据管理 → 删除所有对话** 会清空本地会话、附件原件和未发送草稿，并停止正在生成的回复；API Key 与设置保留，已上传到服务端的文件不受影响。

## 开发

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建到 `dist/` |
| `pnpm apk` | 构建 Web 产物并打包 Android Debug APK |
| `pnpm type` | TypeScript 类型检查 |
| `pnpm lint` | oxlint 检查 |
| `pnpm format` | oxfmt 格式化 |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`，可通过 `createConfig({ apiOrigin, devServer })` 自定义。聊天默认使用 `deepseek-flash`，通过 Anthropic 兼容的 Messages / Files API 通信；语音使用 ASR / TTS 接口。搜索、链接阅读、标题与 `latest_reminder` 等扩展要求服务端支持相应能力，附件格式以服务端校验为准。

```text
src/
  app/                 应用布局、主题、手势与全局样式
  components/          聊天、输入、设置、Markdown 等 UI 组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、存储与历史导入导出
    markdown/          Markdown 解析、代码高亮、图表与流式显示
    speech/            录音与朗读
  utils/               通用工具
android/               Capacitor Android 壳（详见 ANDROID.md）
```

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自许可证。

本项目基于 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 修改，新增 Capacitor 封装的 Android 应用及上述交互、性能和视觉改进。
