#include <jni.h>

#include "allnewmts_lua_adapters.h"

extern "C" JNIEXPORT jlong JNICALL
Java_com_allnewmts_lua_AllNewMTSLuaModule_nativeCreate(JNIEnv *, jobject) {
  return reinterpret_cast<jlong>(allnewmts_lua_android_create());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_allnewmts_lua_AllNewMTSLuaModule_nativeEvaluate(JNIEnv *environment, jobject, jlong handle, jstring input) {
  char result[4096] = {0};
  char error[4096] = {0};
  const char *source = environment->GetStringUTFChars(input, nullptr);
  int ok = allnewmts_lua_android_evaluate(reinterpret_cast<AllNewMTSLua *>(handle), source,
                                          result, sizeof(result), error, sizeof(error));
  environment->ReleaseStringUTFChars(input, source);
  if (!ok) {
    jclass exception = environment->FindClass("java/lang/IllegalStateException");
    environment->ThrowNew(exception, error);
    return nullptr;
  }
  return environment->NewStringUTF(result);
}

extern "C" JNIEXPORT void JNICALL
Java_com_allnewmts_lua_AllNewMTSLuaModule_nativeDestroy(JNIEnv *, jobject, jlong handle) {
  allnewmts_lua_android_destroy(reinterpret_cast<AllNewMTSLua *>(handle));
}
