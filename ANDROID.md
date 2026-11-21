# 封装为 Android 应用

本项目通过 Capacitor 8 把静态 Web 产物（`dist/`）封装成 Android WebView 应用，包名 `com.example.chatdemo`。

## 环境（本机已验证）

- JDK 21（需设置 `JAVA_HOME` 指向 JDK 21 安装目录；Capacitor 8 默认按 JDK 21 编译）
- Android SDK：platforms 35/36/37，build-tools 35/36/37
- Gradle wrapper 9.7.1（本机缓存）+ AGP 9.3.1

## 构建

```powershell
# 在项目根目录一键构建：Web 产物 → 同步到 Android → 编译 APK
pnpm apk
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

也可以分步：

```powershell
pnpm build
pnpm exec cap sync android
cd android
.\gradlew.bat assembleDebug --no-daemon
```

## 安装到设备 / 模拟器

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

## 已做的适配

- `AndroidManifest.xml`：声明 `INTERNET`、`RECORD_AUDIO`、`MODIFY_AUDIO_SETTINGS`；MainActivity 配置 `windowSoftInputMode="adjustResize"`。麦克风运行时权限申请由 Capacitor 的 `BridgeWebChromeClient` 自动处理。
- Capacitor 默认已开启 DOM Storage（localStorage / IndexedDB 可用）与媒体播放。
- `compileSdk` 与 `targetSdk` 均为 37。
- `proguard-android.txt` 改为 `proguard-android-optimize.txt`，release 已开启 `minifyEnabled` + `shrinkResources`（R8；Capacitor AAR 自带 consumer rules）。
- Gradle 与 AGP 版本改为本机缓存中已验证的版本，避免重复下载。

## 动效改造（2026-11-18）

按四轮调研（扫描 → 评估 → 审核 → 查漏补缺）的结论落地，分两批：

第一批（纯 CSS / 低风险）：
- `app/global.css`：全局 `prefers-reduced-motion` 兜底（保留 `body.change-theme` 机制）。
- `base/Modal.module.css`：弹窗遮罩淡入 + 内容淡入放大；不动画 `backdrop-filter`。
- `search/SearchPanel.module.css`：搜索面板入场（桌面横向、移动端纵向）。
- `sider/Sider.module.css`：移动端抽屉滑入 + 遮罩淡入。
- `base/Menu/Tooltip`、`search/HoverCard`：浮层 opacity 淡入（不加 scale，避免破坏 `useAnchoredPosition` 定位）。
- `base/Button/IconButton`：`:active` 按压回弹；Button 的 hover 包进 `@media (hover:hover)` 防止触屏粘滞。
- `sider/SessionItem`：会话重命名淡入 + 列表项挂载入场。
- `settings/SettingsDialog/Module.css`：导入导出状态文案淡入。

第二批（改结构）：
- `messages/ReplyArea`：思考/搜索区折叠改为常驻挂载 + grid 行高过渡（Chromium 107+；低版本降级为瞬间跳变）。

明确未做（风险大于收益）：消息气泡入场、主题/语言切换过渡、Toast 退场、版本切换淡入、SiteLogo shimmer、消息列表高度动画。C2 桌面侧栏动画未纳入本轮。

### C1 应用内图片查看器（后续补做）

消息中的图片从 `<a target="_blank">`（Android 上会跳系统浏览器）改为应用内全屏查看器：
- `messages/imageViewerState.ts`：全局 zustand state，按附件 id 打开。
- `messages/ImageViewer.tsx` + `.module.css`：全屏遮罩（z-index 2100），自行从 IndexedDB 读原件生成 blob URL 并管理生命周期；点击图片或 +/- 按钮分档缩放（1/1.5/2/3），放大后可拖动平移，下载、Esc / 点空白关闭，含入场淡入。
- `messages/MessageFile.tsx`：正常态图片改为按钮，点击 `openImageViewer`。
- `App.tsx` 挂载 `<ImageViewer />`；i18n 增 `imageViewer*` 文案（zh/en）。

约束：动画只动 `opacity/transform`；不给 `.frame`/输入框祖先加 transition；不做流式 token 级动画与 `scroll-behavior:smooth`。

## 使用体验优化（2026-11-21，第五轮：edge-to-edge 按官方文档补齐）

### 对照 Capacitor 8 SystemBars 文档复查（v1.6 / versionCode 7）
- **`MainActivity.onCreate` 补调 `EdgeToEdge.enable(this)`**（官方文档明确建议，Capacitor 9 起框架自动调用）：Android 15+ 本就强制 edge-to-edge，但 **Android 15 以下机型不开的话窗口不延伸到系统栏下，insets 不完整下发**，SystemBars 的两条避让路径都会失效——这正是部分真机（API ≤ 34）上「底部不避让手势区」的根因。
- `capacitor.config.ts` 显式声明 `insetsHandling: 'css'`（默认值，写明意图）：
  - **WebView ≥ 140**（Chromium bug [40699457](https://issues.chromium.org/issues/40699457) 已修）：真 insets 透传，`env(safe-area-inset-*)` 原生可用，同时注入 `--safe-area-inset-*` 为真实值；
  - **WebView < 140**：SystemBars 对 decorView **原生垫高**避让系统栏，注入变量按设计置 0（防止 CSS 二次避让）。
  - 模拟器实测走的是第二条路径（全屏 914 CSS px，viewport 839，差值 75px 即状态栏+手势条原生垫高），像素测量：输入卡下沿到手势条之间共约 60 CSS px 干净空白 = 视口内固定 32px + 原生垫掉的手势条区域（窗口背景色填充）。
- **底部空白升级为 `max(32px, 安全区变量)`**（SessionView 输入容器 / Welcome 页）：变量失效的机型保底 32px 不贴手势条；变量可用且更大时（三键导航 48px）取更大值。剪裁器全屏浮层底部同样加 `max(16px, …)` 保底，确认键不贴手势条。

## 使用体验优化（2026-11-21，第四轮）

### 全页抽屉手势（重做）
- 打开/关闭不再局限于左缘 28px 热区：**主内容任意位置**右滑打开、左滑关闭（关闭态在主内容上只认右滑，打开态只认左滑），抽屉与 sliver 上照旧可拖回。
- 纵向滚动不劫持：横向意图判定（|dx|>8px 且 |dx|>|dy|）+ `touch-action: pan-y`（主内容），被原生滚动接管时 pointercancel → 不提交直接归位。
- 提交门槛放宽：30% 进度或明显甩动即提交（原 35%/0.3）；文本输入元素（textarea/input/contenteditable）上不启动手势，避免与文本选择冲突。

### 交互修正
- **最近图片点击即添加**：去掉多选圆圈与「添加 N 张」确认步骤，点缩略图直接取原图加入草稿并收起面板。
- **聊天页底部直接预留固定空白**：SessionView 输入容器与 Welcome 页底部固定 32px 空白（不依赖系统安全区变量，任何设备上输入框下方都有一块干净的手势条避让区）；设置弹窗底部裸 `env()` 同步统一为 `var(--safe-area-inset-bottom, env(...))` 链。

### 位置信息自动定位（新增）
- 位置信息行右侧新增 📍 小图标：点击 → `navigator.geolocation` 定位（manifest 补 ACCESS_COARSE/FINE_LOCATION，运行时权限由 Capacitor 桥接处理）→ 反地理编码自动填入国家/省/市。
- 反查服务：BigDataCloud 免费客户端接口优先（免 Key、CORS、国内可达性较好），Nominatim (OSM) 兜底；中国境内按省/市中文名（去后缀归一化）匹配本地行政区划代码，境外匹配国家码；失败/权限拒绝 toast 提示。
- Node 实测匹配：杭州 → 330000/330100，上海 → 310000/310100，境外坐标 → 对应国家码。

### 剪裁自由比例 + 输入区微调（第四轮追加）
- **剪裁器重构为自由框选模型**：图片定住，裁剪框可整体拖动、四角拖拽**任意比例**缩放（限图片内，最小 48px），另有一排比例预设一键套用（自由/原始/1:1/3:4/4:3/16:9/9:16，可横滑）；确认未做任何操作时原样交回原文件。框选区域带三分线与四角柄。
- 附件卡片去掉左上角剪裁按钮（只留右上 ✕）；点击卡片本体进入回览，右上「剪裁」图标进入自由框选。
- 输入区底部「内容由 AI 生成」提示移除（欢迎页与会话页）。
- 思考强度菜单不再被屏幕左缘剪裁（去掉 maxHeight 分支，改走视口钳制的定位）。
- 「深度思考 / 联网搜索」文字常显（去掉窄屏收起逻辑，药丸内边距收紧，极窄屏兜底省略号）。

### 主题选择改为行右侧三个并排小图标
- 浅色 / 深色 / 跟随系统改为左侧标题、右侧三个 44px 图标按钮（与语言/音色/位置行同布局；aria-label/title 保留无障碍文案），选中态品牌色描边 + 高亮底色。


对齐官方 App 侧栏设计 + 修复拍照 + 层级修复：

## 使用体验优化（2026-11-21，第三轮）

### 照片剪裁与回览（新增）
- **全屏回览/剪裁浮层 `ImageCropper`**（对齐官方拍照后的界面）：顶部左 X、中间标题、右「剪裁」图标；preview 模式整图回览，右上图标切换到 crop 模式后出现裁剪框（四角标 + 9999px 外阴影压暗四周）与 原始/1:1 比例芯片，单指拖动、双指捏合（桌面滚轮），底部大号白色圆 ✓ 确认。未做任何裁剪操作时确认原样交回原文件（不重编码、不重传）。
- 三个入口统一走 `openCropper(file, mode)`（Promise，取消 resolve null，经返回键浮层栈关闭）：**拍照后自动进入回览**（确认才入草稿，取消丢弃）、**附件图片卡片点击查看**、**卡片左上角剪裁按钮直接进裁剪模式**。
- 确认后 canvas 裁切输出 JPEG（≤4096px、0.92 质量、白底防透明），`replaceDraftAttachment` 用同 id 原位替换附件并重新上传，预览 URL 同步刷新。
- **最近图片单击即添加**（缩略图本体），右上圆圈保留多选 +「添加 N 张」。
- 模拟器实测：拍照 → 回览 → 剪裁模式 → 平移 → 1:1 → ✓ → 裁剪文件进入添加管线；点击即添加生效（无 Key 时按设计弹 Key 引导）。


对齐官方 App 侧栏设计 + 修复拍照 + 层级修复：

### 推挤抽屉层级修复（关键）
- **现象**：抽屉打开时是抽屉的阴影压在聊天卡片上（抽屉画在主内容上层），与官方「主内容右移、卡片压在抽屉上」相反。
- **根因**：移动端 `.frame` 是 `position: fixed`——Chrome 里 fixed 元素必定创建层叠上下文，`.main` 的 `z-index: 761` 被困在 frame 内部；而抽屉此前 portal 到 body（根层级 z 760），根层级比较时 frame（z auto）整体低于抽屉。
- **修复**：抽屉去掉 portal，直接渲染在 `.frame` 内（Sider.tsx `MobileSider`）；`.main` 补不透明底色挡住抽屉自身阴影。像素级验证：卡片左缘阴影只落在抽屉侧，与官方截图一致。

### 侧栏布局对齐官方浅色截图（移动端）
- 抽屉顶部直接是搜索框（去掉应用名行/收起按钮/新对话按钮，新对话入口在顶栏）；搜索框加高到 46px；会话行加高到 48px。
- 抽屉宽度 `--sider-width` 从 88vw 改为 `min(83vw, 480px)`（官方实测约 82.7vw）：右侧 sliver 更宽，拖拽关闭的手势区域更大。
- 底部设置行保留不变。

### 拍照修复（原生相机 intent）
- **现象**：附件面板点「拍照」弹的是文件选择器——Android WebView 的 `<input capture>` 只会走通用文件选择，调不起相机。
- **修复**：`MediaGalleryPlugin` 新增 `takePhoto`：`ACTION_IMAGE_CAPTURE` + FileProvider（`cache/camera/` 临时文件授权给相机应用），拍完读回、按 EXIF 方向旋转、缩到 ≤4096px 转 base64 返回，临时文件即用即删；全程不需要存储权限，无相机应用或取消时回退/保持面板。`AttachSheet` 的拍照卡片优先走原生链路，失败才回退 WebView input。
- 模拟器实测：调起 `com.android.camera2` → 拍照 → 确认 → 回传 App。

### 浮层安全区补漏
- `Modal`（portal 到 body 的全屏浮层）移动端补上下安全区 padding，超高时内容内部滚动；其余浮层（Toast/ImageViewer/抽屉/附件面板/SearchPanel）此前已处理。

### 联网搜索费用（调研结论，无代码改动）
- **自 2026-11-18 12:00 起，DeepSeek 模型调用触发的服务端搜索/网页抓取（`deepseek_web_search` / `deepseek_read_url`）工具调用本身不再计费**，工具结果拼进上下文只按模型 Token 计费（官方价格页）。本项目「智能搜索」声明的正是这套服务端工具，已处于免工具费路径；按次计费（5 元/1000 次）的只是独立 Search/Fetch API，本项目没有用到。

### 语音能力（已有，无需新接入）
- 项目本就内置完整语音链路：输入框麦克风按钮 → 录音（16kHz WAV）→ `POST /v1/tools/asr` 转写回填输入框（单次 ≤120s）；消息朗读走 `POST /v1/tools/tts`。APK 内麦克风按钮可见可用（Capacitor 自动处理 RECORD_AUDIO 运行时权限）。转写调用需要已保存的真实 API Key（表单经 GET /models 校验后才能保存），真机联调留待有 Key 时验证。



在第一轮（返回键/键盘/edge-to-edge/性能/动效/包体积）基础上，对齐 DeepSeek 官方 App 的交互：

## 使用体验优化（2026-11-21，第二轮）

### 思考强度（新增）
- 官方文档确认 `thinking.budget_tokens` 被网关忽略，思考强度走 `output_config: { effort }`，有效档位 `low / high / max`（默认 high）。
- 设置持久化 `chat-demo:thinking-effort`；DeepThink 药丸开启时右侧出现强度箭头，点击弹出三档菜单（轻量/标准/极致）。强度随回复快照（续写/重新生成沿用）。

### 附件面板（新增）
- 加号 ⊕ 点击后与输入框连体滑出面板（⊕ ↔ ✕ 切换）：**最近图片**（设备相册，可多选）+ **拍照 / 相册 / 文件** 三张大卡片。
- 新增原生插件 `MediaGalleryPlugin`（`getRecentPhotos` 缩略图 / `getPhoto` 原图，MediaStore 查询 + base64 下发）；权限 `READ_MEDIA_IMAGES`(33+) / `READ_EXTERNAL_STORAGE`(≤32)，首用自动申请。
- 三个入口统一走 `acceptFiles → addDraftFiles` 校验/上传管线；相册入口的 accept 由扩展名白名单过滤生成。

### 侧栏推挤式抽屉（重做）
- 移动端抽屉改为 portal + fixed 全高（自吃安全区 padding），主内容右移露出圆角 sliver（无遮罩，同官方）；顶部新增会话搜索框（按标题过滤）。
- 左缘滑动手势（`useDrawerGesture.ts`）：关闭态左缘拖出、打开态横向拖回，跟手进度直写 DOM，按进度+速度提交；sliver 点击关闭。
- **系统手势冲突**：左缘滑动会被 Android 返回手势半路接管，`MainActivity` 已声明 WebView 上左缘中部 200dp 高、28dp 宽的 `systemGestureExclusionRects`（系统上限 200dp），热区从汉堡按钮下方（top 110px）开始。
- 时间分组 30 天以上统一为「更早」（原按月分组）。

### 动效补充
- DragMask 淡入、Select 下拉入场、输入框开关 color 过渡、发送键 opacity 过渡、Mermaid/KaTeX 渲染切换淡入、搜索引用图淡入、流式结束操作栏淡入、欢迎语入场、会话项选中态过渡。
- 全部只动 opacity/transform，受全局 `prefers-reduced-motion` 兜底。

### 后续项（未做）
- 联网链路实测（CORS/SSE 是否被 api.deepseek.com 放行）；如被拦，可考虑选择性 CapacitorHttp（非流式请求）或自定义原生 SSE 桥（流式）。
- 消息列表虚拟化、mermaid 瘦身、splitChunks 调优、草稿持久化、流式断线自动重试、`@capacitor/browser` 外链应用内打开、Modal/Tooltip 退场动画。

## 使用体验优化（2026-11-21，第一轮）

针对返回键、键盘、edge-to-edge、启动与长对话性能、动效、包体积六项落地：

### 返回键（P1）
- 新增 `@capacitor/app` 插件（`src/app/backButton.ts` 注册）：返回键自顶向下关闭浮层——图片查看器 → 弹窗（`Modal.tsx` 新导出 `closeTopmostModal`）→ 搜索面板 → 移动端抽屉，全关闭时才 `App.exitApp()`。Web 端不注册。

### 键盘（P2）
- MainActivity 补上 `windowSoftInputMode="adjustResize"`（此前缺失，是键盘跳动的主因）。
- viewport meta 加 `interactive-widget=resizes-content`（Chromium 108+）。`src/app/viewport.ts` 的 visualViewport 手动补偿保留。

### Edge-to-edge 沉浸式（P6）
- viewport meta 加 `viewport-fit=cover` + `capacitor.config.ts` 配 `SystemBars.initialViewportFitValueHint: 'cover'`：Capacitor 8 内置 SystemBars 插件进入 CSS 透传模式（WebView ≥ 140），系统栏透出页面，安全区以 `--safe-area-inset-*` CSS 变量下发（WebView < 140 自动降级为原生垫高，底色随深浅色）。
- `App.module.css` 的 `.frame` 四边吃掉安全区（`var(--safe-area-inset-*, env(...))` 回退模式，桌面浏览器为 0）；`Toast`、`ImageViewer` 工具栏同样处理。
- `src/app/theme.ts` 通过 `registerPlugin('SystemBars')` 在应用内主题变化时同步状态栏/手势条图标颜色（LIGHT/DARK）。
- `styles.xml`：`AppTheme` 改 DayNight；`AppTheme.NoActionBar` 加 `windowBackground`；启动屏改用 core-splashscreen 属性（`windowSplashScreenBackground` + `windowSplashScreenAnimatedIcon`），新增 `values/colors.xml` 与 `values-night/colors.xml`（浅 #FFFFFF / 深 #151517，与 Web 端底色一致），深色模式下启动屏与系统栏不再发白。

### 启动与长对话性能（P3）
- KaTeX 预热（约 258KB JS + 24KB CSS）从启动同步改为首帧渲染后 `requestIdleCallback` 触发（`src/main.tsx`），公式未就绪时先显示原文。
- 消息行容器加 `content-visibility: auto` + `contain-intrinsic-size`（`UserMessage.module.css` / `AssistantMessage.module.css`），视口外消息跳过渲染；未做虚拟化（列为后续项）。

### 动效（P4）
- 消息入场：仅同会话内新追加的末条消息（`MessageList.tsx` `enteringId`）与版本切换后的新消息淡入上移 240ms；会话切换不整屏闪动。
- Toast 退场：清空后保留 200ms 播放淡出（`Toast.tsx` / `Toast.module.css`）。
- 全部只动 opacity/transform，且受全局 `prefers-reduced-motion` 兜底。

### 包体积（P5）
- release 开启 R8 混淆 + 资源收缩。
- `scripts/strip-fonts.mjs`：构建后删除 KaTeX 字体的 woff/ttf 副本只留 woff2（减少约 0.5MB 未压缩体积）。
- 删除 `java17.init.gradle`（本机已有 JDK 21），`pnpm apk` 与文档命令不再带 `-I` 参数。
- versionCode 2 / versionName 1.1。

### 后续项（本轮未做）
- 联网链路实测（CORS/SSE 是否被 api.deepseek.com 放行）；如被拦，可考虑选择性 CapacitorHttp（非流式请求）或自定义原生 SSE 桥（流式）。
- `@capacitor/browser` 应用内外链、消息列表虚拟化、mermaid 瘦身、splitChunks 调优、草稿持久化、流式断线自动重试。

## 自签名 release 包

本机已生成自签名 keystore 并配置好 release 签名，可直接构建正式包：

```powershell
cd android
.\gradlew.bat assembleRelease --no-daemon
```

产物：`android/app/build/outputs/apk/release/app-release.apk`（约 5 MB）

- keystore：`android/app/chatdemo-release.jks`（alias `chatdemo`，有效期 10000 天，RSA 2048）。keystore 与密码均不入库，放在本地 `android/signing.properties`（模板见 `signing.properties.example`）。
- 签名信息放在 `android/signing.properties` 的 `chatdemo.*` 项，`build.gradle` 读取它而非写死密码；该文件已加入 `.gitignore`，请勿提交。
- 使用 APK Signature Scheme v2（minSdk 24 支持）。验证：
  ```powershell
  & "$env:ANDROID_HOME\build-tools\37.0.0\apksigner.bat" verify --verbose --print-certs android\app\build\outputs\apk\release\app-release.apk
  ```
- 证书 DN：`CN=Chat Demo, OU=Dev, O=ChatDemo, L=Beijing, ST=Beijing, C=CN`；SHA-256 `e10ad0289d8be79b99b45fc5e93bb32fb664cf4dfca6b53b1b89caee2a0db9f1`
- 注意：debug 与 release 签名不同，覆盖安装前需先 `adb uninstall com.example.chatdemo`。
- 这是自签名证书，不属于 Google Play 官方签名，上架时需改用 Play App Signing 或正式密钥；本地分发可用。

## 已知限制

- 调试包使用默认 debug 签名，不能直接上架；release 已配好签名，用 `assembleRelease` 构建。
- 应用请求 `https://api.deepseek.com`，需保证 WebView 的源被 API 的 CORS 策略允许（实测通过则无碍；若被拦见「后续项」）。
- `pnpm apk` 写死 `gradlew.bat`，仅限 Windows 本机；CI（Pages workflow）不构建 APK。
