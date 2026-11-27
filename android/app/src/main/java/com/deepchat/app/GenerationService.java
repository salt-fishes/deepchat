package com.deepchat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

public class GenerationService extends Service {
    public static final String ACTION_START = "com.deepchat.app.action.GENERATION_START";
    private static final String CHANNEL = "background-generation";
    private static final int NOTIFICATION = 3802;

    public static void stop(Context context) {
        context.stopService(new Intent(context, GenerationService.class));
        context.getSystemService(NotificationManager.class).cancel(NOTIFICATION);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || !ACTION_START.equals(intent.getAction())) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        try {
            createChannel();
            startForeground(NOTIFICATION, notification());
        } catch (RuntimeException error) {
            Log.w("GenerationService", "Unable to show the foreground notification", error);
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        return START_NOT_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.generation_channel),
            NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.generation_channel_description));
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, NOTIFICATION,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_generation)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.generation_opening))
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build();
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        stopSelf(startId);
    }

    @Override
    public void onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        getSystemService(NotificationManager.class).cancel(NOTIFICATION);
        super.onDestroy();
    }
}
