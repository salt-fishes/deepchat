package com.deepchat.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(
    name = "Share",
    permissions = {
        @Permission(alias = "writeImages", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class SharePlugin extends Plugin {
    private static final String WRITE_PERMISSION = "writeImages";

    @PluginMethod
    public void shareImage(PluginCall call) {
        var activity = getActivity();
        if (activity == null) {
            call.reject("Activity is unavailable");
            return;
        }
        try {
            String data = requiredData(call);
            String mimeType = normalizeMime(call.getString("mimeType"));
            String name = safeName(call.getString("name"), mimeType);
            bridge.execute(() -> {
                try {
                    File file = writeCacheImage(data, mimeType, name);
                    activity.runOnUiThread(() -> shareFile(activity, file, mimeType, call));
                } catch (IOException | RuntimeException error) {
                    call.reject("Unable to share the image", error);
                }
            });
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        try {
            String data = requiredData(call);
            String mimeType = normalizeMime(call.getString("mimeType"));
            String name = safeName(call.getString("name"), mimeType);
            if (Build.VERSION.SDK_INT < 29) {
                var activity = getActivity();
                if (activity == null) {
                    call.reject("Activity is unavailable");
                    return;
                }
                if (getPermissionState(WRITE_PERMISSION) != PermissionState.GRANTED) {
                    requestPermissionForAlias(WRITE_PERMISSION, call, "onWritePermission");
                    return;
                }
            }
            bridge.execute(() -> {
                try {
                    saveDecoded(data, mimeType, name);
                    call.resolve(new JSObject().put("saved", true));
                } catch (IOException | RuntimeException error) {
                    call.reject("Unable to save the image", error);
                }
            });
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage());
        }
    }

    @PermissionCallback
    private void onWritePermission(PluginCall call) {
        if (getPermissionState(WRITE_PERMISSION) == PermissionState.GRANTED) {
            saveImage(call);
        } else {
            call.reject("Storage permission is required to save images");
        }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        var activity = getActivity();
        String text = call.getString("text");
        if (activity == null) {
            call.reject("Activity is unavailable");
            return;
        }
        if (text == null || text.isEmpty()) {
            call.reject("Text is required");
            return;
        }
        String title = call.getString("title");
        Intent send = new Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, text);
        if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        Intent chooser = Intent.createChooser(send,
            title == null || title.isEmpty() ? getContext().getString(R.string.share_text_title) : title);
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(chooser);
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("No app is available to share text", error);
            }
        });
    }

    private void shareFile(Activity activity, File file, String mimeType, PluginCall call) {
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
        Intent send = new Intent(Intent.ACTION_SEND)
            .setType(mimeType)
            .putExtra(Intent.EXTRA_STREAM, uri);
        send.setClipData(ClipData.newRawUri(file.getName(), uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, getContext().getString(R.string.share_image_title));
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(chooser);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("No app is available to share the image", error);
        }
    }

    private File writeCacheImage(String data, String mimeType, String name) throws IOException {
        File dir = new File(getContext().getCacheDir(), "share");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Unable to create the share cache");
        File file = new File(dir, "share_" + UUID.randomUUID() + "_" + name);
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        } catch (IOException | RuntimeException error) {
            file.delete();
            throw error;
        }
        return file;
    }

    private void saveDecoded(String data, String mimeType, String name) throws IOException {
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        if (Build.VERSION.SDK_INT >= 29) {
            saveToMediaStore(bytes, mimeType, name);
        } else {
            saveToLegacyPictures(bytes, mimeType, name);
        }
    }

    private void saveToMediaStore(byte[] bytes, String mimeType, String name) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/deepchat");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        var resolver = getContext().getContentResolver();
        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("MediaStore did not create an image");
        try {
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("MediaStore output is unavailable");
                out.write(bytes);
            }
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
        } catch (IOException | RuntimeException error) {
            try { resolver.delete(uri, null, null); } catch (RuntimeException ignored) { }
            throw error;
        }
    }

    private void saveToLegacyPictures(byte[] bytes, String mimeType, String name) throws IOException {
        if (!Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState())) {
            throw new IOException("External storage is unavailable");
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "deepchat");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Unable to create Pictures/deepchat");
        File file = uniqueFile(dir, name);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        } catch (IOException | RuntimeException error) {
            file.delete();
            throw error;
        }
        android.media.MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() },
            new String[] { mimeType }, null);
    }

    private static File uniqueFile(File dir, String name) {
        File file = new File(dir, name);
        if (!file.exists()) return file;
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        String extension = dot > 0 ? name.substring(dot) : "";
        for (int index = 1; index < 10_000; index++) {
            file = new File(dir, stem + " (" + index + ")" + extension);
            if (!file.exists()) return file;
        }
        return new File(dir, stem + "_" + UUID.randomUUID() + extension);
    }

    private static String requiredData(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) throw new IllegalArgumentException("Image data is required");
        int comma = data.indexOf(',');
        return data.startsWith("data:") && comma >= 0 ? data.substring(comma + 1) : data;
    }

    private static String normalizeMime(String value) {
        String mimeType = value == null ? "image/png" : value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!mimeType.matches("[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+")) {
            throw new IllegalArgumentException("A valid mimeType is required");
        }
        return mimeType;
    }

    private static String safeName(String value, String mimeType) {
        String name = value == null ? "" : value.trim().replace('/', '_').replace('\\', '_');
        name = name.replaceAll("[\\x00-\\x1f]", "_");
        if (name.isEmpty() || ".".equals(name) || "..".equals(name)) name = "image";
        if (name.length() > 120) name = name.substring(name.length() - 120);
        if (name.lastIndexOf('.') < 0) name += extensionFor(mimeType);
        return name;
    }

    private static String extensionFor(String mimeType) {
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        return extension == null ? ".img" : "." + extension;
    }
}
