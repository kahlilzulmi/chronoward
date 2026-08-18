package com.chronoward.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PreAlertReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra(PreAlertAlarms.EXTRA_TITLE) ?: "Chronoward"
        val body = intent.getStringExtra(PreAlertAlarms.EXTRA_BODY)
            ?: "Session ends in 1 minute."
        PreAlertAlarms.notifyNow(context, title, body)
    }
}
