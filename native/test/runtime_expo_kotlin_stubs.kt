package expo.modules.kotlin.modules

import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

object VerificationExpo {
  val functions = mutableMapOf<String, Any>()
  val events = LinkedBlockingQueue<Map<String, String>>()
}

open class Module {
  open fun definition() = ModuleDefinition {}
  fun sendEvent(name: String, payload: Map<String, String>) {
    VerificationExpo.events.put(payload + ("eventName" to name))
  }
}

class ModuleDefinition(body: ModuleDefinitionBuilder.() -> Unit) {
  init { ModuleDefinitionBuilder().body() }
}

class ModuleDefinitionBuilder {
  fun Name(@Suppress("UNUSED_PARAMETER") value: String) {}
  fun Events(@Suppress("UNUSED_PARAMETER") value: String) {}
  fun <Result> AsyncFunction(name: String, body: (String) -> Result) { VerificationExpo.functions[name] = body }
  fun <Result> Function(name: String, body: (String, String) -> Result) { VerificationExpo.functions[name] = body }
}

fun awaitRuntimeEvent(): Map<String, String> =
  VerificationExpo.events.poll(2, TimeUnit.SECONDS) ?: error("timed out waiting for Kotlin Expo event")
