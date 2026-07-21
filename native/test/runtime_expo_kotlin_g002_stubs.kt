package expo.modules.kotlin.modules

open class Module {
  open fun definition() = ModuleDefinition {}
}

class ModuleDefinition(body: ModuleDefinitionBuilder.() -> Unit) {
  init { ModuleDefinitionBuilder().body() }
}

class ModuleDefinitionBuilder {
  fun Name(@Suppress("UNUSED_PARAMETER") value: String) {}
  @JvmName("FunctionWithoutArgs")
  fun Function(
    @Suppress("UNUSED_PARAMETER") name: String,
    @Suppress("UNUSED_PARAMETER") body: () -> Any?
  ) {}
  inline fun <reified Result, reified P0> Function(
    @Suppress("UNUSED_PARAMETER") name: String,
    @Suppress("UNUSED_PARAMETER") crossinline body: (P0) -> Result
  ) {}
}
