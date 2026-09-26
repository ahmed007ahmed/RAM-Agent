plugins { id("com.android.application") }
android {
    namespace = "com.ram.agent"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.ram.agent"
        minSdk = 23
        targetSdk = 35
        versionCode = 5
        versionName = "1.4"
    }
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("RAM_KEYSTORE_FILE") ?: "ram-release.jks")
            storePassword = System.getenv("RAM_KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("RAM_KEY_ALIAS") ?: ""
            keyPassword = System.getenv("RAM_KEY_PASSWORD") ?: ""
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
dependencies { }
