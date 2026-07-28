package com.allnewmts.lua

import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.charset.StandardCharsets
import java.lang.Long.toUnsignedString

class AllNewMTSRuntimeModule : Module() {
  private val main = Handler(Looper.getMainLooper())

  init { System.loadLibrary("allnewmts_lua") }

  override fun definition() = ModuleDefinition {
    Name("AllNewMTSRuntime")
    Events("onRuntimeResult")
    AsyncFunction("create") { config: String -> result(nativeCreate(config.toByteArray(StandardCharsets.UTF_8))) }
    Function("dispatch") { runtimeId: String, event: String -> result(nativeDispatch(runtimeId, event.toByteArray(StandardCharsets.UTF_8))) }
    AsyncFunction("destroy") { runtimeId: String -> result(nativeDestroy(runtimeId)) }
  }

  @Suppress("unused")
  private fun nativeEmit(runtimeId: Long, bytes: ByteArray) {
    val json = String(bytes.copyOf(), StandardCharsets.UTF_8)
    main.post { sendEvent("onRuntimeResult", mapOf("runtimeId" to toUnsignedString(runtimeId), "canonicalJSON" to json)) }
  }

  private fun result(value: LongArray) = mapOf("code" to nativeResultName(value[0].toInt()), "runtimeId" to toUnsignedString(value[1]), "reservedRevision" to toUnsignedString(value[2]))
  private external fun nativeCreate(config: ByteArray): LongArray
  private external fun nativeDispatch(runtimeId: String, event: ByteArray): LongArray
  private external fun nativeDestroy(runtimeId: String): LongArray
  private external fun nativeResultName(code: Int): String
}
