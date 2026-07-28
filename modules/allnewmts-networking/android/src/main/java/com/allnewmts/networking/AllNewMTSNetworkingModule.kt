package com.allnewmts.networking

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

private const val RESPONSE_LIMIT = 4_096

class AllNewMTSNetworkingModule : Module() {
  private var mci = 0L

  override fun definition() = ModuleDefinition {
    Name("AllNewMTSNetworking")
    AsyncFunction("probeLoopback") { port: Int -> probeLoopback(port) }
    AsyncFunction("connectMciBeta") { sourceBase64: String -> connectMciBeta(sourceBase64) }
    AsyncFunction("fetchSamsungElectronicsQuote") { fetchSamsungElectronicsQuote() }
    AsyncFunction("disconnectMci") { destroyMci() }
    OnDestroy { destroyMci() }
  }

  @Synchronized
  private fun connectMciBeta(sourceBase64: String): Map<String, Any> {
    val source = try {
      if (sourceBase64.length > 87_384) return mciResult(1)
      Base64.decode(sourceBase64, Base64.NO_WRAP)
    } catch (_: IllegalArgumentException) {
      return mciResult(1)
    }
    if (source.isEmpty() || source.size > 65_536) return mciResult(1)
    if (mci == 0L) {
      mci = nativeCreateMci()
      if (mci == 0L) return mciResult(9)
    }
    return mciResult(nativeConnectMciBeta(mci, source))
  }

  @Synchronized
  private fun fetchSamsungElectronicsQuote(): Map<String, Any> {
    if (mci == 0L) return mciResult(8)
    val result = nativeFetchSamsungElectronicsQuote(mci)
    val code = result[0].toInt()
    return if (code == 0) mapOf(
      "code" to "OK",
      "instrument" to "005930",
      "currentPrice" to result[1].toString(),
    ) else mciResult(code)
  }

  @Synchronized
  private fun destroyMci() {
    if (mci != 0L) nativeDestroyMci(mci)
    mci = 0L
  }

  private external fun nativeCreateMci(): Long
  private external fun nativeConnectMciBeta(handle: Long, source: ByteArray): Int
  private external fun nativeFetchSamsungElectronicsQuote(handle: Long): LongArray
  private external fun nativeDestroyMci(handle: Long)

  private fun probeLoopback(port: Int): Map<String, Any> {
    if (port !in 1..65_535) return result("INVALID_ARGUMENT")
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL("http", "127.0.0.1", port, "/").openConnection() as HttpURLConnection).apply {
        connectTimeout = 5_000
        readTimeout = 5_000
        requestMethod = "GET"
        instanceFollowRedirects = false
        useCaches = false
      }
      val status = connection.responseCode
      val declared = connection.contentLengthLong
      if (declared > RESPONSE_LIMIT) return result("RESPONSE_LIMIT", status)
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val bytes = stream?.use { input ->
        val output = ByteArrayOutputStream()
        val chunk = ByteArray(1_024)
        while (true) {
          val count = input.read(chunk)
          if (count < 0) break
          if (output.size() + count > RESPONSE_LIMIT) return result("RESPONSE_LIMIT", status)
          output.write(chunk, 0, count)
        }
        output.toByteArray()
      } ?: ByteArray(0)
      val body = try {
        StandardCharsets.UTF_8.newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(bytes))
          .toString()
      } catch (_: Exception) {
        return result("RESPONSE_INVALID", status)
      }
      result(if (status in 200..299) "OK" else "HTTP_STATUS", status, body)
    } catch (_: Exception) {
      result("TRANSPORT_ERROR")
    } finally {
      connection?.disconnect()
    }
  }

  private fun result(code: String, status: Int = 0, body: String = "") =
    mapOf("code" to code, "httpStatus" to status, "body" to body)

  private fun mciResult(code: Int) = mapOf("code" to when (code) {
    0 -> "OK"
    1 -> "INVALID_ARGUMENT"
    2 -> "BETA_SOURCE_MISMATCH"
    3 -> "BETA_ENDPOINT_INVALID"
    4 -> "TRANSPORT_ERROR"
    5 -> "FRAME_INVALID"
    6 -> "INIT_INVALID"
    7 -> "AUTH_FAILED"
    8 -> "NOT_READY"
    9 -> "RESOURCE_LIMIT"
    10 -> "TRANSACTION_REJECTED"
    11 -> "TRANSACTION_INVALID"
    12 -> "TRANSACTION_BODY_INVALID"
    else -> "TRANSPORT_ERROR"
  })

  companion object {
    init {
      System.loadLibrary("allnewmts_networking")
    }
  }
}
