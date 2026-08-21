package com.chronoward.tracking

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Base64
import android.view.accessibility.AccessibilityManager
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import org.json.JSONObject
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

@InvokeArg
class GoogleSignInArgs {
    var serverClientId: String = ""
    var androidClientId: String = ""
}

@InvokeArg
class DriveUploadArgs {
    var contents: String = ""
}

@TauriPlugin
class TrackingPlugin(private val activity: Activity) : Plugin(activity) {
    private var isPolling = false
    private var pollingThread: Thread? = null
    private var pendingGoogleServerClientId: String = ""

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

    @Command
    fun googleSignIn(invoke: Invoke) {
        val args = invoke.parseArgs(GoogleSignInArgs::class.java)
        val serverClientId = args.serverClientId.trim()
        if (serverClientId.isEmpty()) {
            invoke.reject("Missing serverClientId. Add a Web OAuth client as webClientId in google-oauth.json.")
            return
        }
        pendingGoogleServerClientId = serverClientId
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(serverClientId)
            .requestEmail()
            .requestScopes(Scope("https://www.googleapis.com/auth/drive.appdata"))
            .build()
        val client = GoogleSignIn.getClient(activity, gso)
        startActivityForResult(invoke, client.signInIntent, "handleGoogleSignIn")
    }

    @ActivityCallback
    private fun handleGoogleSignIn(invoke: Invoke, result: ActivityResult) {
        try {
            val account = GoogleSignIn.getSignedInAccountFromIntent(result.data)
                .getResult(ApiException::class.java)
            val idToken = account.idToken
                ?: throw IllegalStateException(
                    "Google did not return an ID token. Create a Web application OAuth client and set webClientId in google-oauth.json."
                )
            val claims = parseIdToken(idToken)
            val sub = claims.optString("sub").trim()
            if (sub.isEmpty()) {
                invoke.reject("ID token is missing sub.")
                return
            }
            val iss = claims.optString("iss")
            if (iss != "https://accounts.google.com" && iss != "accounts.google.com") {
                invoke.reject("Unexpected ID token issuer: $iss")
                return
            }
            val aud = claims.optString("aud")
            if (pendingGoogleServerClientId.isNotEmpty() && aud.isNotEmpty() && aud != pendingGoogleServerClientId) {
                invoke.reject("ID token audience does not match serverClientId.")
                return
            }
            val payload = JSObject()
            payload.put("sub", sub)
            val email = claims.optString("email").ifBlank { account.email ?: "" }
            if (email.isNotBlank()) {
                payload.put("email", email)
            }
            invoke.resolve(payload)
        } catch (error: ApiException) {
            if (error.statusCode == 12501) {
                invoke.reject("Google sign-in was cancelled.")
            } else {
                invoke.reject("Google sign-in failed (${error.statusCode}): ${error.message}")
            }
        } catch (error: Exception) {
            invoke.reject(error.message ?: "Google sign-in failed.")
        }
    }

    @Command
    fun driveAppdataDownload(invoke: Invoke) {
        Thread {
            try {
                val payload = JSObject()
                payload.put("contents", DriveAppData.download(activity))
                invoke.resolve(payload)
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Drive download failed.")
            }
        }.start()
    }

    @Command
    fun driveAppdataUpload(invoke: Invoke) {
        val args = invoke.parseArgs(DriveUploadArgs::class.java)
        Thread {
            try {
                DriveAppData.upload(activity, args.contents)
                invoke.resolve()
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Drive upload failed.")
            }
        }.start()
    }

    private fun parseIdToken(idToken: String): JSONObject {
        val parts = idToken.split(".")
        if (parts.size < 2) {
            throw IllegalStateException("ID token is not a JWT.")
        }
        val decoded = Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        return JSONObject(String(decoded, Charsets.UTF_8))
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
