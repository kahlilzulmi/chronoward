package com.chronoward.tracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class TimerNotificationService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_UPDATE -> applyUpdate(intent)
            ACTION_START -> applyStart(intent)
            else -> {
                if (intent != null) {
                    applyStart(intent)
                }
            }
        }
        startForegroundCompat(createNotification(this))
        return START_REDELIVER_INTENT
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun applyStart(intent: Intent) {
        stateTitle = intent.getStringExtra(EXTRA_TITLE)?.ifBlank { "Chronoward" } ?: "Chronoward"
        stateSessionType = intent.getStringExtra(EXTRA_SESSION_TYPE) ?: "work"
        stateIsPaused = intent.getBooleanExtra(EXTRA_IS_PAUSED, false)
        stateRemainingSeconds = intent.getLongExtra(EXTRA_REMAINING_SECONDS, 0L).coerceAtLeast(0L)
        refreshChronometerBase()
    }

    private fun applyUpdate(intent: Intent) {
        stateIsPaused = intent.getBooleanExtra(EXTRA_IS_PAUSED, stateIsPaused)
        if (intent.hasExtra(EXTRA_REMAINING_SECONDS)) {
            stateRemainingSeconds = intent.getLongExtra(EXTRA_REMAINING_SECONDS, 0L).coerceAtLeast(0L)
        }
        refreshChronometerBase()
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        const val NOTIFICATION_ID = 4201
        const val CHANNEL_ID = "chronoward.ongoing_timer"
        private const val CHANNEL_NAME = "Chronoward timer"
        private const val ACTION_START = "com.chronoward.tracking.TIMER_START"
        private const val ACTION_UPDATE = "com.chronoward.tracking.TIMER_UPDATE"
        private const val ACTION_STOP = "com.chronoward.tracking.TIMER_STOP"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_REMAINING_SECONDS = "remainingSeconds"
        private const val EXTRA_IS_PAUSED = "isPaused"
        private const val EXTRA_SESSION_TYPE = "sessionType"
        private const val ADD_TIME_SECONDS = 5L * 60L

        private const val REQUEST_CONTENT = 4201
        private const val REQUEST_PAUSE = 4202
        private const val REQUEST_RESUME = 4203
        private const val REQUEST_SKIP = 4204
        private const val REQUEST_ADD_TIME = 4205
        private const val REQUEST_STOP = 4206

        @Volatile
        private var stateTitle: String = "Chronoward"
        @Volatile
        private var stateSessionType: String = "work"
        @Volatile
        private var stateIsPaused: Boolean = false
        @Volatile
        private var stateRemainingSeconds: Long = 0L
        @Volatile
        private var stateChronometerBase: Long = 0L

        fun start(
            context: Context,
            title: String,
            remainingSeconds: Long,
            isPaused: Boolean,
            sessionType: String,
        ) {
            val app = context.applicationContext
            ensureChannel(app)
            val intent = Intent(app, TimerNotificationService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_REMAINING_SECONDS, remainingSeconds.coerceAtLeast(0L))
                putExtra(EXTRA_IS_PAUSED, isPaused)
                putExtra(EXTRA_SESSION_TYPE, sessionType)
            }
            try {
                ContextCompat.startForegroundService(app, intent)
            } catch (_: Exception) {
            }
        }

        fun update(context: Context, isPaused: Boolean, remainingSeconds: Long) {
            val app = context.applicationContext
            ensureChannel(app)
            val intent = Intent(app, TimerNotificationService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_IS_PAUSED, isPaused)
                putExtra(EXTRA_REMAINING_SECONDS, remainingSeconds.coerceAtLeast(0L))
            }
            try {
                ContextCompat.startForegroundService(app, intent)
            } catch (_: Exception) {
            }
        }

        fun stop(context: Context) {
            val app = context.applicationContext
            try {
                app.stopService(Intent(app, TimerNotificationService::class.java))
            } catch (_: Exception) {
            }
        }

        fun handleAction(context: Context, action: String) {
            when (action) {
                "pause" -> {
                    stateRemainingSeconds = currentRemainingSeconds()
                    stateIsPaused = true
                    refreshChronometerBase()
                    update(context, true, stateRemainingSeconds)
                }
                "resume" -> {
                    stateRemainingSeconds = currentRemainingSeconds()
                    stateIsPaused = false
                    refreshChronometerBase()
                    update(context, false, stateRemainingSeconds)
                }
                "add_time" -> {
                    stateRemainingSeconds = currentRemainingSeconds() + ADD_TIME_SECONDS
                    refreshChronometerBase()
                    update(context, stateIsPaused, stateRemainingSeconds)
                }
                "stop" -> stop(context)
                "skip" -> { }
            }
        }

        private fun currentRemainingSeconds(): Long {
            if (stateIsPaused) {
                return stateRemainingSeconds.coerceAtLeast(0L)
            }
            val leftMs = stateChronometerBase - SystemClock.elapsedRealtime()
            return (leftMs / 1000L).coerceAtLeast(0L)
        }

        private fun refreshChronometerBase() {
            stateChronometerBase =
                SystemClock.elapsedRealtime() + stateRemainingSeconds.coerceAtLeast(0L) * 1000L
        }

        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                return
            }
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Ongoing work and break countdown"
                enableVibration(false)
                setSound(null, null)
                setShowBadge(false)
            }
            manager.createNotificationChannel(channel)
        }

        private fun actionPending(context: Context, requestCode: Int, action: String): PendingIntent {
            val intent = Intent(context, NotificationActionReceiver::class.java).apply {
                this.action = action
            }
            return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun sessionLabel(sessionType: String): String {
            return when (sessionType) {
                "work" -> "Work"
                "shortBreak" -> "Short Break"
                "longBreak" -> "Long Break"
                else -> sessionType.ifBlank { "Session" }
            }
        }

        private fun formatRemaining(seconds: Long): String {
            val safe = seconds.coerceAtLeast(0L)
            val minutes = safe / 60L
            val remainder = safe % 60L
            return "%02d:%02d".format(minutes, remainder)
        }

        fun createNotification(context: Context): Notification {
            val app = context.applicationContext
            ensureChannel(app)
            val remaining = currentRemainingSeconds()
            val launch = app.packageManager.getLaunchIntentForPackage(app.packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            val contentPending = PendingIntent.getActivity(
                app,
                REQUEST_CONTENT,
                launch ?: Intent(),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val builder = NotificationCompat.Builder(app, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(stateTitle.ifBlank { "Chronoward" })
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(contentPending)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)

            if (stateIsPaused) {
                builder
                    .setUsesChronometer(false)
                    .setContentText("Paused · ${formatRemaining(remaining)} · ${sessionLabel(stateSessionType)}")
                    .addAction(
                        android.R.drawable.ic_media_play,
                        "Resume",
                        actionPending(app, REQUEST_RESUME, NotificationActionReceiver.ACTION_RESUME),
                    )
            } else {
                builder
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true)
                    .setWhen(System.currentTimeMillis() + remaining * 1000L)
                    .setBase(SystemClock.elapsedRealtime() + remaining * 1000L)
                    .setContentText(sessionLabel(stateSessionType))
                    .addAction(
                        android.R.drawable.ic_media_pause,
                        "Pause",
                        actionPending(app, REQUEST_PAUSE, NotificationActionReceiver.ACTION_PAUSE),
                    )
            }

            builder
                .addAction(
                    android.R.drawable.ic_media_next,
                    "Skip",
                    actionPending(app, REQUEST_SKIP, NotificationActionReceiver.ACTION_SKIP),
                )
                .addAction(
                    android.R.drawable.ic_input_add,
                    "+5 Min",
                    actionPending(app, REQUEST_ADD_TIME, NotificationActionReceiver.ACTION_ADD_TIME),
                )
                .addAction(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "Stop",
                    actionPending(app, REQUEST_STOP, NotificationActionReceiver.ACTION_STOP),
                )

            return builder.build()
        }
    }
}
