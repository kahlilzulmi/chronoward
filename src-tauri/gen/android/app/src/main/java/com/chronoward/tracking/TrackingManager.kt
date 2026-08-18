package com.chronoward.tracking

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import android.text.TextUtils

data class AndroidWindowContext(
    val appName: String,
    val windowTitle: String,
    val url: String,
)

object TrackingManager {
    private const val MAX_TRACK_WINDOW_MS = 15_000L
    private val browserPackages = setOf(
        "com.android.chrome",
        "org.mozilla.firefox",
        "com.sec.android.app.sbrowser",
        "com.microsoft.emmx",
        "com.brave.browser",
    )

    @Volatile
    private var latestUrl: String = ""

    @Volatile
    private var latestTitle: String = ""

    fun updateFromAccessibility(url: String?, title: String?) {
        if (!url.isNullOrBlank()) {
            latestUrl = url
        }
        if (!title.isNullOrBlank()) {
            latestTitle = title
        }
    }

    fun hasUsageAccess(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun currentContext(context: Context): AndroidWindowContext {
        val packageName = try {
            resolveForegroundPackage(context).orEmpty()
        } catch (_: Exception) {
            ""
        }
        val appName = resolveAppLabel(context, packageName)
        val title = latestTitle
        val url = if (browserPackages.contains(packageName)) latestUrl else ""
        return AndroidWindowContext(
            appName = appName,
            windowTitle = title,
            url = url,
        )
    }

    private fun resolveForegroundPackage(context: Context): String? {
        val usageStatsManager =
            context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val events = usageStatsManager.queryEvents(now - MAX_TRACK_WINDOW_MS, now)
        val event = UsageEvents.Event()
        var latestPackage: String? = null
        var latestTimestamp = 0L

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED &&
                event.timeStamp >= latestTimestamp
            ) {
                latestTimestamp = event.timeStamp
                latestPackage = event.packageName
            }
        }
        return latestPackage
    }

    private fun resolveAppLabel(context: Context, packageName: String): String {
        if (TextUtils.isEmpty(packageName)) {
            return "Unknown"
        }
        return try {
            val packageManager = context.packageManager
            val info = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationLabel(info).toString()
        } catch (_: Exception) {
            packageName
        }
    }
}
