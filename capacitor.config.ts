import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.chatdemo',
  appName: 'Chat Demo',
  webDir: 'dist',
  plugins: {
    // MainActivity 统一处理系统栏、挖孔和键盘的安全区。
    SystemBars: { insetsHandling: 'disable' },
  },
};

export default config;
