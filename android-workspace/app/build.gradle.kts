import java.net.URI

plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

val workspaceUrl = providers.environmentVariable("WORKSPACE_APP_URL")
    .orNull?.takeIf { it.isNotBlank() } ?: "https://workspaces-eta.vercel.app/atendimento"
val appUri = URI(workspaceUrl)
require(appUri.scheme == "https" && !appUri.host.isNullOrBlank() && appUri.userInfo == null) {
    "WORKSPACE_APP_URL deve ser um endereço HTTPS válido, sem credenciais."
}
val releaseStore = providers.environmentVariable("WORKSPACE_KEYSTORE_PATH").orNull
val signingRequested = releaseStore != null
fun requiredSecret(name: String) = providers.environmentVariable(name).orNull
    ?.takeIf { it.isNotBlank() } ?: error("Assinatura incompleta: configure $name")

android {
    namespace = "com.workspace.app"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.workspace.app"
        minSdk = 26
        targetSdk = 36
        versionCode = providers.environmentVariable("WORKSPACE_BUILD_NUMBER").orElse("1").get().toInt()
        versionName = providers.environmentVariable("WORKSPACE_VERSION_NAME").orElse("1.1.0").get()
        resValue("string", "workspace_url", workspaceUrl.replace("&", "&amp;").replace("'", "\\'"))
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        if (signingRequested) create("upload") {
            storeFile = file(releaseStore!!)
            storePassword = requiredSecret("WORKSPACE_KEYSTORE_PASSWORD")
            keyAlias = requiredSecret("WORKSPACE_KEY_ALIAS")
            keyPassword = requiredSecret("WORKSPACE_KEY_PASSWORD")
        }
    }
    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-teste"
            resValue("string", "app_name", "Workspaces Teste")
        }
        release {
            isDebuggable = false
            if (signingRequested) signingConfig = signingConfigs.getByName("upload")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    lint { abortOnError = true }
}
dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.12.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
