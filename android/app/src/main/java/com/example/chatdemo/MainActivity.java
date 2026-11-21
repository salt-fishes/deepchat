package com.example.chatdemo;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;

import androidx.activity.EdgeToEdge;
import androidx.annotation.RequiresApi;

import com.getcapacitor.BridgeActivity;

import java.util.Collections;

public class MainActivity extends BridgeActivity {

    /** 左缘系统手势排除区宽度（dp）：与 Web 端抽屉手势热区一致 */
    private static final int GESTURE_EXCLUSION_WIDTH_DP = 28;
    /** 系统允许的最大排除区高度（dp） */
    private static final int GESTURE_EXCLUSION_HEIGHT_DP = 200;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 官方文档建议（SystemBars insetsHandling 非 disable 时）：在 Bridge 初始化前手动开启
        // edge-to-edge。Android 15+ 由系统强制生效，但 15 以下机型不开的话窗口不延伸到系统栏下，
        // insets 不完整下发，SystemBars 的两条避让路径（原生垫高 / CSS 透传）都会失效。
        // Capacitor 9 起框架会自动调用。
        EdgeToEdge.enable(this);
        // 自定义插件需在 Bridge 初始化前注册
        registerPlugin(MediaGalleryPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            excludeSystemGestureZone();
        }
    }

    /**
     * 抽屉边缘滑动需要占用左缘手势：向系统声明 WebView 上左缘中部一段高度的手势排除区，
     * 避免滑动被系统返回手势半路接管（顶部/底部仍保留给系统）。
     * 注意：监听器挂在 WebView 上，不要覆盖 decorView 上 Capacitor SystemBars 的 insets 处理。
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private void excludeSystemGestureZone() {
        final View webview = getBridge().getWebView();
        webview.setOnApplyWindowInsetsListener((view, insets) -> {
            float density = getResources().getDisplayMetrics().density;
            int width = (int) (GESTURE_EXCLUSION_WIDTH_DP * density);
            int height = (int) (GESTURE_EXCLUSION_HEIGHT_DP * density);
            int top = Math.max(0, (view.getHeight() - height) / 2);
            view.setSystemGestureExclusionRects(
                Collections.singletonList(new Rect(0, top, width, top + height))
            );
            return insets;
        });
    }
}
