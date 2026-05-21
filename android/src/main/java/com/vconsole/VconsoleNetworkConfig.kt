package com.vconsole

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import java.net.InetAddress
import java.util.Locale
import okhttp3.Dns
import okhttp3.OkHttpClient

internal data class DnsRule(
  val domain: String,
  val ip: String,
)

internal data class HeaderRule(
  val key: String,
  val value: String,
)

internal data class NetworkConfigState(
  val dnsEnabled: Boolean = false,
  val dnsRules: List<DnsRule> = emptyList(),
  val headerEnabled: Boolean = false,
  val headerRules: List<HeaderRule> = emptyList(),
)

object VconsoleNetworkConfig {
  @Volatile
  private var state = NetworkConfigState()

  @JvmStatic
  fun update(config: ReadableMap?) {
    state = NetworkConfigState(
      dnsEnabled = config
        ?.getMap("customDNS")
        ?.getBoolean("enabled")
        ?: false,
      dnsRules = parseDnsRules(config?.getMap("customDNS")?.getArray("rules")),
      headerEnabled = config
        ?.getMap("customHeaders")
        ?.getBoolean("enabled")
        ?: false,
      headerRules = parseHeaderRules(
        config?.getMap("customHeaders")?.getArray("headers")
      ),
    )
  }

  @JvmStatic
  fun apply(builder: OkHttpClient.Builder) {
    val current = state

    if (current.headerEnabled && current.headerRules.isNotEmpty()) {
      builder.addNetworkInterceptor { chain ->
        val requestBuilder = chain.request().newBuilder()
        current.headerRules.forEach { rule ->
          requestBuilder.header(rule.key, rule.value)
        }
        chain.proceed(requestBuilder.build())
      }
    }

    if (current.dnsEnabled && current.dnsRules.isNotEmpty()) {
      val ruleMap = current.dnsRules.associateBy(
        keySelector = { it.domain.lowercase(Locale.ROOT) },
        valueTransform = { it.ip }
      )
      builder.dns(
        object : Dns {
          override fun lookup(hostname: String): List<InetAddress> {
            val mappedIp = ruleMap[hostname.lowercase(Locale.ROOT)]
            if (mappedIp.isNullOrBlank()) {
              return Dns.SYSTEM.lookup(hostname)
            }
            return try {
              InetAddress.getAllByName(mappedIp).toList()
            } catch (_: Exception) {
              Dns.SYSTEM.lookup(hostname)
            }
          }
        }
      )
    }
  }

  private fun parseDnsRules(rules: ReadableArray?): List<DnsRule> {
    if (rules == null) {
      return emptyList()
    }

    return buildList {
      for (index in 0 until rules.size()) {
        val rule = rules.getMap(index) ?: continue
        val domain = rule.getString("domain")?.trim()?.lowercase().orEmpty()
        val ip = rule.getString("ip")?.trim().orEmpty()
        if (domain.isNotEmpty() && ip.isNotEmpty()) {
          add(DnsRule(domain = domain, ip = ip))
        }
      }
    }
  }

  private fun parseHeaderRules(headers: ReadableArray?): List<HeaderRule> {
    if (headers == null) {
      return emptyList()
    }

    return buildList {
      for (index in 0 until headers.size()) {
        val header = headers.getMap(index) ?: continue
        val key = header.getString("key")?.trim().orEmpty()
        val value = header.getString("value")?.trim().orEmpty()
        if (key.isNotEmpty()) {
          add(HeaderRule(key = key, value = value))
        }
      }
    }
  }
}
