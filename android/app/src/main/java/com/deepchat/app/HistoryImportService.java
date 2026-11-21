package com.deepchat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;

public final class HistoryImportService extends Service {
    private static final String CHANNEL = "history-import";
    private static final String URL = "https://appassets.androidplatform.net/assets/public/history-import.html";
    private static final int NOTIFICATION = 3801;
    private static final int MAX_CHUNK = 192 * 1024;
    private static volatile JSObject status = new JSObject().put("state", "idle");
    private final Handler main = new Handler(Looper.getMainLooper());
    private final java.util.concurrent.ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView worker;
    private volatile boolean stopped;
    private String id;
    private File cacheFile;
    private RandomAccessFile source;
    private WcdbStore store;

    static synchronized String start(Context context, Uri uri) {
        if ("running".equals(status.optString("state"))) {
            throw new IllegalStateException("A history import is already running");
        }
        String id = UUID.randomUUID().toString();
        status = running(id, "opening", 0);
        try {
            ContextCompat.startForegroundService(context,
                new Intent(context, HistoryImportService.class).setData(uri).putExtra("id", id));
        } catch (RuntimeException error) {
            status = new JSObject().put("state", "idle");
            throw error;
        }
        return id;
    }

    static JSObject status() {
        return status;
    }

    private static JSObject running(String id, String phase, int percent) {
        return new JSObject().put("id", id).put("state", "running").put("phase", phase).put("percent", percent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (id != null) {
            return START_NOT_STICKY;
        }
        if (intent == null || intent.getData() == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        id = intent.getStringExtra("id");
        Uri uri = intent.getData();
        var manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.history_import_channel),
                NotificationManager.IMPORTANCE_LOW));
        }
        startForeground(NOTIFICATION, notification(getString(R.string.history_import_opening), -1, true));
        io.execute(() -> prepare(uri));
        return START_NOT_STICKY;
    }

    private void prepare(Uri uri) {
        try {
            cacheFile = File.createTempFile("history-import-", ".tmp", getCacheDir());
            try (var in = getContentResolver().openInputStream(uri); var out = new FileOutputStream(cacheFile)) {
                if (in == null) throw new IOException("Unable to open archive");
                byte[] buffer = new byte[128 * 1024];
                long total = 0;
                for (int count; (count = in.read(buffer)) != -1;) {
                    if (stopped) return;
                    total += count;
                    if (total >= 0xffffffffL) throw new IOException("Unsupported ZIP size");
                    out.write(buffer, 0, count);
                }
            }
            main.post(this::launchWorker);
        } catch (Exception error) {
            Log.w("HistoryImport", "Archive open failed", error);
            main.post(() -> finish(-1, "historyImportFailed"));
        }
    }

    private void launchWorker() {
        if (stopped) return;
        update("checking", 0);
        try {
            var assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
            worker = new WebView(this);
            worker.getSettings().setJavaScriptEnabled(true);
            worker.getSettings().setAllowFileAccess(false);
            worker.getSettings().setAllowContentAccess(false);
            worker.getSettings().setBlockNetworkLoads(true);
            worker.addJavascriptInterface(new ImportBridge(), "DeepChatHistoryImport");
            worker.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return true;
                }
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    String path = uri.getPath();
                    if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                        && path != null && (URL.equals(uri.toString()) || path.startsWith("/assets/public/static/js/"))) {
                        WebResourceResponse response = assets.shouldInterceptRequest(uri);
                        if (response != null) return response;
                    }
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null, null);
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) finish(-1, "historyImportFailed");
                }
                @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    finish(-1, "historyImportFailed");
                    return true;
                }
            });
            worker.loadUrl(URL);
        } catch (RuntimeException error) {
            Log.w("HistoryImport", "Could not start import worker", error);
            finish(-1, "historyImportFailed");
        }
    }

    private Notification notification(String message, int percent, boolean active) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        var builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(getString(R.string.history_import_channel))
            .setContentText(message).setContentIntent(open).setOngoing(active).setOnlyAlertOnce(true)
            .setAutoCancel(!active).setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        if (active) builder.setProgress(100, Math.max(0, percent), percent < 0);
        return builder.build();
    }

    private void update(String phase, int percent) {
        if (stopped) return;
        status = running(id, phase, percent);
        String text = "reading".equals(phase) ? getString(R.string.history_import_reading, percent)
            : getString("replacing".equals(phase) ? R.string.history_import_replacing : R.string.history_import_opening);
        getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(text, "reading".equals(phase) ? percent : -1, true));
    }

    private void finish(int count, String key) {
        if (stopped) return;
        stopped = true;
        // Remove this service instance before accepting another import.
        stopSelf();
        status = new JSObject().put("id", id).put("state", count >= 0 ? "success" : "failure")
            .put("count", count).put("key", key);
        stopForeground(STOP_FOREGROUND_DETACH);
        getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(count >= 0
            ? getString(R.string.history_import_success, count) : getString(R.string.history_import_failure), -1, false));
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        finish(-1, "historyImportFailed");
    }

    @Override
    public void onDestroy() {
        if (!stopped && id != null) {
            stopped = true;
            status = new JSObject().put("id", id).put("state", "failure").put("key", "historyImportFailed");
        }
        if (worker != null) {
            worker.removeJavascriptInterface("DeepChatHistoryImport");
            worker.destroy();
            worker = null;
        }
        io.execute(this::release);
        io.shutdown();
        super.onDestroy();
    }

    private synchronized void release() {
        if (source != null) {
            try { source.close(); } catch (IOException ignored) { }
        }
        if (store != null) store.close();
        if (cacheFile != null) cacheFile.delete();
    }

    private final class ImportBridge {
        @JavascriptInterface
        public String call(String method, String payload) {
            synchronized (HistoryImportService.this) {
                try {
                    if (stopped) throw new IllegalStateException("Import stopped");
                    return new JSObject().put("value", dispatch(method, new JSONObject(payload))).toString();
                } catch (Exception error) {
                    Log.w("HistoryImport", "Import step failed: " + method, error);
                    return new JSObject().put("error", "Import step failed").toString();
                }
            }
        }

        private Object dispatch(String method, JSONObject args) throws Exception {
            switch (method) {
                case "source":
                    source = new RandomAccessFile(cacheFile, "r");
                    return new JSObject().put("size", source.length());
                case "read":
                    long offset = args.getLong("offset");
                    int length = args.getInt("length");
                    if (length <= 0 || length > MAX_CHUNK || offset < 0 || offset > source.length() - length) {
                        throw new IOException("Invalid history read");
                    }
                    byte[] bytes = new byte[length];
                    source.seek(offset);
                    source.readFully(bytes);
                    return new JSObject().put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
                case "initialize":
                    if (store == null) store = new WcdbStore(new File(getFilesDir(), "deepchat.db").getPath());
                    break;
                case "clear":
                    for (String kind : new String[] {"ss", "ms", "fs"}) store.clear(kind);
                    break;
                case "put":
                    var items = args.getJSONArray("items");
                    List<WcdbRecord> rows = new ArrayList<>();
                    for (int i = 0; i < items.length(); i++) rows.add(WcdbStoragePlugin.decode(items.getJSONObject(i)));
                    store.put(rows);
                    break;
                case "getStagingSessionPage":
                    return encode(store.getStagingSessionPage(args.getString("after")), "ss");
                case "getAll":
                    if (!"ms".equals(args.getString("kind"))) throw new IllegalArgumentException("Only staged summaries are readable");
                    return encode(store.getAll("ms"), "ms");
                case "commitHistory":
                    store.commitHistory();
                    break;
                case "progress":
                    String phase = args.getString("phase");
                    int percent = args.optInt("percent");
                    main.post(() -> update(phase, percent));
                    break;
                case "success":
                    int count = args.getInt("count");
                    main.post(() -> finish(count, ""));
                    break;
                case "failure":
                    String key = args.getString("key");
                    main.post(() -> finish(-1, key));
                    break;
                default:
                    throw new IllegalArgumentException("Unknown import method");
            }
            return JSONObject.NULL;
        }

        private JSObject encode(List<WcdbRecord> rows, String kind) {
            JSArray array = new JSArray();
            for (WcdbRecord row : rows) array.put(WcdbStoragePlugin.encode(row, kind));
            return new JSObject().put("items", array);
        }
    }
}
