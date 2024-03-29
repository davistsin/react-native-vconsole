package com.reactnativevconsole

import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VconsoleModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "Vconsole"
    }

    @ReactMethod
    fun showDevOptionsDialog() {
        currentActivity?.apply {
            val reactApplication = application as ReactApplication
            reactApplication.reactNativeHost.reactInstanceManager.showDevOptionsDialog()
        }
    }

}
