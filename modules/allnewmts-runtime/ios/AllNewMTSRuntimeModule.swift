import ExpoModulesCore

public final class AllNewMTSRuntimeModule: Module {
  private let adapter = AllNewMTSRuntimeAdapter()

  public func definition() -> ModuleDefinition {
    Name("AllNewMTSRuntime")
    Events("onRuntimeResult")

    OnCreate {
      adapter.emit = { [weak self] runtimeId, canonicalJSON in
        self?.sendEvent("onRuntimeResult", ["runtimeId": runtimeId, "canonicalJSON": canonicalJSON])
      }
    }

    AsyncFunction("create") { (config: String) in adapter.create(config) }
    Function("dispatch") { (runtimeId: String, event: String) in adapter.dispatch(runtimeId, event: event) }
    AsyncFunction("destroy") { (runtimeId: String) in adapter.destroy(runtimeId) }
  }
}
