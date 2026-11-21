package com.deepchat.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private Boolean darkWindowTheme;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自定义插件需在 Bridge 初始化前注册
        registerPlugin(MediaGalleryPlugin.class);
        registerPlugin(HistoryFilePlugin.class);
        registerPlugin(WindowThemePlugin.class);
        registerPlugin(WcdbStoragePlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        fitWebViewInsideSystemInsets();
    }

    private void fitWebViewInsideSystemInsets() {
        // Scope padding to app content instead of changing the framework-owned DecorView.
        View content = findViewById(android.R.id.content);
        int barsAndCutout = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
        int ime = WindowInsetsCompat.Type.ime();
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            Insets safeArea = Insets.max(insets.getInsets(barsAndCutout), insets.getInsets(ime));
            if (view.getPaddingLeft() != safeArea.left || view.getPaddingTop() != safeArea.top
                || view.getPaddingRight() != safeArea.right || view.getPaddingBottom() != safeArea.bottom) {
                view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom);
            }

            // WebView already fits within the padded window, including when the IME is visible.
            // Forward the remaining insets so the same space isn't reserved a second time.
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(barsAndCutout | ime, Insets.NONE)
                .setDisplayCutout(null)
                .setVisible(ime, false)
                .build();
        });
        ViewCompat.requestApplyInsets(content);
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
}

