package com.deepchat.app;

import android.Manifest;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.util.Base64;
import android.provider.MediaStore;

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
import java.io.IOException;
import java.io.InputStream;

/**
 * 读取设备相册最近图片，供输入区附件面板的「最近图片」行使用。
 * WebView 无法枚举 MediaStore，必须走原生：缩略图与原图都以 base64 返回，避免 content:// 权限问题。
 */
@CapacitorPlugin(
    name = "MediaGallery",
    permissions = {
        // API 33+ 用细分权限，旧系统回退 READ_EXTERNAL_STORAGE；按系统版本选用别名，
        // 避免 maxSdkVersion 裁剪后 Capacitor 校验报「manifest 缺权限」
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
    private static final String PERMISSION_ALIAS = "readImages33";
    private static final String PERMISSION_ALIAS_LEGACY = "readImagesLegacy";

    /** 拍照结果临时文件；相机 Activity 返回时读回，随后立刻删除 */
    private File pendingPhotoFile;

    @PluginMethod
    public void getRecentPhotos(PluginCall call) {
        if (!ensurePermission(call)) {
            return;
        }
        int limit = call.getInt("limit", 24);
        JSArray photos = new JSArray();
        try {
            String[] projection = { MediaStore.Images.Media._ID };
            try (android.database.Cursor cursor = getContext()
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
        JSObject result = new JSObject();
        result.put("photos", photos);
        call.resolve(result);
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
            String data = loadScaledBase64(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI.buildUpon().appendPath(id).build(),
                MAX_PHOTO_DIM,
                90
            );
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

    /**
     * 调起系统相机拍照。WebView 的 <input capture> 在 Android 上只会弹通用文件选择器，
     * 因此拍照必须走原生 ACTION_IMAGE_CAPTURE：结果写进应用缓存目录（FileProvider 授权给相机应用），
     * 拍完读回转 base64。全程不需要存储权限。
     */
    @PluginMethod
    public void takePhoto(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), "camera");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("cannot create camera dir");
            return;
        }
        File target = new File(dir, "capture_" + System.currentTimeMillis() + ".jpg");
        Uri output = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            target
        );
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, output);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        pendingPhotoFile = target;
        startActivityForResult(call, intent, "onCameraResult");
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
        try {
            String data = loadScaledBase64(Uri.fromFile(target), MAX_PHOTO_DIM, 90);
            if (data == null) {
                call.reject("photo not readable");
                return;
            }
            JSObject photo = new JSObject();
            photo.put("data", data);
            photo.put("mimeType", "image/jpeg");
            call.resolve(photo);
        } catch (Exception e) {
            call.reject("load photo failed: " + e.getMessage());
        } finally {
            target.delete();
        }
    }

    @PermissionCallback
    private void onImagesPermission(PluginCall call) {
        if (getPermissionState(permissionAlias()) == PermissionState.GRANTED) {
            String method = call.getMethodName();
            if ("getRecentPhotos".equals(method)) {
                getRecentPhotos(call);
            } else {
                getPhoto(call);
            }
        } else {
            call.reject("permission denied");
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
        return android.os.Build.VERSION.SDK_INT >= 33 ? PERMISSION_ALIAS : PERMISSION_ALIAS_LEGACY;
    }

    /** 用 ContentResolver 流式解码（分区存储下不能直接用文件路径），最长边缩到 maxDim 后压 JPEG 转 base64 */
    private String loadScaledBase64(android.net.Uri uri, int maxDim, int quality) throws IOException {
        android.content.ContentResolver resolver = getContext().getContentResolver();

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        // inJustDecodeBounds 时 decodeStream 按约定返回 null 但会填充 outWidth/outHeight，
        // 因此只检查流与尺寸，不检查返回值
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

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int longest = Math.max(width, height);
        if (longest > maxDim) {
            float scale = maxDim / (float) longest;
            bitmap = Bitmap.createScaledBitmap(
                bitmap,
                Math.max(1, Math.round(width * scale)),
                Math.max(1, Math.round(height * scale)),
                true
            );
        }

        // 相机等来源把方向写在 EXIF 里，BitmapFactory 不会应用；先读方向再旋转
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
            bitmap = Bitmap.createBitmap(
                bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true
            );
        }

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, buffer);
        bitmap.recycle();
        return Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
    }

    private int sampleSize(int width, int height, int maxDim) {
        int sample = 1;
        while (Math.max(width, height) / (sample * 2) >= maxDim) {
            sample *= 2;
        }
        return sample;
    }

    /** 读取 JPEG 的 EXIF 方向；流式读取，读不到或非 JPEG 时按未定义处理 */
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

