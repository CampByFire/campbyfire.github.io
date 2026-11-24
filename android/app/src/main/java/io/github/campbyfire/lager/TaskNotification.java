package io.github.campbyfire.lager;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.text.format.DateUtils;

import org.json.JSONException;
import org.json.JSONObject;

final class TaskNotification {
    private static final String CHANNEL = "task_timer";
    private static final int ID = 1;

    static void update(Context context, String message) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        try {
            JSONObject timer = new JSONObject(message);
            String status = timer.getString("status");
            if ("clear".equals(status)) {
                manager.cancel(ID);
                return;
            }
            if (!manager.areNotificationsEnabled()) return;
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Задача у огня", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
            Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (open == null) return;
            PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder note = new Notification.Builder(context, CHANNEL)
                    .setSmallIcon(R.drawable.fire)
                    .setContentTitle(timer.getString("title"))
                    .setContentIntent(tap)
                    .setVisibility(Notification.VISIBILITY_PRIVATE)
                    .setOnlyAlertOnce(true);
            if ("running".equals(status)) {
                long remaining = timer.getLong("endsAt") - System.currentTimeMillis();
                if (remaining <= 0) {
                    manager.cancel(ID);
                    return;
                }
                note.setContentText("Сейчас у огня").setOngoing(true)
                        .setWhen(timer.getLong("startedAt")).setShowWhen(true)
                        .setUsesChronometer(true).setTimeoutAfter(remaining);
            } else if ("paused".equals(status)) {
                String elapsed = DateUtils.formatElapsedTime(timer.getLong("elapsed") / 1000);
                note.setContentText("На паузе · " + elapsed).setShowWhen(false);
            } else {
                return;
            }
            manager.notify(ID, note.build());
        } catch (JSONException ignored) {
            // Неизвестное сообщение от другой версии сайта.
        }
    }
}
