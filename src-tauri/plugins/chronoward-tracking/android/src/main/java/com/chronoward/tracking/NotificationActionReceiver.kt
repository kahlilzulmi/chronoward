package com.chronoward.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = when (intent.action) {
            ACTION_PAUSE -> "pause"
            ACTION_RESUME -> "resume"
            ACTION_SKIP -> "skip"
            ACTION_ADD_TIME -> "add_time"
            ACTION_STOP -> "stop"
            else -> return
        }
        TrackingPlugin.emitNotificationAction(action)
        TimerNotificationService.handleAction(context, action)
    }

    companion object {
        const val ACTION_PAUSE = "com.chronoward.tracking.NOTIFICATION_PAUSE"
        const val ACTION_RESUME = "com.chronoward.tracking.NOTIFICATION_RESUME"
        const val ACTION_SKIP = "com.chronoward.tracking.NOTIFICATION_SKIP"
        const val ACTION_ADD_TIME = "com.chronoward.tracking.NOTIFICATION_ADD_TIME"
        const val ACTION_STOP = "com.chronoward.tracking.NOTIFICATION_STOP"
    }
}
