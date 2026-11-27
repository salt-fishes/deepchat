package com.deepchat.app;

import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Generation")
public class GenerationPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            ContextCompat.startForegroundService(getContext(),
                new Intent(getContext(), GenerationService.class).setAction(GenerationService.ACTION_START));
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Unable to start background generation", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        GenerationService.stop(getContext());
        call.resolve();
    }
}
