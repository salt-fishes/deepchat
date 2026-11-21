import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.chatdemo',
  appName: 'deepchat',
  webDir: 'dist',
  // Capacitor 的调试日志会记录插件调用参数，备份分块里可能包含聊天内容。
  android: { loggingBehavior: 'none' },
  plugins: {
    // MainActivity 统一处理系统栏、挖孔和键盘的安全区。
    SystemBars: { insetsHandling: 'disable' },
  },
};

export default config;
