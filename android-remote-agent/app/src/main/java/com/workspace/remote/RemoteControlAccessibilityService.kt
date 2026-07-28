package com.workspace.remote

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ComponentName
import android.content.Context
import android.graphics.Path
import android.os.Bundle
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class RemoteControlAccessibilityService : AccessibilityService() {
    companion object {
        @Volatile private var instance: RemoteControlAccessibilityService? = null

        fun isEnabled(context: Context): Boolean {
            val expected = ComponentName(context, RemoteControlAccessibilityService::class.java).flattenToString()
            return Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
                ?.split(':')?.any { it.equals(expected, ignoreCase = true) } == true
        }

        suspend fun tap(x: Float, y: Float, double: Boolean = false): Boolean {
            val service = instance ?: return false
            val first = service.gesture(x, y, x, y, 80)
            if (!first || !double) return first
            kotlinx.coroutines.delay(110)
            return service.gesture(x, y, x, y, 80)
        }

        suspend fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, duration: Long = 420): Boolean =
            instance?.gesture(x1, y1, x2, y2, duration) ?: false

        fun setText(text: String): Boolean {
            val service = instance ?: return false
            val focused = service.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
            val current = focused.text?.toString().orEmpty()
            return focused.performAction(
                AccessibilityNodeInfo.ACTION_SET_TEXT,
                Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, current + text)
                }
            )
        }

        fun global(name: String): Boolean {
            val action = when (name.lowercase()) {
                "back", "backspace", "esc" -> GLOBAL_ACTION_BACK
                "home", "win" -> GLOBAL_ACTION_HOME
                "recent", "recents", "taskmanager" -> GLOBAL_ACTION_RECENTS
                "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
                "quick-settings" -> GLOBAL_ACTION_QUICK_SETTINGS
                else -> return false
            }
            return instance?.performGlobalAction(action) == true
        }
    }

    override fun onServiceConnected() { instance = this }
    override fun onDestroy() { if (instance === this) instance = null; super.onDestroy() }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit

    private suspend fun gesture(x1: Float, y1: Float, x2: Float, y2: Float, duration: Long): Boolean =
        suspendCancellableCoroutine { continuation ->
            val path = Path().apply {
                moveTo(x1, y1)
                if (x1 != x2 || y1 != y2) lineTo(x2, y2)
            }
            val description = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, duration.coerceAtLeast(1))).build()
            val dispatched = dispatchGesture(description, object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    if (continuation.isActive) continuation.resume(true)
                }
                override fun onCancelled(gestureDescription: GestureDescription?) {
                    if (continuation.isActive) continuation.resume(false)
                }
            }, null)
            if (!dispatched && continuation.isActive) continuation.resume(false)
        }
}
