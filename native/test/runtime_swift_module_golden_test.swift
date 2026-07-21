import ExpoModulesCore
import Dispatch
import Foundation

@main
enum RuntimeSwiftModuleGoldenTest {
  static func main() {
    guard CommandLine.arguments.count == 3 else { fatalError("expected config and event") }
    let module = AllNewMTSRuntimeModule()
    _ = module.definition()

    guard
      let create = VerificationExpo.unaryFunctions["create"],
      let dispatch = VerificationExpo.binaryFunctions["dispatch"],
      let destroy = VerificationExpo.unaryFunctions["destroy"],
      let created = create(CommandLine.arguments[1]) as? [String: String],
      created["code"] == "OK",
      let runtimeId = created["runtimeId"]
    else { fatalError("Swift Expo create mismatch") }

    VerificationExpo.onEvent = { payload in
      guard
        payload["eventName"] == "onRuntimeResult",
        payload["runtimeId"] == runtimeId,
        let canonicalJSON = payload["canonicalJSON"],
        let destroyed = destroy(runtimeId) as? [String: String],
        destroyed["code"] == "OK"
      else { fatalError("Swift Expo event or destroy mismatch") }
      print(canonicalJSON)
      fflush(stdout)
      exit(EXIT_SUCCESS)
    }

    guard
      let admitted = dispatch(runtimeId, CommandLine.arguments[2]) as? [String: String],
      admitted["code"] == "OK"
    else { fatalError("Swift Expo dispatch mismatch") }
    dispatchMain()
  }
}
