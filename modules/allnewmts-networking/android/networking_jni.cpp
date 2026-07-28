#include <jni.h>

#include "allnewmts_product_mci.h"

extern "C" JNIEXPORT jlong JNICALL
Java_com_allnewmts_networking_AllNewMTSNetworkingModule_nativeCreateMci(
    JNIEnv *, jobject) {
  AllNewMTSProductMciHandle handle = nullptr;
  return allnewmts_product_mci_create(&handle) == ALLNEWMTS_MCI_OK
             ? reinterpret_cast<jlong>(handle)
             : 0;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_allnewmts_networking_AllNewMTSNetworkingModule_nativeConnectMciBeta(
    JNIEnv *env, jobject, jlong opaque, jbyteArray source) {
  if (!opaque || !source) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  const jsize size = env->GetArrayLength(source);
  if (size <= 0 || size > 65536) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  jbyte *bytes = env->GetByteArrayElements(source, nullptr);
  if (!bytes) return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  const uint32_t code = allnewmts_product_mci_connect_beta(
      reinterpret_cast<AllNewMTSProductMciHandle>(opaque),
      reinterpret_cast<const uint8_t *>(bytes), static_cast<size_t>(size));
  env->ReleaseByteArrayElements(source, bytes, JNI_ABORT);
  return static_cast<jint>(code);
}

extern "C" JNIEXPORT jlongArray JNICALL
Java_com_allnewmts_networking_AllNewMTSNetworkingModule_nativeFetchSamsungElectronicsQuote(
    JNIEnv *env, jobject, jlong opaque) {
  AllNewMTSMciGd1000q1Quote quote{};
  const uint32_t code = allnewmts_product_mci_fetch_samsung_electronics(
      reinterpret_cast<AllNewMTSProductMciHandle>(opaque), &quote);
  const jlong values[] = {static_cast<jlong>(code),
                          static_cast<jlong>(quote.current_price)};
  jlongArray result = env->NewLongArray(2);
  if (result) env->SetLongArrayRegion(result, 0, 2, values);
  return result;
}

extern "C" JNIEXPORT void JNICALL
Java_com_allnewmts_networking_AllNewMTSNetworkingModule_nativeDestroyMci(
    JNIEnv *, jobject, jlong opaque) {
  allnewmts_product_mci_destroy(
      reinterpret_cast<AllNewMTSProductMciHandle>(opaque));
}
