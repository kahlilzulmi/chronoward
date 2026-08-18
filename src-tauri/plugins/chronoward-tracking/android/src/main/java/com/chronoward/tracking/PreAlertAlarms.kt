package com.chronoward.tracking

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object PreAlertAlarms {
    const val ACTION = "com.chronoward.tracking.PRE_ALERT"
    const val EXTRA_TITLE = "notificationTitle"
    const val EXTRA_BODY = "notificationBody"

    private const val REQUEST_CODE = 4101
    private const val CHANNEL_ID = "chronoward.pre_alert"
    private const val CHANNEL_NAME = "Chronoward alerts"
    private const val NOTIFICATION_ID = 4101

    fun schedule(context: Context, delayMs: Long, title: String, body: String) {
        val app = context.applicationContext
        if (delayMs <= 0) {
            cancel(app)
            return
        }
        ensureChannel(app)
        val alarmManager = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pending = pendingIntent(app, title, body)
        val triggerAt = System.currentTimeMillis() + delayMs
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            try {
                val settingsIntent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${app.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(settingsIntent)
            } catch (_: Exception) {
            }
        }
        try {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
        } catch (_: SecurityException) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
        }
    }

    fun cancel(context: Context) {
        val app = context.applicationContext
        val alarmManager = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(app, "", ""))
    }

    fun notifyNow(context: Context, title: String, body: String) {
        val app = context.applicationContext
        ensureChannel(app)
        val launch = app.packageManager.getLaunchIntentForPackage(app.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val contentPending = PendingIntent.getActivity(
            app,
            REQUEST_CODE + 1,
            launch ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title.ifBlank { "Chronoward" })
            .setContentText(body.ifBlank { "Session ends in 1 minute." })
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(contentPending)
            .build()
        try {
            NotificationManagerCompat.from(app).notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
        }
    }

    private fun pendingIntent(context: Context, title: String, body: String): PendingIntent {
        val intent = Intent(context, PreAlertReceiver::class.java).apply {
            action = ACTION
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_BODY, body)
        }
        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Work and break pre-alerts while the screen is off"
            enableVibration(true)
            setShowBadge(true)
        }
        manager.createNotificationChannel(channel)
    }
}
