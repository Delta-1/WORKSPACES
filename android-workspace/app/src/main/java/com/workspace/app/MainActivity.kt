package com.workspace.app

import android.Manifest
import android.app.AlertDialog
import android.app.Dialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.print.PrintManager
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts

class MainActivity : ComponentActivity() {
 private lateinit var web: WebView
 private var origin = ""
 private var fileCallback: ValueCallback<Array<Uri>>? = null
 private var microphoneRequest: PermissionRequest? = null
 private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
  fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)); fileCallback = null
 }
 private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
  if (granted) microphoneRequest?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else microphoneRequest?.deny()
  microphoneRequest = null
 }
 private fun trusted(uri: Uri): Boolean = uri.scheme == "https" && "https://${uri.authority}" == origin
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  val prefs = getSharedPreferences("workspace", MODE_PRIVATE)
  val url = prefs.getString("url", null) ?: getString(com.workspace.app.R.string.workspace_url)
  if (url.isNullOrBlank()) { configure(); return }
  open(url)
 }
 private fun configure() {
  val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 48, 32, 32) }
  val title = TextView(this).apply { text = "Bem-vindo ao Workspace\nInforme o endereço HTTPS do site da sua empresa."; textSize = 20f }
  val input = EditText(this).apply { hint = "https://seu-workspace…"; inputType = android.text.InputType.TYPE_TEXT_VARIATION_URI }
  val button = Button(this).apply { text = "Abrir Workspace"; setOnClickListener {
   val uri = Uri.parse(input.text.toString().trim())
   if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.userInfo != null) { input.error = "Informe um endereço HTTPS válido"; return@setOnClickListener }
   val url = "https://${uri.authority}"; getSharedPreferences("workspace", MODE_PRIVATE).edit().putString("url", url).apply(); open(url)
  } }
  layout.addView(title);layout.addView(input);layout.addView(button);setContentView(layout)
 }
 private fun open(url: String) {
  val uri = Uri.parse(url); if (uri.scheme != "https" || uri.host.isNullOrBlank()) { configure();return }
  origin = "https://${uri.authority}"
  val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
  val toolbar = LinearLayout(this)
  val reload = Button(this).apply { text = "↻"; contentDescription = "Recarregar"; setOnClickListener { web.reload() } }
  val browser = Button(this).apply { text = "Navegador"; setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(origin))) } }
  val change = Button(this).apply { text = "Endereço"; setOnClickListener { getSharedPreferences("workspace", MODE_PRIVATE).edit().remove("url").apply();web.destroy();configure() } }
  toolbar.addView(reload);toolbar.addView(browser);toolbar.addView(change);layout.addView(toolbar)
  web = WebView(this);setup(web);layout.addView(web, LinearLayout.LayoutParams(-1,0,1f));setContentView(layout);web.loadUrl(origin)
  onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) { override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() } })
 }
 private fun setup(view: WebView) {
  view.settings.apply { javaScriptEnabled = true; domStorageEnabled = true; allowFileAccess = false; allowContentAccess = true; setSupportMultipleWindows(true); javaScriptCanOpenWindowsAutomatically = true; mediaPlaybackRequiresUserGesture = true }
  CookieManager.getInstance().setAcceptCookie(true)
  view.webViewClient = object : WebViewClient() {
   override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
    if (trusted(req.url)) return false
    if (req.url.scheme in listOf("https","http","tel","mailto")) { runCatching { startActivity(Intent(Intent.ACTION_VIEW,req.url)) }; return true }
    return true
   }
   override fun onReceivedError(view: WebView, req: WebResourceRequest, error: WebResourceError) { if (req.isForMainFrame) Toast.makeText(this@MainActivity,"Verifique sua conexão e toque em recarregar",Toast.LENGTH_LONG).show() }
  }
  view.webChromeClient = object : WebChromeClient() {
   override fun onPermissionRequest(request: PermissionRequest) {
    runOnUiThread { if (!trusted(request.origin) || !request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { request.deny();return@runOnUiThread };microphoneRequest?.deny();microphoneRequest=request;microphone.launch(Manifest.permission.RECORD_AUDIO) }
   }
   override fun onPermissionRequestCanceled(request: PermissionRequest) { if (microphoneRequest===request) microphoneRequest=null }
   override fun onShowFileChooser(v: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
    fileCallback?.onReceiveValue(null);fileCallback=callback
    return try { filePicker.launch(params.createIntent());true } catch (_: Exception) { fileCallback?.onReceiveValue(null);fileCallback=null;false }
   }
   override fun onJsAlert(v: WebView, url: String, message: String, result: JsResult): Boolean { AlertDialog.Builder(this@MainActivity).setMessage(message).setPositiveButton("OK") { _,_ -> result.confirm() }.setOnCancelListener { result.cancel() }.show();return true }
   override fun onJsConfirm(v: WebView, url: String, message: String, result: JsResult): Boolean { AlertDialog.Builder(this@MainActivity).setMessage(message).setPositiveButton("Confirmar") { _,_ -> result.confirm() }.setNegativeButton("Cancelar") { _,_ -> result.cancel() }.setOnCancelListener { result.cancel() }.show();return true }
   override fun onCreateWindow(v: WebView, isDialog: Boolean, userGesture: Boolean, message: Message): Boolean {
    if (!userGesture) return false
    val popup = WebView(this@MainActivity);setup(popup)
    val dialog = Dialog(this@MainActivity);val layout = LinearLayout(this@MainActivity).apply { orientation=LinearLayout.VERTICAL }
    val print = Button(this@MainActivity).apply { text="Imprimir / salvar PDF";setOnClickListener { (getSystemService(PRINT_SERVICE) as PrintManager).print("Relatório Workspace",popup.createPrintDocumentAdapter("Workspace"),null) } }
    layout.addView(print);layout.addView(popup,LinearLayout.LayoutParams(-1,0,1f));dialog.setContentView(layout);dialog.setOnDismissListener { popup.destroy() };dialog.show();dialog.window?.setLayout(-1,-1)
    (message.obj as WebView.WebViewTransport).webView=popup;message.sendToTarget();return true
   }
  }
  view.setDownloadListener { url,_,_,_,_ -> if (url.startsWith("https://")) runCatching { startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url))) } }
 }
 override fun onDestroy() { fileCallback?.onReceiveValue(null);microphoneRequest?.deny();if (::web.isInitialized) web.destroy();super.onDestroy() }
}
