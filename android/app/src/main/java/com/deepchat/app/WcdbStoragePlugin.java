package com.deepchat.app;

import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.tencent.wcdb.base.WCDBException;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** 把会话、摘要、附件原件和导入暂存存进 WCDB，替代 WebView 的 IndexedDB。 */
@CapacitorPlugin(name = "WcdbStorage")
public class WcdbStoragePlugin extends Plugin {
    private WcdbStore store;

    @PluginMethod
    public void initialize(PluginCall call) {
        if (store != null) {
            call.resolve();
            return;
        }
        try {
            File file = new File(getContext().getFilesDir(), "deepchat.db");
            store = new WcdbStore(file.getPath());
            call.resolve();
        } catch (WCDBException error) {
            call.reject("Unable to open WCDB", error);
        }
    }

    private void reject(PluginCall call, String message, Exception error) {
        call.reject(message, error);
    }

    static JSObject encode(WcdbRecord row, String kind) {
        JSObject item = new JSObject();
        item.put("id", row.id.substring(kind.length() + 1));
        item.put("json", row.json == null ? "" : row.json);
        item.put("blob", row.blob == null ? "" : Base64.encodeToString(row.blob, Base64.NO_WRAP));
        return item;
    }

    static WcdbRecord decode(JSONObject item) {
        WcdbRecord row = new WcdbRecord();
        row.id = item.optString("kind") + ':' + item.optString("id");
        String json = item.optString("json");
        row.json = json.isEmpty() ? null : json;
        String blob = item.optString("blob");
        row.blob = blob.isEmpty() ? null : Base64.decode(blob, Base64.DEFAULT);
        return row;
    }

    private static String key(JSONObject item) {
        return item.optString("kind") + ':' + item.optString("id");
    }

    @PluginMethod
    public void getAll(PluginCall call) {
        String kind = call.getString("kind", "");
        if (kind.isEmpty()) {
            call.reject("Missing kind");
            return;
        }
        bridge.execute(() -> {
            try {
                JSArray items = new JSArray();
                for (WcdbRecord row : store.getAll(kind)) {
                    items.put(encode(row, kind));
                }
                call.resolve(new JSObject().put("items", items));
            } catch (WCDBException error) {
                reject(call, "WCDB read failed", error);
            }
        });
    }

    @PluginMethod
    public void getStagingSessionPage(PluginCall call) {
        String after = call.getString("after", "");
        bridge.execute(() -> {
            try {
                JSArray items = new JSArray();
                for (WcdbRecord row : store.getStagingSessionPage(after)) {
                    items.put(encode(row, "ss"));
                }
                call.resolve(new JSObject().put("items", items));
            } catch (WCDBException error) {
                reject(call, "WCDB staging session read failed", error);
            }
        });
    }

    @PluginMethod
    public void get(PluginCall call) {
        String kind = call.getString("kind", "");
        String id = call.getString("id", "");
        if (kind.isEmpty() || id.isEmpty()) {
            call.reject("Missing key");
            return;
        }
        bridge.execute(() -> {
            try {
                WcdbRecord row = store.get(kind, id);
                JSObject result = new JSObject();
                result.put("found", row != null);
                if (row != null) {
                    result.put("item", encode(row, kind));
                }
                call.resolve(result);
            } catch (WCDBException error) {
                reject(call, "WCDB read failed", error);
            }
        });
    }

    @PluginMethod
    public void put(PluginCall call) {
        JSArray items = call.getArray("items", new JSArray());
        List<WcdbRecord> rows = new ArrayList<>();
        try {
            for (int index = 0; index < items.length(); index++) {
                rows.add(decode(items.getJSONObject(index)));
            }
        } catch (Exception error) {
            call.reject("Invalid WCDB items", error);
            return;
        }
        bridge.execute(() -> {
            try {
                store.put(rows);
                call.resolve();
            } catch (WCDBException error) {
                reject(call, "WCDB write failed", error);
            }
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        JSArray keys = call.getArray("keys", new JSArray());
        List<String> values = new ArrayList<>();
        try {
            for (int index = 0; index < keys.length(); index++) {
                values.add(key(keys.getJSONObject(index)));
            }
        } catch (Exception error) {
            call.reject("Invalid WCDB keys", error);
            return;
        }
        bridge.execute(() -> {
            try {
                store.remove(values);
                call.resolve();
            } catch (WCDBException error) {
                reject(call, "WCDB delete failed", error);
            }
        });
    }

    @PluginMethod
    public void commitHistory(PluginCall call) {
        bridge.execute(() -> {
            try {
                store.commitHistory();
                call.resolve();
            } catch (WCDBException error) {
                reject(call, "WCDB commit failed", error);
            }
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        JSArray kinds = call.getArray("kinds", new JSArray());
        List<String> values = new ArrayList<>();
        try {
            for (int index = 0; index < kinds.length(); index++) {
                values.add(kinds.getString(index));
            }
        } catch (Exception error) {
            call.reject("Invalid WCDB kinds", error);
            return;
        }
        bridge.execute(() -> {
            try {
                for (String kind : values) {
                    store.clear(kind);
                }
                call.resolve();
            } catch (WCDBException error) {
                reject(call, "WCDB clear failed", error);
            }
        });
    }
}

