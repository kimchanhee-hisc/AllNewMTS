package com.allnewmts.lua

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AllNewMTSLuaModule : Module() {
  private var runtime = 0L

  init {
    System.loadLibrary("allnewmts_lua")
  }

  override fun definition() = ModuleDefinition {
    Name("AllNewMTSLua")

    Function("create") {
      if (runtime != 0L) nativeDestroy(runtime)
      runtime = nativeCreate()
      runtime != 0L
    }

    Function("evaluate") { source: String ->
      nativeEvaluate(runtime, source)
    }

    Function("destroy") {
      if (runtime != 0L) nativeDestroy(runtime)
      runtime = 0L
    }
  }

  private external fun nativeCreate(): Long
  private external fun nativeEvaluate(runtime: Long, source: String): String
  private external fun nativeDestroy(runtime: Long)
}
