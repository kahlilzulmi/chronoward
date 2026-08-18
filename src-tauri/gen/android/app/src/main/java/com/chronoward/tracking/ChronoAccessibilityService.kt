package com.chronoward.tracking

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class ChronoAccessibilityService : AccessibilityService() {
    private val browserPackages = setOf(
        "com.android.chrome",
        "org.mozilla.firefox",
        "com.sec.android.app.sbrowser",
        "com.microsoft.emmx",
        "com.brave.browser",
    )

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val packageName = event?.packageName?.toString() ?: return
        if (!browserPackages.contains(packageName)) {
            return
        }

        val root = rootInActiveWindow ?: return
        val extracted = findLikelyUrl(root)
        val title = event.text?.joinToString(" ")?.trim().orEmpty()
        TrackingManager.updateFromAccessibility(extracted, title)
    }

    override fun onInterrupt() {
        // no-op
    }

    private fun findLikelyUrl(node: AccessibilityNodeInfo): String? {
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(node)

        while (queue.isNotEmpty()) {
            val current = queue.removeFirst()
            val text = current.text?.toString()?.trim().orEmpty()
            val hint = current.hintText?.toString()?.trim().orEmpty()
            val viewId = current.viewIdResourceName?.lowercase().orEmpty()
            val label = (text + " " + hint).lowercase()

            val looksLikeAddressBar =
                current.className?.contains("EditText") == true &&
                    (viewId.contains("url") ||
                        viewId.contains("address") ||
                        label.contains("search or type") ||
                        label.contains("address"))
            if (looksLikeAddressBar && text.isNotBlank()) {
                return text
            }
            if (looksLikeUrl(text)) {
                return text
            }

            for (i in 0 until current.childCount) {
                current.getChild(i)?.let { queue.add(it) }
            }
        }

        return null
    }

    private fun looksLikeUrl(value: String): Boolean {
        if (value.isBlank()) return false
        val lowered = value.lowercase()
        return lowered.startsWith("http://") ||
            lowered.startsWith("https://") ||
            lowered.startsWith("www.") ||
            (lowered.contains(".") && !lowered.contains(" "))
    }
}
