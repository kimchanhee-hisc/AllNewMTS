import ExpoModulesCore

public final class AllNewMTSLuaModule: Module {
  private let adapter = AllNewMTSLuaAdapter()

  public func definition() -> ModuleDefinition {
    Name("AllNewMTSLua")

    Function("create") { () -> Bool in
      adapter.create()
    }

    Function("evaluate") { (source: String) throws -> String in
      var error: NSError?
      guard let value = adapter.evaluate(source, error: &error) else {
        throw error ?? NSError(domain: "AllNewMTSLua", code: 1)
      }
      return value
    }

    Function("destroy") { () in
      adapter.destroy()
    }
  }
}
