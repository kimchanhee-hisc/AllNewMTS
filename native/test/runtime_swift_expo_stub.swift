public enum VerificationExpo {
  public static var events: [[String: String]] = []
  public static var unaryFunctions: [String: (String) -> Any] = [:]
  public static var binaryFunctions: [String: (String, String) -> Any] = [:]
  public static var onEvent: (([String: String]) -> Void)?
}

public protocol Module: AnyObject {
  @ModuleDefinitionBuilder func definition() -> ModuleDefinition
  func sendEvent(_ name: String, _ payload: [String: String])
}

public extension Module {
  public func sendEvent(_ name: String, _ payload: [String: String]) {
    var captured = payload
    captured["eventName"] = name
    VerificationExpo.events.append(captured)
    VerificationExpo.onEvent?(captured)
  }
}

@resultBuilder
public enum ModuleDefinitionBuilder {
  public static func buildBlock(_ components: Any...) -> [Any] { components }
  public static func buildFinalResult(_ components: [Any]) -> ModuleDefinition { ModuleDefinition(components) }
}

public struct ModuleDefinition {
  public init(_ components: [Any]) { _ = components }
}

public func Name(_ value: String) -> Any { value }
public func Events(_ value: String) -> Any { value }
public func OnCreate(_ body: () -> Void) -> Any { body(); return "OnCreate" }
public func AsyncFunction<Result>(
  _ name: String,
  @_implicitSelfCapture _ body: @escaping (String) -> Result
) -> Any {
  VerificationExpo.unaryFunctions[name] = { body($0) }
  return name
}

public func Function<Result>(
  _ name: String,
  @_implicitSelfCapture _ body: @escaping (String, String) -> Result
) -> Any {
  VerificationExpo.binaryFunctions[name] = { body($0, $1) }
  return name
}
