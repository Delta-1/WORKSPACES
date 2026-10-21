package com.workspace.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.Dialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.print.PrintManager
import android.view.Gravity
import android.view.View
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorPanel: LinearLayout
    private lateinit var downloads: WorkspaceDownloads
    private lateinit var origin: String
    private lateinit var startUrl: String
    private var lastUrl = ""
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var microphoneRequest: PermissionRequest? = null
    private var microphoneOwner: WebView? = null
    private val popups = mutableSetOf<Dialog>()

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }
    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = microphoneRequest
        if (granted && request != null && trusted(request.origin) && trusted(Uri.parse(microphoneOwner?.url ?: ""))) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else request?.deny()
        microphoneRequest = null
        microphoneOwner = null
    }

    internal fun trusted(uri: Uri): Boolean = uri.scheme == "https" && uri.userInfo == null &&
        uri.host == Uri.parse(origin).host && uri.port == Uri.parse(origin).port

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        startUrl = getString(R.string.workspace_url)
        val uri = Uri.parse(startUrl)
        origin = "https://${uri.authority}"
        downloads = WorkspaceDownloads(this, origin)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        val root = LinearLayout(this).apply {
            id = R.id.workspace_root
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(6, 10, 18))
        }
        // Android 15/16 draw behind system bars. Keep the WebView and its composer
        // inside the real usable area, including display cutouts and the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
            insets
        }
        val toolbar = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        toolbar.addView(TextView(this).apply {
            text = "Workspaces"; textSize = 16f; setTextColor(Color.WHITE)
            setPadding(dp(16), 0, 0, 0)
        }, LinearLayout.LayoutParams(0, dp(48), 1f))
        toolbar.addView(Button(this).apply {
            id = R.id.workspace_reload; text = "↻"; textSize = 22f
            contentDescription = "Recarregar atendimento"
            setOnClickListener { retry() }
        }, LinearLayout.LayoutParams(dp(52), dp(48)))
        toolbar.addView(Button(this).apply {
            id = R.id.workspace_menu; text = "⋮"; textSize = 22f
            contentDescription = "Opções do aplicativo"
            setOnClickListener { showMenu(it) }
        }, LinearLayout.LayoutParams(dp(52), dp(48)))
        root.addView(toolbar)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        root.addView(progress, LinearLayout.LayoutParams(-1, dp(3)))
        val frame = FrameLayout(this)
        web = WebView(this).apply { id = R.id.workspace_web; setBackgroundColor(Color.rgb(6, 10, 18)) }
        setup(web)
        frame.addView(web, FrameLayout.LayoutParams(-1, -1))
        errorPanel = LinearLayout(this).apply {
            id = R.id.workspace_error; orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER; setPadding(dp(24), dp(24), dp(24), dp(24))
            setBackgroundColor(Color.rgb(6, 10, 18)); visibility = View.GONE
            addView(TextView(this@MainActivity).apply {
                text = "Não foi possível abrir o atendimento.\nConfira sua conexão e tente novamente."
                textSize = 18f; gravity = Gravity.CENTER; setTextColor(Color.WHITE)
            })
            addView(Button(this@MainActivity).apply {
                text = "Tentar novamente"; minHeight = dp(48); setOnClickListener { retry() }
            })
        }
        frame.addView(errorPanel, FrameLayout.LayoutParams(-1, -1))
        root.addView(frame, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        ViewCompat.requestApplyInsets(root)
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(startUrl)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun retry() {
        errorPanel.visibility = View.GONE
        web.loadUrl(lastUrl.takeIf { trusted(Uri.parse(it)) } ?: startUrl)
    }
    private fun external(uri: Uri) {
        if (uri.scheme !in listOf("https", "http", "tel", "mailto")) return
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)) }
            .onFailure { Toast.makeText(this, "Nenhum aplicativo disponível para abrir este link", Toast.LENGTH_LONG).show() }
    }
    private fun showMenu(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add("Manual do funcionário").setOnMenuItemClickListener { web.loadUrl("$origin/ajuda/atendimento"); true }
            menu.add("Voltar ao atendimento").setOnMenuItemClickListener { web.loadUrl(startUrl); true }
            menu.add("Abrir no navegador").setOnMenuItemClickListener { external(Uri.parse(startUrl)); true }
            menu.add("Sobre o aplicativo").setOnMenuItemClickListener {
                AlertDialog.Builder(this@MainActivity).setTitle("Workspaces ${BuildConfig.VERSION_NAME}")
                    .setMessage("Atendimento da sua empresa.\nEntre com seu e-mail e senha do Workspaces. O aplicativo usa os mesmos dados e permissões do sistema.\n\nRequer internet. A sessão do navegador é separada.\n$origin")
                    .setPositiveButton("OK", null).show(); true
            }
            show()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setup(view: WebView) {
        view.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            allowFileAccess = false; allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(true); javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = true
            userAgentString += " WorkspacesAndroid/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false)
        downloads.attach(view)
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                if (trusted(req.url) || req.url.toString() == "about:blank") return false
                if (req.isForMainFrame) external(req.url)
                return true
            }
            override fun onPageStarted(v: WebView, url: String, favicon: Bitmap?) {
                if (v === web) {
                    if (trusted(Uri.parse(url))) lastUrl = url
                    errorPanel.visibility = View.GONE; progress.visibility = View.VISIBLE
                }
                if (microphoneOwner === v) { microphoneRequest?.deny(); microphoneRequest = null; microphoneOwner = null }
            }
            override fun onPageFinished(v: WebView, url: String) {
                CookieManager.getInstance().flush()
                if (v === web) progress.visibility = View.GONE
                if (trusted(Uri.parse(url))) downloads.installBlobHandler(v)
            }
            override fun onReceivedError(v: WebView, req: WebResourceRequest, error: WebResourceError) {
                if (v === web && req.isForMainFrame) showError()
            }
            override fun onReceivedHttpError(v: WebView, req: WebResourceRequest, response: WebResourceResponse) {
                if (v === web && req.isForMainFrame && response.statusCode >= 400) showError()
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(v: WebView, value: Int) { if (v === web) progress.progress = value }
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (!trusted(request.origin) || !trusted(Uri.parse(view.url ?: "")) ||
                        !request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        request.deny(); return@runOnUiThread
                    }
                    if (microphoneRequest != null) { request.deny(); return@runOnUiThread }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        microphoneRequest = request; microphoneOwner = view
                        microphone.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            }
            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (microphoneRequest === request) { microphoneRequest = null; microphoneOwner = null }
            }
            override fun onShowFileChooser(v: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                if (!trusted(Uri.parse(v.url ?: ""))) return false
                fileCallback?.onReceiveValue(null); fileCallback = callback
                return try { filePicker.launch(params.createIntent()); true }
                catch (_: Exception) { fileCallback?.onReceiveValue(null); fileCallback = null; false }
            }
            override fun onJsAlert(v: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message).setPositiveButton("OK") { _, _ -> result.confirm() }
                    .setOnCancelListener { result.cancel() }.show(); return true
            }
            override fun onJsConfirm(v: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message).setPositiveButton("Confirmar") { _, _ -> result.confirm() }
                    .setNegativeButton("Cancelar") { _, _ -> result.cancel() }.setOnCancelListener { result.cancel() }.show(); return true
            }
            override fun onCreateWindow(v: WebView, isDialog: Boolean, userGesture: Boolean, message: Message): Boolean {
                if (!userGesture || !trusted(Uri.parse(v.url ?: ""))) return false
                val popup = WebView(this@MainActivity).apply { tag = "popup" }; setup(popup)
                val dialog = Dialog(this@MainActivity)
                val layout = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.VERTICAL }
                layout.addView(Button(this@MainActivity).apply {
                    text = "Imprimir / salvar PDF"; minHeight = dp(48)
                    setOnClickListener { (getSystemService(PRINT_SERVICE) as PrintManager).print("Workspaces", popup.createPrintDocumentAdapter("Workspaces"), null) }
                })
                layout.addView(popup, LinearLayout.LayoutParams(-1, 0, 1f))
                dialog.setContentView(layout)
                dialog.setOnDismissListener { popups.remove(dialog); popup.destroy() }
                popups.add(dialog); dialog.show(); dialog.window?.setLayout(-1, -1)
                (message.obj as WebView.WebViewTransport).webView = popup; message.sendToTarget(); return true
            }
            override fun onCloseWindow(window: WebView) { popups.firstOrNull { it.findViewById<View>(android.R.id.content)?.findViewWithTag<WebView>("popup") === window }?.dismiss() }
        }
        view.setDownloadListener { url, _, _, _, _ ->
            if (url.startsWith("https://")) external(Uri.parse(url))
            else Toast.makeText(this, "Use o botão Baixar do anexo para salvar o arquivo", Toast.LENGTH_LONG).show()
        }
    }
    private fun showError() { progress.visibility = View.GONE; errorPanel.visibility = View.VISIBLE }
    override fun onSaveInstanceState(outState: Bundle) { web.saveState(outState); super.onSaveInstanceState(outState) }
    override fun onResume() { super.onResume(); if (::web.isInitialized) web.onResume() }
    override fun onPause() { if (::web.isInitialized) web.onPause(); CookieManager.getInstance().flush(); super.onPause() }
    override fun onDestroy() {
        fileCallback?.onReceiveValue(null); microphoneRequest?.deny()
        popups.toList().forEach { it.dismiss() }
        if (::downloads.isInitialized) downloads.close()
        if (::web.isInitialized) { web.stopLoading(); web.destroy() }
        super.onDestroy()
    }
}
