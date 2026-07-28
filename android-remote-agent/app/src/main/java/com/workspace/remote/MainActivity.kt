package com.workspace.remote

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.workspace.remote.databinding.ActivityMainBinding
import kotlinx.coroutines.launch
import java.security.MessageDigest
import kotlin.math.absoluteValue

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var api: SupabaseApi
    private val prefs by lazy { getSharedPreferences("workspace_remote", MODE_PRIVATE) }
    private val accessCode by lazy { stableAccessCode() }

    private val projectionLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            setStatus("Compartilhamento cancelado.")
            return@registerForActivityResult
        }
        val agentId = prefs.getString("agent_id", null)
        if (agentId.isNullOrBlank()) {
            setStatus("Aguarde o código ser registrado e tente novamente.")
            return@registerForActivityResult
        }
        val service = Intent(this, RemoteSessionService::class.java)
            .setAction(RemoteSessionService.ACTION_START)
            .putExtra(RemoteSessionService.EXTRA_RESULT_CODE, result.resultCode)
            .putExtra(RemoteSessionService.EXTRA_RESULT_DATA, result.data)
            .putExtra(RemoteSessionService.EXTRA_AGENT_ID, agentId)
            .putExtra(RemoteSessionService.EXTRA_ACCESS_CODE, accessCode)
        ContextCompat.startForegroundService(this, service)
        prefs.edit().putBoolean("session_requested", true).apply()
        setStatus("Sessão iniciada. A notificação ficará visível.")
        binding.shareButton.text = "Encerrar compartilhamento"
    }

    private val folderLauncher = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri == null) return@registerForActivityResult
        contentResolver.takePersistableUriPermission(
            uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        )
        prefs.edit().putString("shared_tree_uri", uri.toString()).apply()
        updateFolderLabel()
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        api = SupabaseApi(this)
        binding.accessCode.text = accessCode.chunked(3).joinToString(" ")

        binding.accessCode.setOnClickListener {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("Código Workspace", accessCode))
            setStatus("Código copiado.")
        }
        binding.shareButton.setOnClickListener {
            if (prefs.getBoolean("session_requested", false)) stopSession() else requestProjection()
        }
        binding.controlButton.setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        binding.folderButton.setOnClickListener { folderLauncher.launch(null) }

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        updateFolderLabel()
        registerAgent()
    }

    override fun onResume() {
        super.onResume()
        binding.shareButton.text =
            if (prefs.getBoolean("session_requested", false)) "Encerrar compartilhamento" else "Compartilhar tela"
        binding.controlButton.text =
            if (RemoteControlAccessibilityService.isEnabled(this)) "Controle por toque ativado" else "Ativar controle por toque"
    }

    private fun registerAgent() {
        lifecycleScope.launch {
            setStatus("Registrando este celular…")
            runCatching { api.register(accessCode, "${Build.MANUFACTURER} ${Build.MODEL}".trim()) }
                .onSuccess {
                    prefs.edit().putString("agent_id", it).apply()
                    setStatus("Pronto. Compartilhe a tela para ficar online.")
                }
                .onFailure { setStatus("Não consegui registrar: ${it.message?.take(140)}") }
        }
    }

    private fun requestProjection() {
        projectionLauncher.launch(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
    }

    private fun stopSession() {
        startService(Intent(this, RemoteSessionService::class.java).setAction(RemoteSessionService.ACTION_STOP))
        prefs.edit().putBoolean("session_requested", false).apply()
        binding.shareButton.text = "Compartilhar tela"
        setStatus("Acesso remoto encerrado.")
    }

    private fun updateFolderLabel() {
        val uri = prefs.getString("shared_tree_uri", null)
        binding.folderLabel.text = if (uri.isNullOrBlank()) "Nenhuma pasta compartilhada" else "Pasta autorizada: $uri"
    }

    private fun stableAccessCode(): String {
        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID).orEmpty()
        val seed = "$androidId|${Build.MANUFACTURER}|${Build.MODEL}|workspace-remote-android"
        val digest = MessageDigest.getInstance("SHA-256").digest(seed.toByteArray())
        var number = 0L
        for (index in 0 until 6) number = (number shl 8) or (digest[index].toLong() and 0xff)
        return (number.absoluteValue % 1_000_000_000L).toString().padStart(9, '0')
    }

    private fun setStatus(text: String) { binding.status.text = text }
}
