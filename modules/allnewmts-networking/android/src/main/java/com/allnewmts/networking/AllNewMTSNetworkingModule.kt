package com.allnewmts.networking

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
  override fun definition() = ModuleDefinition {
    Name("AllNewMTSNetworking")
    AsyncFunction("probeLoopback") { port: Int -> probeLoopback(port) }
  }

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
}
