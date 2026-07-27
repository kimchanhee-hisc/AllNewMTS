package com.allnewmts.lua

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Verification-only synchronous Lua module.
class AllNewMTSLuaModule : Module() {
  private var nativeHandle = 0L

  init {
    System.loadLibrary("allnewmts_lua")
  }

  override fun definition() = ModuleDefinition {
    Name("AllNewMTSLua")

    Function("create") {
      if (nativeHandle != 0L) nativeDestroy(nativeHandle)
      nativeHandle = nativeCreate()
      nativeHandle != 0L
    }

    Function("evaluate") { source: String ->
      nativeEvaluate(nativeHandle, source)
    }

    Function("destroy") {
      if (nativeHandle != 0L) nativeDestroy(nativeHandle)
      nativeHandle = 0L
    }
  }

  private external fun nativeCreate(): Long
  private external fun nativeEvaluate(runtime: Long, source: String): String
  private external fun nativeDestroy(runtime: Long)
}
