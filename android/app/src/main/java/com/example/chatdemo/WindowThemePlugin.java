package com.example.chatdemo;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WindowTheme")
public class WindowThemePlugin extends Plugin {
    @PluginMethod
    public void setTheme(PluginCall call) {
        Boolean dark = call.getBoolean("dark");
        if (dark == null) {
            call.reject("Missing dark theme flag");
            return;
        }

        MainActivity activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> {
            activity.applyWindowTheme(dark);
            call.resolve();
        });
    }
}
