package com.deepchat.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * 相册最近图片、系统照片选择器与相机入口。
 * 新选图/拍照链路把规范化图片复制到应用 cache，再以 path 返回，避免 base64/dataURL 中转；
 * 旧 getPhoto/takePhoto 仍保留 base64 响应供兼容调用。
 */
@CapacitorPlugin(
    name = "MediaGallery",
    permissions = {
        // 仅“最近图片”查询需要整库读取权限；系统照片选择器与相机不请求这些权限。
        @Permission(alias = "readImages33", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(
            alias = "readImagesLegacy",
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE }
        )
    }
)
public class MediaGalleryPlugin extends Plugin {

    /** 缩略图最长边 */
    private static final int THUMB_SIZE = 200;
    /** 原图最长边上限，避免超大图把内存和桥接打爆 */
    private static final int MAX_PHOTO_DIM = 4096;
    /** 与上传附件数量上限保持一致，避免一次选择过多图片。 */
    private static final int MAX_PICK_COUNT = 50;
    /** 仅保留最近一批缓存，避免反复选图占满应用缓存。 */
    private static final int MAX_CACHE_FILES = 60;
    private static final String PERMISSION_ALIAS = "readImages33";
    private static final String PERMISSION_ALIAS_LEGACY = "readImagesLegacy";

    /** 拍照结果临时文件；相机 Activity 返回时读回，随后立刻删除。 */
    private File pendingPhotoFile;

    private static final class PreparedImage {
        final File file;
        final String mimeType;

        PreparedImage(File file, String mimeType) {
            this.file = file;
            this.mimeType = mimeType;
        }
    }

    @PluginMethod
    public void getRecentPhotos(PluginCall call) {
        boolean requestPermission = call.getBoolean("requestPermission", true);
        if (getPermissionState(permissionAlias()) != PermissionState.GRANTED) {
            if (requestPermission) {
                requestPermissionForAlias(permissionAlias(), call, "onImagesPermission");
            } else {
                resolvePhotos(call, new JSArray());
            }
            return;
        }
        int limit = Math.max(1, Math.min(MAX_PICK_COUNT, call.getInt("limit", 24)));
        JSArray photos = new JSArray();
        try {
            String[] projection = { MediaStore.Images.Media._ID };
            try (Cursor cursor = getContext()
                .getContentResolver()
                .query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection,
                    null,
                    null,
                    MediaStore.Images.Media.DATE_ADDED + " DESC"
                )) {
                while (cursor != null && cursor.moveToNext() && photos.length() < limit) {
                    String id = cursor.getString(0);
                    String thumbnail = loadScaledBase64(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI.buildUpon()
                            .appendPath(id)
                            .build(),
                        THUMB_SIZE,
                        70
                    );
                    if (thumbnail != null) {
                        JSObject photo = new JSObject();
                        photo.put("id", id);
                        photo.put("thumbnail", thumbnail);
                        photos.put(photo);
                    }
                }
            }
        } catch (Exception e) {
            call.reject("query photos failed: " + e.getMessage());
            return;
        }
        resolvePhotos(call, photos);
    }

    @PluginMethod
    public void getPhoto(PluginCall call) {
        if (!ensurePermission(call)) {
            return;
        }
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        try {
            String data = loadScaledBase64(photoUri(id), MAX_PHOTO_DIM, 90);
            if (data == null) {
                call.reject("photo not readable");
                return;
            }
            JSObject result = new JSObject();
            result.put("data", data);
            result.put("mimeType", "image/jpeg");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("load photo failed: " + e.getMessage());
        }
    }

    /** 最近图片快捷入口：复制/规范化后返回缓存文件路径，不再传 base64。 */
    @PluginMethod
    public void getPhotoFile(PluginCall call) {
        if (!ensurePermission(call)) {
            return;
        }
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        try {
            bridge.execute(() -> {
                try {
                    PreparedImage image = prepareImage(photoUri(id), cacheDir("picked"), "photo_");
                    call.resolve(photoResult(image));
                } catch (Exception e) {
                    call.reject("load photo failed: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            call.reject("load photo failed: " + e.getMessage());
        }
    }

    /**
     * API 33+ 使用 ACTION_PICK_IMAGES；旧版优先 ACTION_OPEN_DOCUMENT，无可用组件时回退 GET_CONTENT。
     * 两条路径都支持多选，且不申请整库读取权限。
     */
    @PluginMethod
    public void pickPhotos(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 33) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
            intent.setType("image/*");
            intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, MAX_PICK_COUNT);
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        startPicker(call, intent, true);
    }

    private void startPicker(PluginCall call, Intent intent, boolean allowGetContentFallback) {
        try {
            startActivityForResult(call, intent, "onPickPhotosResult");
        } catch (ActivityNotFoundException error) {
            if (!allowGetContentFallback) {
                call.reject("no photo picker available");
                return;
            }
            Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
            fallback.addCategory(Intent.CATEGORY_OPENABLE);
            fallback.setType("image/*");
            fallback.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            fallback.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startPicker(call, fallback, false);
        }
    }

    @ActivityCallback
    private void onPickPhotosResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != android.app.Activity.RESULT_OK) {
            call.reject("cancelled");
            return;
        }
        List<Uri> uris = new ArrayList<>();
        Intent data = result.getData();
        if (data != null) {
            Uri single = data.getData();
            if (single != null) {
                uris.add(single);
            }
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int index = 0; index < clip.getItemCount() && uris.size() < MAX_PICK_COUNT; index++) {
                    Uri item = clip.getItemAt(index).getUri();
                    if (item != null && !uris.contains(item)) {
                        uris.add(item);
                    }
                }
            }
        }
        if (uris.isEmpty()) {
            call.reject("no photos selected");
            return;
        }
        bridge.execute(() -> {
            try {
                File dir = cacheDir("picked");
                JSArray photos = new JSArray();
                for (int index = 0; index < uris.size(); index++) {
                    PreparedImage image = prepareImage(uris.get(index), dir, "picked_" + index + "_");
                    photos.put(photoResult(image));
                }
                resolvePhotos(call, photos);
            } catch (Exception e) {
                call.reject("pick photos failed: " + e.getMessage());
            }
        });
    }

    /** 调起系统相机拍照。WebView 的 <input capture> 在 Android 上可能只弹文件选择器。 */
    @PluginMethod
    public void takePhoto(PluginCall call) {
        launchCamera(call);
    }

    /** 相机结果规范化到 cache/camera，返回 {path,name,mimeType}。 */
    @PluginMethod
    public void takePhotoFile(PluginCall call) {
        launchCamera(call);
    }

    private void launchCamera(PluginCall call) {
        File dir;
        try {
            dir = cacheDir("camera");
        } catch (IOException e) {
            call.reject("cannot create camera dir: " + e.getMessage());
            return;
        }
        File target = new File(dir, "capture_" + System.currentTimeMillis() + ".jpg");
        Uri output;
        try {
            output = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                target
            );
        } catch (Exception e) {
            call.reject("cannot create camera uri: " + e.getMessage());
            return;
        }
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, output);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        pendingPhotoFile = target;
        try {
            startActivityForResult(call, intent, "onCameraResult");
        } catch (ActivityNotFoundException e) {
            pendingPhotoFile = null;
            target.delete();
            call.reject("camera unavailable");
        }
    }

    @ActivityCallback
    private void onCameraResult(PluginCall call, ActivityResult result) {
        File target = pendingPhotoFile;
        pendingPhotoFile = null;
        if (target == null) {
            call.reject("no capture target");
            return;
        }
        if (result.getResultCode() != android.app.Activity.RESULT_OK) {
            target.delete();
            call.reject("cancelled");
            return;
        }
        if (!target.isFile() || target.length() == 0) {
            target.delete();
            call.reject("photo not readable");
            return;
        }
        bridge.execute(() -> {
            try {
                if ("takePhotoFile".equals(call.getMethodName())) {
                    PreparedImage image = prepareImage(Uri.fromFile(target), cacheDir("camera"), "camera_");
                    if (image == null) {
                        call.reject("photo not readable");
                        return;
                    }
                    target.delete();
                    call.resolve(photoResult(image));
                } else {
                    String data = loadScaledBase64(Uri.fromFile(target), MAX_PHOTO_DIM, 90);
                    if (data == null) {
                        call.reject("photo not readable");
                        return;
                    }
                    JSObject photo = new JSObject();
                    photo.put("data", data);
                    photo.put("mimeType", "image/jpeg");
                    call.resolve(photo);
                }
            } catch (Exception e) {
                call.reject("load photo failed: " + e.getMessage());
            } finally {
                target.delete();
            }
        });
    }

    @PermissionCallback
    private void onImagesPermission(PluginCall call) {
        if (getPermissionState(permissionAlias()) != PermissionState.GRANTED) {
            call.reject("permission denied");
            return;
        }
        String method = call.getMethodName();
        if ("getRecentPhotos".equals(method)) {
            getRecentPhotos(call);
        } else if ("getPhotoFile".equals(method)) {
            getPhotoFile(call);
        } else {
            getPhoto(call);
        }
    }

    private boolean ensurePermission(PluginCall call) {
        String alias = permissionAlias();
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            return true;
        }
        requestPermissionForAlias(alias, call, "onImagesPermission");
        return false;
    }

    private String permissionAlias() {
        return Build.VERSION.SDK_INT >= 33 ? PERMISSION_ALIAS : PERMISSION_ALIAS_LEGACY;
    }

    private Uri photoUri(String id) {
        return MediaStore.Images.Media.EXTERNAL_CONTENT_URI.buildUpon().appendPath(id).build();
    }

    private File cacheDir(String name) throws IOException {
        File dir = new File(getContext().getCacheDir(), name);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("cannot create " + name + " dir");
        }
        File[] files = dir.listFiles(file -> file.isFile());
        if (files != null && files.length > MAX_CACHE_FILES) {
            Arrays.sort(files, (first, second) -> Long.compare(first.lastModified(), second.lastModified()));
            for (int index = 0; index < files.length - MAX_CACHE_FILES; index++) {
                files[index].delete();
            }
        }
        return dir;
    }

    private void resolvePhotos(PluginCall call, JSArray photos) {
        JSObject result = new JSObject();
        result.put("photos", photos);
        call.resolve(result);
    }

    private JSObject photoResult(PreparedImage image) {
        JSObject result = new JSObject();
        result.put("path", image.file.getAbsolutePath());
        result.put("name", image.file.getName());
        result.put("mimeType", image.mimeType);
        return result;
    }

    /**
     * 优先按最长边 4096 解码并应用 EXIF 方向，写入规范化 JPEG/PNG/WebP；
     * SVG 等 Bitmap 无法解码的格式保留原字节，避免破坏内容。
     */
    private PreparedImage prepareImage(Uri uri, File dir, String prefix) throws IOException {
        String sourceName = queryDisplayName(uri);
        String sourceMime = sourceMime(uri, sourceName);
        PreparedImage normalized = writeNormalizedImage(uri, dir, prefix, sourceName, sourceMime);
        if (normalized != null) {
            return normalized;
        }
        String name = prefix + ensureExtension(safeFileName(sourceName), sourceMime);
        File target = uniqueFile(dir, name);
        copyStream(uri, target);
        return new PreparedImage(target, sourceMime);
    }

    private PreparedImage writeNormalizedImage(
        Uri uri,
        File dir,
        String prefix,
        String sourceName,
        String sourceMime
    ) throws IOException {
        android.content.ContentResolver resolver = getContext().getContentResolver();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return null;
            }
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            return null;
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, MAX_PHOTO_DIM);
        Bitmap bitmap;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return null;
            }
            bitmap = BitmapFactory.decodeStream(in, null, options);
        }
        if (bitmap == null) {
            return null;
        }

        try {
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            int longest = Math.max(width, height);
            if (longest > MAX_PHOTO_DIM) {
                float scale = MAX_PHOTO_DIM / (float) longest;
                Bitmap scaled = Bitmap.createScaledBitmap(
                    bitmap,
                    Math.max(1, Math.round(width * scale)),
                    Math.max(1, Math.round(height * scale)),
                    true
                );
                if (scaled != bitmap) {
                    bitmap.recycle();
                    bitmap = scaled;
                }
            }

            int orientation = readExifOrientation(resolver, uri);
            if (orientation != ExifInterface.ORIENTATION_NORMAL
                && orientation != ExifInterface.ORIENTATION_UNDEFINED) {
                Matrix matrix = new Matrix();
                switch (orientation) {
                    case ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90);
                    case ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180);
                    case ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270);
                    case ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1, 1);
                    case ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1, -1);
                    case ExifInterface.ORIENTATION_TRANSPOSE -> {
                        matrix.postRotate(90);
                        matrix.postScale(-1, 1);
                    }
                    case ExifInterface.ORIENTATION_TRANSVERSE -> {
                        matrix.postRotate(270);
                        matrix.postScale(-1, 1);
                    }
                    default -> {
                        // 未定义的方向不处理。
                    }
                }
                if (!matrix.isIdentity()) {
                    Bitmap oriented = Bitmap.createBitmap(
                        bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true
                    );
                    if (oriented != bitmap) {
                        bitmap.recycle();
                        bitmap = oriented;
                    }
                }
            }

            Bitmap.CompressFormat format;
            String mimeType;
            String extension;
            if ("image/png".equalsIgnoreCase(sourceMime)) {
                format = Bitmap.CompressFormat.PNG;
                mimeType = "image/png";
                extension = "png";
            } else if ("image/webp".equalsIgnoreCase(sourceMime)) {
                format = Bitmap.CompressFormat.WEBP;
                mimeType = "image/webp";
                extension = "webp";
            } else {
                format = Bitmap.CompressFormat.JPEG;
                mimeType = "image/jpeg";
                extension = "jpg";
            }
            String base = stripExtension(safeFileName(sourceName));
            File target = uniqueFile(dir, prefix + base + "." + extension);
            try (FileOutputStream out = new FileOutputStream(target)) {
                if (!bitmap.compress(format, 90, out)) {
                    target.delete();
                    return null;
                }
            }
            return new PreparedImage(target, mimeType);
        } finally {
            bitmap.recycle();
        }
    }

    /** 用 ContentResolver 流式解码，最长边缩到 maxDim 后压 JPEG 转 base64。 */
    private String loadScaledBase64(Uri uri, int maxDim, int quality) throws IOException {
        android.content.ContentResolver resolver = getContext().getContentResolver();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return null;
            }
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            return null;
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxDim);
        Bitmap bitmap;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return null;
            }
            bitmap = BitmapFactory.decodeStream(in, null, options);
        }
        if (bitmap == null) {
            return null;
        }

        try {
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            int longest = Math.max(width, height);
            if (longest > maxDim) {
                float scale = maxDim / (float) longest;
                Bitmap scaled = Bitmap.createScaledBitmap(
                    bitmap,
                    Math.max(1, Math.round(width * scale)),
                    Math.max(1, Math.round(height * scale)),
                    true
                );
                if (scaled != bitmap) {
                    bitmap.recycle();
                    bitmap = scaled;
                }
            }

            int exifOrientation = readExifOrientation(resolver, uri);
            if (exifOrientation != ExifInterface.ORIENTATION_NORMAL
                && exifOrientation != ExifInterface.ORIENTATION_UNDEFINED) {
                Matrix matrix = new Matrix();
                matrix.postRotate(switch (exifOrientation) {
                    case ExifInterface.ORIENTATION_ROTATE_90 -> 90;
                    case ExifInterface.ORIENTATION_ROTATE_180 -> 180;
                    case ExifInterface.ORIENTATION_ROTATE_270 -> 270;
                    default -> 0;
                });
                if (!matrix.isIdentity()) {
                    Bitmap oriented = Bitmap.createBitmap(
                        bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true
                    );
                    if (oriented != bitmap) {
                        bitmap.recycle();
                        bitmap = oriented;
                    }
                }
            }

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, buffer)) {
                return null;
            }
            return Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
        } finally {
            bitmap.recycle();
        }
    }

    private int sampleSize(int width, int height, int maxDim) {
        int sample = 1;
        while (Math.max(width, height) / (sample * 2) >= maxDim) {
            sample *= 2;
        }
        return sample;
    }

    private String queryDisplayName(Uri uri) {
        if (!"content".equalsIgnoreCase(uri.getScheme())) {
            return uri.getLastPathSegment();
        }
        try (Cursor cursor = getContext().getContentResolver().query(
            uri,
            new String[] { OpenableColumns.DISPLAY_NAME },
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) {
                    return name;
                }
            }
        } catch (Exception ignored) {
            // 部分文档提供者不返回 DISPLAY_NAME，使用后缀默认名。
        }
        return uri.getLastPathSegment();
    }

    private String sourceMime(Uri uri, String name) {
        String mime = null;
        try {
            mime = getContext().getContentResolver().getType(uri);
        } catch (Exception ignored) {
            // 少数文档提供者会拒绝 getType，继续按文件名推断。
        }
        if (mime != null && mime.startsWith("image/")) {
            return mime.toLowerCase(Locale.ROOT);
        }
        String extension = extension(name);
        String inferred = extension.isEmpty()
            ? null
            : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));
        return inferred != null && inferred.startsWith("image/")
            ? inferred
            : "image/jpeg";
    }

    private String safeFileName(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (cleaned.isEmpty() || ".".equals(cleaned) || "..".equals(cleaned)) {
            cleaned = "image_" + System.currentTimeMillis();
        }
        return cleaned.length() > 120 ? cleaned.substring(cleaned.length() - 120) : cleaned;
    }

    private String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        return base.isEmpty() ? "image" : base;
    }

    private String extension(String name) {
        if (name == null) {
            return "";
        }
        int dot = name.lastIndexOf('.');
        return dot >= 0 && dot < name.length() - 1 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
    }

    private String ensureExtension(String name, String mimeType) {
        if (!extension(name).isEmpty()) {
            return name;
        }
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        if (extension == null || extension.isEmpty()) {
            extension = "jpg";
        }
        return name + "." + extension;
    }

    private File uniqueFile(File dir, String name) {
        File target = new File(dir, name);
        if (!target.exists()) {
            return target;
        }
        String base = stripExtension(name);
        String extension = extension(name);
        String suffix = extension.isEmpty() ? "" : "." + extension;
        for (int index = 1; index < 10_000; index++) {
            target = new File(dir, base + "_" + index + suffix);
            if (!target.exists()) {
                return target;
            }
        }
        return new File(dir, base + "_" + System.currentTimeMillis() + suffix);
    }

    private void copyStream(Uri uri, File target) throws IOException {
        android.content.ContentResolver resolver = getContext().getContentResolver();
        try (InputStream in = resolver.openInputStream(uri); FileOutputStream out = new FileOutputStream(target)) {
            if (in == null) {
                throw new IOException("image not readable");
            }
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) >= 0) {
                out.write(buffer, 0, read);
            }
        } catch (IOException error) {
            target.delete();
            throw error;
        }
    }

    /** 读取 JPEG 的 EXIF 方向；流式读取，读不到或非 JPEG 时按未定义处理。 */
    private int readExifOrientation(android.content.ContentResolver resolver, Uri uri) {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) {
                return ExifInterface.ORIENTATION_UNDEFINED;
            }
            return new ExifInterface(in).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_UNDEFINED
            );
        } catch (Exception e) {
            return ExifInterface.ORIENTATION_UNDEFINED;
        }
    }
}
