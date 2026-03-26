package com.vconsole

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VconsoleModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String {
    return NAME
  }

  @ReactMethod
  fun getSystemInfo(promise: Promise) {
    try {
      val activityManager =
        reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memoryInfo = ActivityManager.MemoryInfo()
      activityManager.getMemoryInfo(memoryInfo)

      val map = Arguments.createMap()
      map.putString("manufacturer", Build.MANUFACTURER ?: "")
      map.putString("model", Build.MODEL ?: "")
      map.putString("osVersion", Build.VERSION.RELEASE ?: "")
      map.putDouble("totalMemory", memoryInfo.totalMem.toDouble())
      map.putDouble("availableMemory", memoryInfo.availMem.toDouble())

      try {
        val connectivityManager =
          reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(network)

        val networkType = when {
          capabilities == null -> "none"
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
          else -> "unknown"
        }

        map.putString("networkType", networkType)
        map.putString("isNetworkReachable", "${capabilities != null}")
      } catch (e: SecurityException) {
        Log.w(NAME, "[getSystemInfo] Missing ACCESS_NETWORK_STATE permission")
        map.putString("networkType", "unknown")
        map.putString("isNetworkReachable", "unknown")
      } catch (e: Exception) {
        map.putString("networkType", "unknown")
        map.putString("isNetworkReachable", "unknown")
      }

      promise.resolve(map)
    } catch (error: Exception) {
      Log.e(NAME, "[getSystemInfo] ${error.stackTraceToString()}")
      promise.reject("SYSTEM_INFO_ERROR", error)
    }
  }

  @ReactMethod
  fun getAppInfo(promise: Promise) {
    try {
      val packageInfo =
        reactApplicationContext.packageManager.getPackageInfo(reactApplicationContext.packageName, 0)
      @Suppress("DEPRECATION")
      val buildNumber = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        packageInfo.longVersionCode.toString()
      } else {
        packageInfo.versionCode.toString()
      }
      val map = Arguments.createMap()
      map.putString("appVersion", packageInfo.versionName ?: "")
      map.putString("buildNumber", buildNumber)
      promise.resolve(map)
    } catch (error: Exception) {
      Log.e(NAME, "[getAppInfo] ${error.stackTraceToString()}")
      promise.reject("APP_INFO_ERROR", error)
    }
  }

  companion object {
    const val NAME = "Vconsole"
  }
}
