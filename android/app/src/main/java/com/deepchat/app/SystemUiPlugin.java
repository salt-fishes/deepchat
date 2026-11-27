package com.deepchat.app;

import android.provider.Settings;
import android.view.HapticFeedbackConstants;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemUi")
public class SystemUiPlugin extends Plugin {

    @PluginMethod
    public void haptic(PluginCall call) {
        var activity = getActivity();
        if (activity == null) {
            call.reject("Activity is unavailable");
            return;
        }
        String style = call.getString("style", "light");
        int feedback = "medium".equals(style)
            ? HapticFeedbackConstants.LONG_PRESS
            : HapticFeedbackConstants.KEYBOARD_TAP;
        activity.runOnUiThread(() -> {
            activity.getWindow().getDecorView().performHapticFeedback(feedback);
            call.resolve();
        });
    }

    @PluginMethod
    public void getFontScale(PluginCall call) {
        float scale = 1f;
        try {
            scale = Settings.System.getFloat(getContext().getContentResolver(), Settings.System.FONT_SCALE);
        } catch (Settings.SettingNotFoundException | RuntimeException ignored) {
            // A missing or device-protected setting falls back to the Web default.
        }
        if (!Float.isFinite(scale) || scale <= 0f) scale = 1f;
        call.resolve(new JSObject().put("scale", scale));
    }
}
