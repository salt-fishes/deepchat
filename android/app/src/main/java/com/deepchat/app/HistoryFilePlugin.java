package com.deepchat.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.database.Cursor;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;

@CapacitorPlugin(name = "HistoryFile")
public class HistoryFilePlugin extends Plugin {
    private static final int MAX_CHUNK = 192 * 1024;
    private boolean choosing;
    private Uri destination;
    private OutputStream output;
    private File sourceFile;
    private RandomAccessFile source;

    @PluginMethod
    public synchronized void chooseSource(PluginCall call) {
        if (choosing || source != null) {
            call.reject("A history backup is already open");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        choosing = true;
        try {
            startActivityForResult(call, intent, "onSource");
        } catch (RuntimeException error) {
            choosing = false;
            call.reject("Unable to open the system file picker", error);
        }
    }

    @ActivityCallback
    private synchronized void onSource(PluginCall call, ActivityResult result) {
        choosing = false;
        if (call == null) {
            return;
        }
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            call.resolve(new JSObject().put("selected", false));
            return;
        }
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("The file picker did not return a backup");
            return;
        }
        Uri uri = data.getData();
        // Document providers can return non-seekable streams. Copy to a private cache file on the plugin thread.
        bridge.execute(() -> prepareSource(call, uri));
    }

    private synchronized void prepareSource(PluginCall call, Uri uri) {
        try {
            var resolver = getContext().getContentResolver();
            String name = "chat-history.zip";
            try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                    name = cursor.getString(0);
                }
            }
            sourceFile = File.createTempFile("history-import-", ".tmp", getContext().getCacheDir());
            try (InputStream in = resolver.openInputStream(uri); OutputStream out = new FileOutputStream(sourceFile)) {
                if (in == null) {
                    throw new IOException("The backup could not be opened");
                }
                byte[] buffer = new byte[64 * 1024];
                long total = 0;
                for (int count; (count = in.read(buffer)) != -1;) {
                    total += count;
                    if (total >= 0xffffffffL) {
                        throw new IOException("The backup exceeds the supported ZIP size");
                    }
                    out.write(buffer, 0, count);
                }
            }
            source = new RandomAccessFile(sourceFile, "r");
            call.resolve(new JSObject().put("selected", true).put("name", name).put("size", source.length()));
        } catch (IOException | RuntimeException error) {
            closeSource();
            call.reject("Unable to read the selected backup", error);
        }
    }

    @PluginMethod
    public synchronized void read(PluginCall call) {
        long offset = call.getData().optLong("offset", -1L);
        int length = call.getInt("length", 0);
        if (source == null || offset < 0 || length <= 0 || length > MAX_CHUNK) {
            call.reject("Invalid history backup read");
            return;
        }
        try {
            byte[] bytes = new byte[length];
            source.seek(offset);
            source.readFully(bytes);
            call.resolve(new JSObject().put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)));
        } catch (IOException error) {
            call.reject("Unable to read the backup", error);
        }
    }

    @PluginMethod
    public synchronized void releaseSource(PluginCall call) {
        closeSource();
        call.resolve();
    }

    private void closeSource() {
        if (source != null) {
            try {
                source.close();
            } catch (IOException ignored) {
                // Continue with removal of the cached copy.
            }
            source = null;
        }
        if (sourceFile != null) {
            sourceFile.delete();
            sourceFile = null;
        }
    }

    @PluginMethod
    public synchronized void chooseDestination(PluginCall call) {
        if (choosing || destination != null) {
            call.reject("A history backup is already open");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "chat-history.zip"));
        choosing = true;
        try {
            startActivityForResult(call, intent, "onDestination");
        } catch (RuntimeException error) {
            choosing = false;
            call.reject("Unable to open the system file picker", error);
        }
    }

    @ActivityCallback
    private synchronized void onDestination(PluginCall call, ActivityResult result) {
        choosing = false;
        if (call == null) {
            return;
        }
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            call.resolve(new JSObject().put("selected", false));
            return;
        }
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("The file picker did not return a destination");
            return;
        }
        destination = data.getData();
        call.resolve(new JSObject().put("selected", true));
    }

    @PluginMethod
    public synchronized void append(PluginCall call) {
        String data = call.getString("data", "");
        if (destination == null || data.isEmpty() || data.length() > MAX_CHUNK / 3 * 4) {
            call.reject("Invalid history backup write");
            return;
        }
        try {
            if (output == null) {
                output = getContext().getContentResolver().openOutputStream(destination, "wt");
                if (output == null) {
                    throw new IOException("The destination could not be opened");
                }
            }
            output.write(Base64.decode(data, Base64.NO_WRAP));
            call.resolve();
        } catch (IOException | RuntimeException error) {
            discard();
            call.reject("Unable to write the backup", error);
        }
    }

    @PluginMethod
    public synchronized void finish(PluginCall call) {
        if (output == null) {
            call.reject("No history backup is open");
            return;
        }
        try {
            output.close();
            output = null;
            destination = null;
            call.resolve();
        } catch (IOException | RuntimeException error) {
            discard();
            call.reject("Unable to finish saving the backup", error);
        }
    }

    @PluginMethod
    public synchronized void abort(PluginCall call) {
        discard();
        call.resolve();
    }

    @Override
    protected synchronized void handleOnDestroy() {
        closeSource();
        discard();
    }

    private void discard() {
        if (output != null) {
            try {
                output.close();
            } catch (IOException | RuntimeException ignored) {
                // Continue with removal even if closing the stream failed.
            }
            output = null;
        }
        if (destination != null) {
            try {
                DocumentsContract.deleteDocument(getContext().getContentResolver(), destination);
            } catch (Exception ignored) {
                // Some document providers do not allow deletion.
            }
            destination = null;
        }
    }
}

