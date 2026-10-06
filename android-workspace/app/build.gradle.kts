plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
val workspaceUrl = providers.environmentVariable("WORKSPACE_APP_URL").orElse("").get()
android {
 namespace = "com.workspace.app"
 compileSdk = 35
 defaultConfig {
  applicationId = "com.workspace.app"
  minSdk = 26
  targetSdk = 35
  versionCode = providers.environmentVariable("WORKSPACE_BUILD_NUMBER").orElse("1").get().toInt()
  versionName = "1.0.0"
  resValue("string", "workspace_url", workspaceUrl)
 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
dependencies { implementation("androidx.activity:activity-ktx:1.9.3") }
