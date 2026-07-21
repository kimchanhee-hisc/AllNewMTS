import ExpoModulesCore

public final class AllNewMTSLuaModule: Module {
  private let adapter = AllNewMTSLuaAdapter()

  public func definition() -> ModuleDefinition {
    Name("AllNewMTSLua")

    Function("create") { () -> Bool in
      adapter.create()
    }

    Function("evaluate") { (source: String) throws -> String in
      try adapter.evaluate(source)
    }

    Function("destroy") { () in
      adapter.destroy()
    }
  }
}
