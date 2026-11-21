import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.chatdemo',
  appName: 'Chat Demo',
  webDir: 'dist',
  plugins: {
    // Android 沉浸式：声明 viewport-fit=cover，SystemBars 以 CSS 变量下发安全区，
    // 启动时就告知取值避免首帧布局跳动（详见 ANDROID.md「Edge-to-edge」）
    SystemBars: {
      initialViewportFitValueHint: 'cover',
      // css（默认）：WebView >= 140 时 insets 透传 + 注入 --safe-area-inset-*；
      // 更旧的 WebView 走原生垫高并把变量置 0（Chromium bug 40699457 下 env() 恒为 0）
      insetsHandling: 'css',
    },
  },
};

export default config;
