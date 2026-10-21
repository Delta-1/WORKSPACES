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
import android.os.SystemClock
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

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
            // A launched Activity alone is insufficient: wait for a usable login
            // page, or the explicit update instruction on old emulator WebViews.
            val provider = android.webkit.WebView.getCurrentWebViewPackage()
            val major = provider?.versionName?.substringBefore('.')?.toIntOrNull() ?: 0
            println("WebView provider: ${provider?.packageName} ${provider?.versionName}")
            if (major in 1..110) {
                onView(withText("Atualizar WebView")).check(matches(isDisplayed()))
            } else {
                awaitLogin(scenario)
            }
            onView(withId(R.id.workspace_reload)).check(matches(isDisplayed()))
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            instrumentation.uiAutomation.takeScreenshot()?.let { image ->
                val output = File(instrumentation.targetContext.getExternalFilesDir(null), "android-smoke.png")
                output.outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
                image.recycle()
            }
        }
    }
    private fun awaitLogin(scenario: ActivityScenario<MainActivity>) {
        val deadline = SystemClock.elapsedRealtime() + 60000
        var lastState = ""
        while (SystemClock.elapsedRealtime() < deadline) {
            val latch = CountDownLatch(1)
            var ready = false
            scenario.onActivity { activity ->
                activity.findViewById<WebView>(R.id.workspace_web).evaluateJavascript(
                    "JSON.stringify({ready:!!(document.querySelector('input[type=email]')&&document.querySelector('input[type=password]')),url:location.href,state:document.readyState,text:document.body?document.body.innerText.slice(0,300):''})"
                ) { raw ->
                    lastState = raw
                    // evaluateJavascript returns a JSON-encoded JSON string.
                    val decoded = org.json.JSONTokener(raw).nextValue() as? String
                    ready = decoded?.let { org.json.JSONObject(it).optBoolean("ready") } ?: false
                    latch.countDown()
                }
            }
            latch.await(3, TimeUnit.SECONDS)
            if (ready) { println("Workspaces login rendered after Activity recreation"); return }
            SystemClock.sleep(500)
        }
        fail("Tela de login não carregou em 60 segundos. Estado: $lastState")
    }
}
