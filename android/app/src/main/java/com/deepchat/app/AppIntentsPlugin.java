package com.deepchat.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "AppIntents")
public class AppIntentsPlugin extends Plugin {
    public static final String ACTION_NEW_CHAT = "com.deepchat.app.action.NEW_CHAT";
    public static final String ACTION_PICK_IMAGES = "com.deepchat.app.action.PICK_IMAGES";
    public static final String ACTION_TAKE_PHOTO = "com.deepchat.app.action.TAKE_PHOTO";
    public static final String EXTRA_KIND = "com.deepchat.app.extra.INTENT_KIND";
    public static final String EXTRA_HANDLED = "com.deepchat.app.extra.INTENT_HANDLED";

    private static final String TAG = "AppIntents";
    private static final ArrayList<JSObject> PENDING = new ArrayList<>();
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    static void enqueue(Context context, Intent intent) {
        Context appContext = context.getApplicationContext();
        IO.execute(() -> handle(appContext, intent));
    }

    @PluginMethod
    public void consume(PluginCall call) {
        // This task runs after all previously received intents have copied their files.
        IO.execute(() -> {
            JSArray intents;
            synchronized (PENDING) {
                intents = new JSArray();
                for (JSObject item : PENDING) intents.put(item);
                PENDING.clear();
            }
            call.resolve(new JSObject().put("intents", intents));
        });
    }

    private static void handle(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_NEW_CHAT.equals(action) || ACTION_PICK_IMAGES.equals(action) || ACTION_TAKE_PHOTO.equals(action)) {
            enqueueKind(kindForAction(action));
            return;
        }
        String extraKind = intent.getStringExtra(EXTRA_KIND);
        if (extraKind != null) {
            String kind = normalizeKind(extraKind);
            if (kind != null) enqueueKind(kind);
            return;
        }
        if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            handleShare(context, intent, Intent.ACTION_SEND_MULTIPLE.equals(action));
        }
    }

    private static void handleShare(Context context, Intent intent, boolean multiple) {
        CharSequence sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        String text = sharedText == null ? null : sharedText.toString();
        ArrayList<Uri> uris = new ArrayList<>();
        if (multiple) {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) uris.addAll(streams);
        } else {
            Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream instanceof Uri) uris.add((Uri) stream);
        }

        JSArray images = new JSArray();
        File dir = new File(context.getCacheDir(), "shared");
        for (Uri uri : uris) {
            if (uri == null) continue;
            try {
                JSObject image = copyImage(context, dir, uri);
                if (image != null) images.put(image);
            } catch (IOException | RuntimeException error) {
                Log.w(TAG, "Unable to copy a shared image", error);
            }
        }
        boolean hasText = text != null && !text.trim().isEmpty();
        if (!hasText && images.length() == 0) return;
        JSObject share = new JSObject().put("kind", "share").put("images", images);
        if (hasText) share.put("text", text);
        synchronized (PENDING) {
            PENDING.add(share);
        }
    }

    private static JSObject copyImage(Context context, File dir, Uri uri) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        String mimeType = resolver.getType(uri);
        if (mimeType != null && !mimeType.toLowerCase(Locale.ROOT).startsWith("image/")) return null;
        if (mimeType == null || mimeType.isEmpty()) mimeType = "image/jpeg";
        String name = queryName(resolver, uri);
        if (name == null || name.isEmpty()) name = "shared-image";
        name = name.replace('/', '_').replace('\\', '_').replaceAll("[\\x00-\\x1f]", "_");
        if (name.length() > 120) name = name.substring(name.length() - 120);
        if (!name.contains(".")) name += extensionFor(mimeType);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Unable to create the shared cache");
        File file = new File(dir, "intent_" + UUID.randomUUID() + "_" + name);
        try (InputStream in = resolver.openInputStream(uri); OutputStream out = new FileOutputStream(file)) {
            if (in == null) throw new IOException("Shared image is unreadable");
            byte[] buffer = new byte[128 * 1024];
            for (int count; (count = in.read(buffer)) != -1;) out.write(buffer, 0, count);
        } catch (IOException | RuntimeException error) {
            file.delete();
            throw error;
        }
        return new JSObject()
            .put("path", file.getAbsolutePath())
            .put("name", name)
            .put("mimeType", mimeType);
    }

    private static String queryName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (RuntimeException ignored) {
            // Some providers do not expose DISPLAY_NAME; a safe generated name is sufficient.
        }
        return null;
    }

    private static String extensionFor(String mimeType) {
        String extension = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        return extension == null ? ".jpg" : "." + extension;
    }

    private static void enqueueKind(String kind) {
        synchronized (PENDING) {
            PENDING.add(new JSObject().put("kind", kind));
        }
    }

    private static String kindForAction(String action) {
        if (ACTION_NEW_CHAT.equals(action)) return "new-chat";
        if (ACTION_PICK_IMAGES.equals(action)) return "pick-images";
        return "take-photo";
    }

    private static String normalizeKind(String kind) {
        return switch (kind) {
            case "new-chat", "pick-images", "take-photo" -> kind;
            default -> null;
        };
    }
}
