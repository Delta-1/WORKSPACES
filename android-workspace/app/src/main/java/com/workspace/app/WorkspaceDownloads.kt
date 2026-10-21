package com.workspace.app

import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/** Receives only main-frame messages from the exact app origin. No global JS interface. */
class WorkspaceDownloads(private val activity: ComponentActivity, private val origin: String) {
    private var pending: ByteArray? = null
    private var closed = false
    private val save = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val bytes = pending; pending = null
        val uri = result.data?.data
        if (result.resultCode == android.app.Activity.RESULT_OK && uri != null && bytes != null) {
            Thread {
                val saved = runCatching { activity.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    ?: error("Não foi possível abrir o destino") }.isSuccess
                activity.runOnUiThread { if (!closed) toast(if (saved) "Arquivo salvo" else "Não foi possível salvar o arquivo") }
            }.start()
        }
    }
    fun attach(web: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(web, "WorkspacesDownloads", setOf(origin)) { _, message, sourceOrigin, mainFrame, _ ->
            if (!mainFrame || sourceOrigin.scheme != "https" || sourceOrigin.authority != Uri.parse(origin).authority || closed) return@addWebMessageListener
            if (pending != null) { toast("Conclua o salvamento atual primeiro"); return@addWebMessageListener }
            runCatching {
                val raw = message.data ?: error("Arquivo vazio")
                require(raw.length <= 23 * 1024 * 1024)
                val payload = JSONObject(raw)
                val data = payload.getString("data")
                require(data.startsWith("data:") && data.indexOf(";base64,") in 5..200)
                val bytes = Base64.decode(data.substringAfter(";base64,"), Base64.DEFAULT)
                require(bytes.size <= 16 * 1024 * 1024)
                val name = payload.optString("name", "arquivo").substringAfterLast('/').substringAfterLast('\\')
                    .replace(Regex("[\\p{Cntrl}]"), "_").take(160).ifBlank { "arquivo" }
                val mime = data.substringAfter("data:").substringBefore(';')
                    .takeIf { it.matches(Regex("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")) } ?: "application/octet-stream"
                pending = bytes
                save.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE); type = mime; putExtra(Intent.EXTRA_TITLE, name)
                })
            }.onFailure { pending = null; toast("Não foi possível salvar. Limite de 16 MB; tente pelo navegador para arquivos maiores.") }
        }
    }
    fun installBlobHandler(web: WebView) {
        web.evaluateJavascript("""
            (() => {
              if (window.__workspacesDownloads || !window.WorkspacesDownloads) return;
              window.__workspacesDownloads = true;
              document.addEventListener('click', async event => {
                const a = event.target instanceof Element ? event.target.closest('a[download]') : null;
                if (!a || !a.href.startsWith('blob:')) return;
                event.preventDefault();
                try {
                  const blob = await (await fetch(a.href)).blob();
                  if (blob.size > 16 * 1024 * 1024) throw Error('Arquivo maior que 16 MB. Abra no navegador para baixar.');
                  const reader = new FileReader();
                  reader.onload = () => WorkspacesDownloads.postMessage(JSON.stringify({name:a.download || 'arquivo',data:reader.result}));
                  reader.onerror = () => alert('Não foi possível ler o arquivo. Tente novamente.');
                  reader.readAsDataURL(blob);
                } catch (error) { alert(error.message || 'Não foi possível baixar o arquivo.'); }
              }, true);
            })();
        """.trimIndent(), null)
    }
    private fun toast(text: String) { Toast.makeText(activity, text, Toast.LENGTH_LONG).show() }
    fun close() { closed = true; pending = null }
}
