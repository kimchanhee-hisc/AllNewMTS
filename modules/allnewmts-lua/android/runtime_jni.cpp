#include <jni.h>
#include <cstdlib>

#include "allnewmts_runtime_adapters.h"

struct RuntimeContext { JavaVM *vm; jobject module; };

static jlongArray result(JNIEnv *environment, AllNewMTSRuntimeResult value) {
  jlong values[3] = {(jlong)value.code, (jlong)value.runtime_id, (jlong)value.reserved_revision};
  jlongArray output = environment->NewLongArray(3); environment->SetLongArrayRegion(output, 0, 3, values); return output;
}

static bool runtimeId(JNIEnv *environment, jstring input, uint64_t *output) {
  if (!input) return false;
  const char *bytes = environment->GetStringUTFChars(input, nullptr);
  jsize size = environment->GetStringUTFLength(input);
  uint32_t code = allnewmts_runtime_adapter_parse_id(
      reinterpret_cast<const uint8_t *>(bytes), static_cast<size_t>(size), output);
  environment->ReleaseStringUTFChars(input, bytes);
  return code == ALLNEWMTS_RUNTIME_OK;
}

static void output(void *opaque, uint64_t runtime_id, const uint8_t *bytes, size_t size) {
  RuntimeContext *context = static_cast<RuntimeContext *>(opaque); JNIEnv *environment = nullptr; bool attached = false;
  if (context->vm->GetEnv((void **)&environment, JNI_VERSION_1_6) != JNI_OK) { if (context->vm->AttachCurrentThread(&environment, nullptr) != JNI_OK) return; attached = true; }
  jclass type = environment->GetObjectClass(context->module); jmethodID method = environment->GetMethodID(type, "nativeEmit", "(J[B)V");
  jbyteArray data = environment->NewByteArray((jsize)size); if (data) environment->SetByteArrayRegion(data, 0, (jsize)size, reinterpret_cast<const jbyte *>(bytes));
  if (method && data) environment->CallVoidMethod(context->module, method, (jlong)runtime_id, data);
  if (environment->ExceptionCheck()) environment->ExceptionClear(); if (data) environment->DeleteLocalRef(data); environment->DeleteLocalRef(type);
  if (attached) context->vm->DetachCurrentThread();
}

static void release(void *opaque) {
  RuntimeContext *context = static_cast<RuntimeContext *>(opaque); JNIEnv *environment = nullptr; bool attached = false;
  if (context->vm->GetEnv((void **)&environment, JNI_VERSION_1_6) != JNI_OK) { if (context->vm->AttachCurrentThread(&environment, nullptr) != JNI_OK) return; attached = true; }
  environment->DeleteGlobalRef(context->module); if (attached) context->vm->DetachCurrentThread(); delete context;
}

extern "C" JNIEXPORT jlongArray JNICALL
Java_com_allnewmts_lua_AllNewMTSRuntimeModule_nativeCreate(JNIEnv *environment, jobject module, jbyteArray input) {
  jsize size = environment->GetArrayLength(input); jbyte *bytes = environment->GetByteArrayElements(input, nullptr);
  RuntimeContext *context = new RuntimeContext(); environment->GetJavaVM(&context->vm); context->module = environment->NewGlobalRef(module);
  AllNewMTSRuntimeResult value = allnewmts_runtime_android_create(reinterpret_cast<uint8_t *>(bytes), (size_t)size, output, release, context);
  environment->ReleaseByteArrayElements(input, bytes, JNI_ABORT); if (value.code != ALLNEWMTS_RUNTIME_OK) release(context); return result(environment, value);
}
extern "C" JNIEXPORT jlongArray JNICALL
Java_com_allnewmts_lua_AllNewMTSRuntimeModule_nativeDispatch(JNIEnv *environment, jobject, jstring runtime_text, jbyteArray input) {
  uint64_t runtime_id = 0;
  if (!runtimeId(environment, runtime_text, &runtime_id)) return result(environment, {ALLNEWMTS_RUNTIME_INVALID_ARGUMENT, 0, 0});
  jsize size = environment->GetArrayLength(input); jbyte *bytes = environment->GetByteArrayElements(input, nullptr);
  AllNewMTSRuntimeResult value = allnewmts_runtime_android_dispatch((uint64_t)runtime_id, reinterpret_cast<uint8_t *>(bytes), (size_t)size);
  environment->ReleaseByteArrayElements(input, bytes, JNI_ABORT); return result(environment, value);
}
extern "C" JNIEXPORT jlongArray JNICALL
Java_com_allnewmts_lua_AllNewMTSRuntimeModule_nativeDestroy(JNIEnv *environment, jobject, jstring runtime_text) {
  uint64_t runtime_id = 0;
  if (!runtimeId(environment, runtime_text, &runtime_id)) return result(environment, {ALLNEWMTS_RUNTIME_INVALID_ARGUMENT, 0, 0});
  return result(environment, allnewmts_runtime_android_destroy(runtime_id));
}
extern "C" JNIEXPORT jstring JNICALL
Java_com_allnewmts_lua_AllNewMTSRuntimeModule_nativeResultName(JNIEnv *environment, jobject, jint code) { return environment->NewStringUTF(allnewmts_runtime_result_name((uint32_t)code)); }
