package com.workspace.remote

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.roundToInt

class RemoteSessionService : Service() {
    companion object {
        const val ACTION_START = "com.workspace.remote.START"
        const val ACTION_STOP = "com.workspace.remote.STOP"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val EXTRA_AGENT_ID = "agent_id"
        const val EXTRA_ACCESS_CODE = "access_code"
        private const val CHANNEL_ID = "workspace_remote_session"
        private const val NOTIFICATION_ID = 5401
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var api: SupabaseApi
    private lateinit var files: FileTreeManager
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var imageThread: HandlerThread? = null
    private var loops: Job? = null
    private var agentId = ""
    private var accessCode = ""
    private var realWidth = 1
    private var realHeight = 1
    private val latestFrame = AtomicReference<ByteArray?>(null)
    private val latestPreview = AtomicReference<ByteArray?>(null)
    private val stopping = AtomicBoolean(false)
    private var lastEncodedAt = 0L

    override fun onCreate() {
        super.onCreate()
        api = SupabaseApi(this)
        files = FileTreeManager(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSession(); return START_NOT_STICKY }
        if (intent?.action != ACTION_START) return START_NOT_STICKY
        agentId = intent.getStringExtra(EXTRA_AGENT_ID).orEmpty()
        accessCode = intent.getStringExtra(EXTRA_ACCESS_CODE).orEmpty()
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
        val resultData = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
            else @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_RESULT_DATA)
        if (agentId.isBlank() || accessCode.isBlank() || resultCode != Activity.RESULT_OK || resultData == null) {
            stopSelf(); return START_NOT_STICKY
        }
        startVisibleForeground()
        startProjection(resultCode, resultData)
        startLoops()
        getSharedPreferences("workspace_remote", MODE_PRIVATE).edit().putBoolean("session_requested", true).apply()
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startVisibleForeground() {
        val openIntent = PendingIntent.getActivity(
            this, 1, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this, 2, Intent(this, RemoteSessionService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setContentIntent(openIntent).setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(0, getString(R.string.stop), stopIntent).build()
        val types = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, types)
    }

    private fun startProjection(resultCode: Int, data: Intent) {
        val mediaProjection = getSystemService(MediaProjectionManager::class.java).getMediaProjection(resultCode, data)
        projection = mediaProjection
        mediaProjection.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { stopSession() }
        }, Handler(mainLooper))

        val bounds = if (Build.VERSION.SDK_INT >= 30) getSystemService(WindowManager::class.java).maximumWindowMetrics.bounds
        else @Suppress("DEPRECATION") DisplayMetrics().also {
            getSystemService(WindowManager::class.java).defaultDisplay.getRealMetrics(it)
        }.let { android.graphics.Rect(0, 0, it.widthPixels, it.heightPixels) }
        realWidth = bounds.width().coerceAtLeast(1)
        realHeight = bounds.height().coerceAtLeast(1)
        val captureWidth = realWidth.coerceAtMost(1440)
        val captureHeight = (realHeight * (captureWidth.toFloat() / realWidth)).roundToInt().coerceAtLeast(1)
        val density = resources.configuration.densityDpi

        imageThread = HandlerThread("workspace-screen-capture").also { it.start() }
        imageReader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2).also { reader ->
            reader.setOnImageAvailableListener({ source ->
                val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
                try {
                    val now = android.os.SystemClock.elapsedRealtime()
                    if (now - lastEncodedAt < 400) return@setOnImageAvailableListener
                    lastEncodedAt = now
                    val plane = image.planes[0]
                    val paddedWidth = image.width + (plane.rowStride - plane.pixelStride * image.width) / plane.pixelStride
                    val padded = Bitmap.createBitmap(paddedWidth, image.height, Bitmap.Config.ARGB_8888)
                    padded.copyPixelsFromBuffer(plane.buffer)
                    val cropped = Bitmap.createBitmap(padded, 0, 0, image.width, image.height)
                    val fullOutput = ByteArrayOutputStream()
                    cropped.compress(Bitmap.CompressFormat.JPEG, 84, fullOutput)
                    latestFrame.set(fullOutput.toByteArray())
                    val preview = if (cropped.width > 720) Bitmap.createScaledBitmap(
                        cropped, 720, (cropped.height * (720f / cropped.width)).roundToInt(), true
                    ) else cropped
                    val previewOutput = ByteArrayOutputStream()
                    preview.compress(Bitmap.CompressFormat.JPEG, 58, previewOutput)
                    latestPreview.set(previewOutput.toByteArray())
                    if (preview !== cropped) preview.recycle()
                    cropped.recycle()
                    padded.recycle()
                } finally { image.close() }
            }, Handler(imageThread!!.looper))
        }
        virtualDisplay = mediaProjection.createVirtualDisplay(
            "WorkspaceRemote", captureWidth, captureHeight, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, imageReader!!.surface, null, null
        )
    }

    private fun startLoops() {
        loops?.cancel()
        loops = scope.launch {
            launch { while (isActive) { runCatching { api.heartbeat(agentId, accessCode) }; delay(20_000) } }
            launch {
                runCatching {
                    api.reportSpecs(
                        agentId, accessCode,
                        JSONObject().put("platform", "android").put("osName", "Android ${Build.VERSION.RELEASE}")
                            .put("hostname", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                            .put("arch", Build.SUPPORTED_ABIS.firstOrNull() ?: "Android")
                            .put("screenWidth", realWidth).put("screenHeight", realHeight)
                            .put("reportedAt", java.time.Instant.now().toString())
                    )
                }
                while (isActive) delay(300_000)
            }
            launch {
                while (isActive) {
                    latestPreview.get()?.let { runCatching { api.upload("agent-thumbs", "$agentId.jpg", it, "image/jpeg") } }
                    delay(2_000)
                }
            }
            launch {
                while (isActive) {
                    runCatching { api.pendingJobs(accessCode) }.onSuccess { jobs -> jobs.forEach { handleJob(it) } }
                    delay(1_300)
                }
            }
        }
    }

    private suspend fun handleJob(job: AgentJob) {
        when (job.kind) {
            "screenshot" -> {
                val frame = latestFrame.get()
                if (frame == null) api.completeJob(accessCode, job.id, error = "A tela ainda não produziu uma imagem.")
                else {
                    val path = "shots/$agentId-${System.currentTimeMillis()}.jpg"
                    api.completeJob(accessCode, job.id, resultUrl = api.upload("agent-thumbs", path, frame, "image/jpeg"))
                }
            }
            "input" -> api.completeJob(accessCode, job.id, error = runCatching { executeInput(job.params) }.exceptionOrNull()?.message)
            "android_file" -> {
                val error = runCatching { executeFileJob(job) }.exceptionOrNull()?.message
                if (error != null) api.completeJob(accessCode, job.id, error = error.take(220))
            }
            else -> api.completeJob(accessCode, job.id, error = "Ação não suportada no Android.")
        }
    }

    private suspend fun executeInput(params: JSONObject) {
        if (!RemoteControlAccessibilityService.isEnabled(this)) error("Ative o controle por Acessibilidade no celular.")
        val action = params.optString("action")
        val x = (params.optDouble("x", .5).coerceIn(0.0, 1.0) * realWidth).toFloat()
        val y = (params.optDouble("y", .5).coerceIn(0.0, 1.0) * realHeight).toFloat()
        when (action) {
            "clickat", "click" -> require(RemoteControlAccessibilityService.tap(x, y)) { "O toque não pôde ser executado." }
            "doubleclickat" -> require(RemoteControlAccessibilityService.tap(x, y, true)) { "O duplo toque não pôde ser executado." }
            "swipe" -> require(RemoteControlAccessibilityService.swipe(
                x, y,
                (params.optDouble("x2", .5).coerceIn(0.0, 1.0) * realWidth).toFloat(),
                (params.optDouble("y2", .5).coerceIn(0.0, 1.0) * realHeight).toFloat()
            )) { "O gesto não pôde ser executado." }
            "type" -> require(RemoteControlAccessibilityService.setText(params.optString("text"))) { "Nenhum campo de texto está selecionado." }
            "key" -> require(RemoteControlAccessibilityService.global(params.optString("name"))) { "Tecla não suportada no Android." }
            "open" -> openTarget(params.optString("text").ifBlank { params.optString("name") })
            else -> error("Ação desconhecida: $action")
        }
    }

    private fun openTarget(target: String) {
        val clean = target.trim()
        if (clean.startsWith("https://") || clean.startsWith("http://")) {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(clean)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return
        }
        val normalized = clean.lowercase()
        val packageName = when {
            "chrome" in normalized || "google" in normalized -> "com.android.chrome"
            "youtube" in normalized -> "com.google.android.youtube"
            "whatsapp" in normalized -> "com.whatsapp"
            "config" in normalized || "settings" in normalized -> "com.android.settings"
            else -> null
        }
        val launch = packageName?.let { packageManager.getLaunchIntentForPackage(it) }
            ?: error("Aplicativo não encontrado ou não permitido.")
        startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private suspend fun executeFileJob(job: AgentJob) {
        when (job.params.optString("action")) {
            "list" -> {
                val result = files.list(job.params.optString("path"))
                val path = "android-jobs/${job.id}.json"
                api.completeJob(accessCode, job.id, resultUrl = api.upload(
                    "agent-thumbs", path, result.toString().toByteArray(), "application/json"
                ))
            }
            "mkdir" -> { files.mkdir(job.params.optString("path"), job.params.optString("name")); api.completeJob(accessCode, job.id) }
            "rename" -> { files.rename(job.params.optString("path"), job.params.optString("name")); api.completeJob(accessCode, job.id) }
            "delete" -> { files.delete(job.params.optString("path")); api.completeJob(accessCode, job.id) }
            else -> error("Operação de arquivo não suportada.")
        }
    }

    private fun stopSession() {
        if (!stopping.compareAndSet(false, true)) return
        getSharedPreferences("workspace_remote", MODE_PRIVATE).edit().putBoolean("session_requested", false).apply()
        loops?.cancel(); loops = null
        runCatching { virtualDisplay?.release() }; virtualDisplay = null
        runCatching { imageReader?.close() }; imageReader = null
        runCatching { projection?.stop() }; projection = null
        imageThread?.quitSafely(); imageThread = null
        latestFrame.set(null); latestPreview.set(null)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() { if (!stopping.get()) stopSession(); scope.cancel(); super.onDestroy() }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val channel = NotificationChannel(CHANNEL_ID, getString(R.string.notification_channel), NotificationManager.IMPORTANCE_LOW)
        channel.description = "Mostra quando o celular está disponível para acesso remoto."
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
