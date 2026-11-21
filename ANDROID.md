# 封装为 Android 应用

本项目通过 Capacitor 9（9.0.0-rc.0，`next` 标签）把静态 Web 产物（`dist/`）封装成 Android WebView 应用，包名 `com.example.chatdemo`。

## 环境（本机已验证）

- JDK 21（需设置 `JAVA_HOME` 指向 JDK 21 安装目录；Capacitor 9 默认按 JDK 21 编译）
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

## WCDB 2.1.15 接入方式

Android 端所有会话、摘要、附件原件和导入暂存都存进原生 WCDB，IndexedDB 仅用于 Web 端。会话与摘要以 JSON 文本保存，附件原件以 BLOB 保存；`WcdbRecord`（`@WCDBTableCoding`，主键 `id`）由注解处理器生成 `DBWcdbRecord`。`WcdbStore` 提供按 kind 的读写和事务批量操作，`WcdbStoragePlugin` 把它们暴露给 Web 层。数据库文件位于应用私有目录 `files/deepchat.db`。

`android/app/build.gradle` 已配置 `main`、`annotation` 和 Java `annotationProcessor`。用 `@WCDBTableCoding` 声明模型，再用 `@WCDBField` 标记需要持久化的字段。编译器会从 `WcdbProbe.java` 生成 `DBWcdbProbe`，供建表和类型安全查询使用。以下示例在 Android 后台线程运行，数据库放在应用私有目录。

```java
Database database = new Database(new java.io.File(context.getFilesDir(), "wcdb-probe.db").getPath());
database.createTable("probe", DBWcdbProbe.INSTANCE);

WcdbProbe row = new WcdbProbe();
row.id = 1;
row.content = "hello";
database.insertObject(row, DBWcdbProbe.allFields(), "probe");
WcdbProbe result = database.getFirstObject(
    DBWcdbProbe.allFields(), "probe", DBWcdbProbe.id.eq(1)
);
```

`Database` 来自 `com.tencent.wcdb.core`。正式表需要按访问模式定义主键和索引。批量写同一表可用 `insertObjects`，涉及会话、附件元数据等多个表的更新可在同一个事务中提交。

历史 ZIP 格式可继续在 Android 和网页间交换：WCDB 中的暂存表承担校验与原子替换，与 Web 端 IndexedDB 的暂存语义一致。应用不做历史数据迁移，从首次安装起 WCDB 就是 Android 端的唯一存储。[WCDB Java/Kotlin 文档](https://github.com/Tencent/wcdb/wiki/Java%7CKotlin-%E5%BF%AB%E9%80%9F%E5%85%A5%E9%97%A8)

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

### 底部避让保底全覆盖（v1.9 / versionCode 10 追加）
- 排查「底部避让消失」反馈：模拟器逐像素复测欢迎页/会话页（卡片下沿 2256/2257、手势条 2373，空白条完好），构建产物 `max(32px, var)` 链完好——聊天页保底在任何 insets 路径下数学上不可能低于 32px。
- 全部浮层表面补齐保底（此前仅聊天页/欢迎页/剪裁器有）：**抽屉 Settings 行 `max(24px, var)`**、**设置二级页内容底部 `max(32px, var)`**、**Modal 移动端遮罩 `max(16px, var)`**、**图片查看器底栏 `calc(8px + max(12px, var))`**——覆盖安全区变量失效 ROM 上「贴到手势条」的场景。
- 观感变化说明：v1.7 起按官方文档开启 EdgeToEdge，应用背景延伸到手势条下方（沉浸式，同官方）；与旧版「应用在手势条上方硬截止」的观感不同属预期。

## 对齐官方交互（2026-11-21，第六轮，v1.8 / versionCode 9）

### ① 顶部避让真机失效的根因
- `insetsHandling` 从 `native` 切回 **`css`**：注入值来自**原生 WindowInsets API**（不经过 Chromium），部分 ROM 会把 WebView 的 `env(safe-area-inset-*)` 破坏为 0——passthrough 路径下没有原生垫高，CSS 又拿不到值，顶部就裸奔了；css 模式在此类设备上仍能拿到真实安全区。WebView < 140（Chromium bug 40699457）依然走 decorView 原生垫高、变量按设计置 0。

### ② 历史记录页与背景同色
- `.drawer` 背景改为 `var(--dsw-alias-bg-base)`，去掉自身圆角与阴影：**历史记录页就是背景本身，聊天页面（圆角 + 阴影在 .main 一侧）叠在其上**，与官方层级一致。

### ③④ 设置改为独立二级界面
- 移动端不再用底部弹层（Modal），改为**全屏二级页面**：右侧滑入（0.28s）、左上 ← 返回 + 标题、`padding-top: var(--safe-area-inset-top)` 避让状态栏、内容底部 `max(16px, 安全区)` 避让手势条；确认弹窗（导入覆盖 / 全部删除 / API Key 确认）仍为 Modal（z 1000 > 页面 900）叠在页面之上。
- 返回键走 `registerOverlayToken` 弹窗关闭栈：确认弹窗后注册、栈顶优先；页面关闭保持挂载到滑出动效播完。桌面端保留原居中弹窗布局。

### ⑤ 去掉麦克风按钮，长按语音输入
- 功能行麦克风按钮移除（VoiceButton 组件删除）。
- **空输入时在输入区按下 ≥ 450ms 自动开始录音**（频谱接管输入区、键盘收起），松开手指自动结束并转写填入输入框；录音监听挂 `window` 的 pointerup/pointercancel（手指可能滑出命中区）。
- 长按处理挂在 `.textareaWrapper`（录音中 textarea `visibility:hidden` 不可命中）；`onContextMenu` 屏蔽空输入框的原生长按菜单；录音中再次长按可收尾（覆盖首次授权弹窗打断按住的场景）；全局收尾监听只认 recording 状态，避免把转写请求误取消。
- 真机链路已在模拟器实测：450ms 定时 → getUserMedia 授权弹窗 → 录音（状态栏绿麦）→ 松开 → 转写（假 Key 报错 toast 为预期）。

### ⑥ 深度思考胶囊重叠修复
- 根因：`.toggle` 是 `flex-shrink: 0`，窄屏（约 360px 级）时功能行溢出，胶囊直接压到右侧按钮上。
- `.toggle` 改 `flex-shrink: 1; min-width: 0`，`.toggleMain` 加 `min-width: 0`：窄屏时文字省略号收缩、强度箭头（flex-shrink: 0）保持可见，任何宽度都不再重叠。

### 测试方法备注
- 真实触摸测试用 `adb shell input swipe x y x y <ms>`（同点长按）。**坐标必须加 WebView 原生垫高的状态栏偏移**（模拟器 136px）：CSS y × 2.625 + 136。此前多次"长按无效"均为测试坐标偏移所致，功能本身正常。

## Capacitor 9 升级 + edge-to-edge 修正（2026-11-21，第五轮，v1.7 / versionCode 8）

### 升级 Capacitor 9.0.0-rc.0（v9 尚未正式发布，npm `next` 标签）
- `@capacitor/core` / `@capacitor/android` / `@capacitor/cli` → 9.0.0-rc.0，`@capacitor/app` → 9.0.0-alpha.2；CLI 要求 Node ≥ 24（本机已满足）。AGP 9.3.1 / Gradle 9.7.1 兼容可用（v9 模板为 AGP 9.4.1 / Gradle 9.8.2，非硬性要求）；release 的 R8 本就手动开启，不受「v9 默认开 R8」影响。

### v1.6 引入的界面破坏（根因与修正）
- **根因**：`EdgeToEdge.enable(this)` 被放在 `super.onCreate` **之前**，窗口 decor 以启动主题先创建，硬塞出一个原生 ActionBar（旧版「Chat Demo」标题条），挤掉原布局——即用户看到的「破坏了原来的界面」。
- **修正**：按 Capacitor 9 迁移器（`migrate-edge-to-edge`）的规范位置移到 `super.onCreate` **之后**。v9 迁移器检测到已有调用会自动跳过，写法与官方一致。
- `insetsHandling` 切到 v9 默认的 `native`：WebView ≥ 140 时 insets 透传、`env(safe-area-inset-*)` 原生可用；WebView < 140（Chromium bug [40699457](https://issues.chromium.org/issues/40699457)，env 恒为 0）走 decorView **原生垫高**，页面只吃 `max()` 保底空白。模拟器实测为原生垫高路径（全屏 914 CSS px，viewport 839），像素测量输入卡到手势条约 60 CSS px 干净空白（32px 保底 + 原生垫掉的手势条区）。
- **底部空白 `max(32px, 安全区变量)`** 保留（SessionView 输入容器 / Welcome 页），剪裁器浮层底部 `max(16px, …)` 保底。

### v9 RC 的两个坑及处理
- **`capacitor-cordova-android-plugins` 模板 bug**：模板末尾有 `for (def func : cdvPluginPostBuildExtras)` 但未随附 `cordova.variables.gradle`，且 `cap sync` 每次先删后重建该目录（仅在项目有 Cordova 插件时才写入该文件）——无 Cordova 插件的工程直接报 `unknown property 'cdvPluginPostBuildExtras'`。**修复放在根 `build.gradle` 的 `allprojects { ext.cdvPluginPostBuildExtras = [] }`**（sync 不碰根文件，重建也无效化；未来版本补齐后本地生成文件自然覆盖）。
- **SystemBars 重复注册告警**：v9 `@capacitor/core` 直接导出内置 `SystemBars`（含 web 实现），`theme.ts` 自行 `registerPlugin('SystemBars')` 会撞「already registered」。改为 `import { SystemBars as SystemBarsPlugin } from '@capacitor/core'`。

### 验证（模拟器）
- 欢迎页/抽屉/输入卡布局与 v1.5 逐像素一致（ActionBar 消失、汉堡回归）；logcat 无 JS 报错与注册告警；返回键关闭抽屉正常。

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
- viewport meta 加 `viewport-fit=cover` + `capacitor.config.ts` 配 `SystemBars.initialViewportFitValueHint: 'cover'`：Capacitor 9 内置 SystemBars 插件（insetsHandling 默认 native）在 WebView ≥ 140 时透传 insets（`env(safe-area-inset-*)` 原生可用），WebView < 140 自动降级为 decorView 原生垫高，底色随深浅色。`MainActivity` 在 `super.onCreate` 后调用 `EdgeToEdge.enable(this)`（v9 迁移器规范写法），保证 Android 15 以下机型 insets 完整下发。
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
