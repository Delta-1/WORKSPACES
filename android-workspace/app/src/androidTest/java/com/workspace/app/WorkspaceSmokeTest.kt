package com.workspace.app

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import android.graphics.Bitmap

@RunWith(AndroidJUnit4::class)
class WorkspaceSmokeTest {
    @Test fun appStartsWithUsableNativeControlsAndRestrictedWebView() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            onView(withId(R.id.workspace_reload)).check(matches(isDisplayed()))
            onView(withId(R.id.workspace_menu)).check(matches(isDisplayed()))
            scenario.onActivity { activity ->
                val uri = Uri.parse(activity.getString(R.string.workspace_url))
                assertEquals("https", uri.scheme)
                assertTrue(activity.trusted(uri))
                assertFalse(activity.trusted(Uri.parse("http://${uri.host}")))
                assertFalse(activity.trusted(Uri.parse("https://${uri.host}.evil.example")))
                assertFalse(activity.trusted(Uri.parse("https://user@${uri.authority}")))
                assertFalse(activity.trusted(Uri.parse("file:///etc/passwd")))
                assertFalse(activity.trusted(Uri.parse("https://${uri.host}:444")))
                val web = activity.findViewById<WebView>(R.id.workspace_web)
                assertTrue(web.settings.javaScriptEnabled)
                assertTrue(web.settings.domStorageEnabled)
                assertFalse(web.settings.allowFileAccess)
                assertEquals(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW, web.settings.mixedContentMode)
                assertTrue(web.width > 0 && web.height > 0)
                // Merely starting the app must never request/grant microphone access.
                assertEquals(PackageManager.PERMISSION_DENIED, activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO))
            }
            onView(withId(R.id.workspace_menu)).perform(androidx.test.espresso.action.ViewActions.click())
            onView(withText("Sobre o aplicativo")).perform(androidx.test.espresso.action.ViewActions.click())
            onView(withText("Workspaces ${BuildConfig.VERSION_NAME}")).check(matches(isDisplayed()))
            onView(withText("OK")).perform(androidx.test.espresso.action.ViewActions.click())
            scenario.recreate()
            onView(withId(R.id.workspace_reload)).check(matches(isDisplayed()))
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            instrumentation.uiAutomation.takeScreenshot()?.let { image ->
                val output = File(instrumentation.targetContext.getExternalFilesDir(null), "android-smoke.png")
                output.outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
                image.recycle()
            }
        }
    }
}
