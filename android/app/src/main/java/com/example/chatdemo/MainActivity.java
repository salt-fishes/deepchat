package com.example.chatdemo;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import androidx.activity.EdgeToEdge;
import androidx.annotation.RequiresApi;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Collections;

public class MainActivity extends BridgeActivity {

    /** 左缘系统手势排除区宽度（dp）：与 Web 端抽屉手势热区一致 */
    private static final int GESTURE_EXCLUSION_WIDTH_DP = 28;
    /** 系统允许的最大排除区高度（dp） */
    private static final int GESTURE_EXCLUSION_HEIGHT_DP = 200;
    private Boolean darkWindowTheme;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自定义插件需在 Bridge 初始化前注册
        registerPlugin(MediaGalleryPlugin.class);
        registerPlugin(WindowThemePlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        fitWebViewInsideSystemInsets();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            excludeSystemGestureZone();
        }
    }

    private void fitWebViewInsideSystemInsets() {
        View decor = getWindow().getDecorView();
        int barsAndCutout = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
        int ime = WindowInsetsCompat.Type.ime();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            Insets safeArea = Insets.max(insets.getInsets(barsAndCutout), insets.getInsets(ime));
            view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom);

            // WebView already fits within the padded window, including when the IME is visible.
            // Forward the remaining insets so the same space isn't reserved a second time.
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(barsAndCutout | ime, Insets.NONE)
                .setDisplayCutout(null)
                .setVisible(ime, false)
                .build();
        });
        ViewCompat.requestApplyInsets(decor);
    }

    void applyWindowTheme(boolean dark) {
        darkWindowTheme = dark;
        var window = getWindow();
        var decor = window.getDecorView();
        var controller = WindowCompat.getInsetsController(window, decor);
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
        // 透明系统栏下显示由原生窗口预留的这一层。
        decor.setBackgroundColor(dark ? Color.rgb(21, 21, 23) : Color.WHITE);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Capacitor 的 SystemBars 在配置变化时会重新应用 Android 主题。
        if (darkWindowTheme != null) {
            applyWindowTheme(darkWindowTheme);
        }
    }

    /**
     * 抽屉边缘滑动需要占用左缘手势：向系统声明 WebView 上左缘中部一段高度的手势排除区，
     * 避免滑动被系统返回手势半路接管（顶部/底部仍保留给系统）。
     * 根据 WebView 的实际布局更新排除区，旋转或键盘改变高度后重新计算。
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private void excludeSystemGestureZone() {
        final View webview = getBridge().getWebView();
        webview.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            float density = getResources().getDisplayMetrics().density;
            int width = Math.min(view.getWidth(), Math.round(GESTURE_EXCLUSION_WIDTH_DP * density));
            int height = Math.min(view.getHeight(), Math.round(GESTURE_EXCLUSION_HEIGHT_DP * density));
            int exclusionTop = (view.getHeight() - height) / 2;
            view.setSystemGestureExclusionRects(
                Collections.singletonList(new Rect(0, exclusionTop, width, exclusionTop + height))
            );
        });
    }
}
