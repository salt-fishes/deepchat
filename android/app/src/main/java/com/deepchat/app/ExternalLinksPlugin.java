package com.deepchat.app;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalLinks")
public class ExternalLinksPlugin extends Plugin {

    @PluginMethod
    public void openInApp(PluginCall call) {
        Uri uri = webUri(call.getString("url"));
        var activity = getActivity();
        if (uri == null) {
            call.reject("Only http and https links are supported");
            return;
        }
        if (activity == null) {
            call.reject("Activity is unavailable");
            return;
        }

        Intent intent = new Intent(activity, BrowserActivity.class)
            .putExtra(BrowserActivity.EXTRA_URL, uri.toString());
        String title = call.getString("title");
        Boolean dark = call.getBoolean("dark");
        if (title != null) intent.putExtra(BrowserActivity.EXTRA_TITLE, title);
        if (dark != null) intent.putExtra(BrowserActivity.EXTRA_DARK, dark);
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(intent);
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Unable to open the in-app browser", error);
            }
        });
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        Uri uri = webUri(call.getString("url"));
        var activity = getActivity();
        if (uri == null) {
            call.reject("Only http and https links are supported");
            return;
        }
        if (activity == null) {
            call.reject("Activity is unavailable");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(intent);
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("No browser is available for this link", error);
            }
        });
    }

    static Uri webUri(String value) {
        if (value == null) return null;
        Uri uri = Uri.parse(value.trim());
        String scheme = uri.getScheme();
        if (scheme == null || (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme))) {
            return null;
        }
        String host = uri.getHost();
        return host == null || host.trim().isEmpty() ? null : uri;
    }
}
