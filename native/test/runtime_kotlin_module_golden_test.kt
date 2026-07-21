@file:JvmName("RuntimeKotlinModuleGoldenTest")

import com.allnewmts.lua.AllNewMTSRuntimeModule
import expo.modules.kotlin.modules.VerificationExpo
import expo.modules.kotlin.modules.awaitRuntimeEvent

@Suppress("UNCHECKED_CAST")
fun main(arguments: Array<String>) {
  check(arguments.size == 3)
  val module = AllNewMTSRuntimeModule()
  module.definition()
  val create = VerificationExpo.functions.getValue("create") as (String) -> Map<String, String>
  val dispatch = VerificationExpo.functions.getValue("dispatch") as (String, String) -> Map<String, String>
  val destroy = VerificationExpo.functions.getValue("destroy") as (String) -> Map<String, String>
  val created = create(arguments[0])
  check(created["code"] == "OK" && created["runtimeId"] == "1")
  val admitted = dispatch(created.getValue("runtimeId"), arguments[1])
  check(admitted["code"] == "OK" && admitted["reservedRevision"] == "1")
  val emitted = awaitRuntimeEvent()
  check(emitted == mapOf(
    "eventName" to "onRuntimeResult",
    "runtimeId" to "1",
    "canonicalJSON" to arguments[2]
  ))
  check(destroy(created.getValue("runtimeId"))["code"] == "OK")
  println(emitted.getValue("canonicalJSON"))
}
