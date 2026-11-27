package com.deepchat.app;

import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.MenuItem;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.appcompat.widget.Toolbar;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class BrowserActivity extends AppCompatActivity {
    public static final String EXTRA_URL = "com.deepchat.app.extra.BROWSER_URL";
    public static final String EXTRA_TITLE = "com.deepchat.app.extra.BROWSER_TITLE";
    public static final String EXTRA_DARK = "com.deepchat.app.extra.BROWSER_DARK";

    private WebView webView;
    private ProgressBar progress;
    private String currentUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        boolean dark = getIntent().getBooleanExtra(EXTRA_DARK, isSystemDark());
        getDelegate().setLocalNightMode(dark ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_browser);

        View root = findViewById(R.id.browser_root);
        fitInsideSystemInsets(root);
        var insetsController = WindowCompat.getInsetsController(getWindow(), root);
        insetsController.setAppearanceLightStatusBars(!dark);
        insetsController.setAppearanceLightNavigationBars(!dark);

        Toolbar toolbar = findViewById(R.id.browser_toolbar);
        toolbar.inflateMenu(R.menu.browser);
        toolbar.setOnMenuItemClickListener(this::openInDefaultBrowser);

        progress = findViewById(R.id.browser_progress);
        webView = findViewById(R.id.browser_webview);
        configureWebView();

        String title = getIntent().getStringExtra(EXTRA_TITLE);
        toolbar.setTitle(title == null || title.isEmpty() ? getString(R.string.browser_title) : title);
        currentUrl = getIntent().getStringExtra(EXTRA_URL);
        if (ExternalLinksPlugin.webUri(currentUrl) == null) {
            finish();
            return;
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finish();
            }
        });
        webView.loadUrl(currentUrl);
    }

    private boolean isSystemDark() {
        int mask = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mask == Configuration.UI_MODE_NIGHT_YES;
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        if (android.os.Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (ExternalLinksPlugin.webUri(request.getUrl().toString()) == null) {
                    view.stopLoading();
                    return true;
                }
                currentUrl = request.getUrl().toString();
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                currentUrl = url;
                progress.setVisibility(View.VISIBLE);
                progress.setProgress(0);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                currentUrl = url;
                progress.setProgress(100);
                progress.setVisibility(View.GONE);
                if (view.getTitle() != null && !view.getTitle().isEmpty()) {
                    Toolbar toolbar = findViewById(R.id.browser_toolbar);
                    toolbar.setTitle(view.getTitle());
                }
            }
        });
        webView.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
            }
        });
    }

    private boolean openInDefaultBrowser(MenuItem item) {
        if (item.getItemId() != R.id.browser_open_external) return false;
        Uri uri = ExternalLinksPlugin.webUri(currentUrl == null ? webView.getUrl() : currentUrl);
        if (uri == null) return true;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri)
                .addCategory(Intent.CATEGORY_BROWSABLE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (RuntimeException error) {
            Toast.makeText(this, R.string.browser_unavailable, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void fitInsideSystemInsets(View root) {
        int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets safe = insets.getInsets(bars);
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(bars, Insets.NONE)
                .setDisplayCutout(null)
                .build();
        });
        ViewCompat.requestApplyInsets(root);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
