package com.chronoward.tracking

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.lang.ref.WeakReference

@InvokeArg
class PermissionArgs {
    var requestAccessibility: Boolean = false
}

@InvokeArg
class ScheduleAlarmArgs {
    var delayMs: Long = 0
    var notificationTitle: String = "Chronoward"
    var notificationBody: String = ""
}

@InvokeArg
class StartOngoingNotificationArgs {
    var title: String = "Chronoward"
    var remainingSeconds: Long = 0
    var isPaused: Boolean = false
    var sessionType: String = "work"
}

@InvokeArg
class UpdateNotificationStateArgs {
    var isPaused: Boolean = false
    var remainingSeconds: Long = 0
}

@TauriPlugin
class TrackingPlugin(private val activity: Activity) : Plugin(activity) {
    private var isPolling = false
    private var pollingThread: Thread? = null

    override fun load(webView: WebView) {
        instanceRef = WeakReference(this)
        startPollingIfNeeded()
    }

    // Tauri converts JS snake_case to Kotlin camelCase, so
    // check_permissions → checkPermissions and request_permissions → requestPermissions.
    // Those names are reserved on Plugin for Android runtime-permission aliases.
    // Override them so Usage Access / Accessibility settings are used instead.
    @Command
    override fun checkPermissions(invoke: Invoke) {
        val payload = JSObject()
        val usage = TrackingManager.hasUsageAccess(activity)
        val accessibility = isAccessibilityEnabled(activity)
        payload.put("usageAccess", usage)
        payload.put("accessibilityEnabled", accessibility)
        payload.put("canTrackApps", usage)
        payload.put("canTrackUrls", usage && accessibility)
        invoke.resolve(payload)
    }

    @Command
    override fun requestPermissions(invoke: Invoke) {
        val args = invoke.parseArgs(PermissionArgs::class.java)
        activity.runOnUiThread {
            val usageIntent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            usageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(usageIntent)
            if (args.requestAccessibility) {
                val accessibilityIntent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                accessibilityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(accessibilityIntent)
            }
        }
        invoke.resolve()
    }

    @Command
    fun scheduleExactAlarm(invoke: Invoke) {
        val args = invoke.parseArgs(ScheduleAlarmArgs::class.java)
        PreAlertAlarms.schedule(
            activity,
            args.delayMs,
            args.notificationTitle,
            args.notificationBody,
        )
        invoke.resolve()
    }

    @Command
    fun cancelExactAlarm(invoke: Invoke) {
        PreAlertAlarms.cancel(activity)
        invoke.resolve()
    }

    @Command
    fun startOngoingNotification(invoke: Invoke) {
        val args = invoke.parseArgs(StartOngoingNotificationArgs::class.java)
        TimerNotificationService.start(
            activity,
            args.title,
            args.remainingSeconds,
            args.isPaused,
            args.sessionType,
        )
        invoke.resolve()
    }

    @Command
    fun updateNotificationState(invoke: Invoke) {
        val args = invoke.parseArgs(UpdateNotificationStateArgs::class.java)
        TimerNotificationService.update(
            activity,
            args.isPaused,
            args.remainingSeconds,
        )
        invoke.resolve()
    }

    @Command
    fun clearOngoingNotification(invoke: Invoke) {
        TimerNotificationService.stop(activity)
        invoke.resolve()
    }

    private fun startPollingIfNeeded() {
        if (isPolling) return
        isPolling = true
        pollingThread = Thread {
            var lastSerialized = ""
            while (isPolling) {
                if (!TrackingManager.hasUsageAccess(activity)) {
                    Thread.sleep(1000)
                    continue
                }
                val context = try {
                    TrackingManager.currentContext(activity)
                } catch (_: Exception) {
                    Thread.sleep(1000)
                    continue
                }
                val payload = JSObject()
                payload.put("app_name", context.appName)
                payload.put("window_title", context.windowTitle)
                payload.put("url", context.url)
                payload.put("device_type", "mobile")
                val serialized = "${context.appName}|${context.windowTitle}|${context.url}"
                if (serialized != lastSerialized) {
                    trigger("window-context-changed", payload)
                    lastSerialized = serialized
                }
                Thread.sleep(1000)
            }
        }.apply { start() }
    }

    private fun isAccessibilityEnabled(context: Context): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val services = am.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        )
        return services.any { info ->
            info.id.lowercase().contains("chronoaccessibilityservice")
        }
    }

    companion object {
        @Volatile
        private var instanceRef: WeakReference<TrackingPlugin>? = null

        fun emitNotificationAction(action: String) {
            val plugin = instanceRef?.get() ?: return
            val payload = JSObject()
            payload.put("action", action)
            plugin.trigger("notification-action", payload)
        }
    }
}
