#include "allnewmts_runtime_adapters.h"

#include <cassert>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>

struct Capture {
  std::mutex mutex;
  std::condition_variable ready;
  std::string output;
  int releases = 0;
};

static void sink(void *opaque, uint64_t, const uint8_t *bytes, size_t size) {
  auto *capture = static_cast<Capture *>(opaque);
  {
    std::lock_guard<std::mutex> lock(capture->mutex);
    capture->output.assign(reinterpret_cast<const char *>(bytes), size);
  }
  capture->ready.notify_all();
}

static void release(void *opaque) {
  auto *capture = static_cast<Capture *>(opaque);
  {
    std::lock_guard<std::mutex> lock(capture->mutex);
    capture->releases += 1;
  }
  capture->ready.notify_all();
}

int main(int argc, char **argv) {
  assert(argc == 2);
  const bool ios = std::strcmp(argv[1], "ios") == 0;
  assert(ios || std::strcmp(argv[1], "android") == 0);
  const char *config =
      "{\"schemaVersion\":1,\"entry\":{\"path\":\"fixtures/runtime-conformance.lua\",\"sha256\":\"PLACEHOLDER_HASH\"},\"host\":{\"openLinkData\":\"open\",\"sharedData\":{\"shared\":\"shared-value\"},\"itemCodeInfo\":[{\"code\":\"item\",\"kind\":\"markettext\",\"marketLink\":\"\",\"value\":\"item-value\"}]},\"controls\":[{\"id\":\"Input\",\"type\":\"Edit\",\"properties\":{\"caption\":\"initial\"}},{\"id\":\"Action\",\"type\":\"Button\",\"properties\":{\"border\":\"none\",\"dfgcolor\":\"black\",\"enabled\":false}}],\"transactions\":[{\"id\":\"T_ALPHA\",\"blocks\":[{\"id\":\"input\",\"fields\":[\"value\"]},{\"id\":\"output\",\"fields\":[\"value\"]}]}]}";
  std::string bounded(config);
  bounded.replace(bounded.find("PLACEHOLDER_HASH"), std::strlen("PLACEHOLDER_HASH"),
                  "1e3b642aeda6de9ddbd309df8ac22ee4f3dcce78a8d166caa4e5774f39f82e09");
  Capture capture;
  AllNewMTSRuntimeResult created = ios
      ? allnewmts_runtime_ios_create(reinterpret_cast<const uint8_t *>(bounded.data()), bounded.size(), sink, release, &capture)
      : allnewmts_runtime_android_create(reinterpret_cast<const uint8_t *>(bounded.data()), bounded.size(), sink, release, &capture);
  assert(created.code == ALLNEWMTS_RUNTIME_OK && created.runtime_id == 1);
  const char *event = "{\"schemaVersion\":1,\"kind\":\"handler\",\"baseRevision\":\"0\",\"handler\":\"Noop\",\"arguments\":[],\"controlMutations\":[]}";
  AllNewMTSRuntimeResult admitted = ios
      ? allnewmts_runtime_ios_dispatch(created.runtime_id, reinterpret_cast<const uint8_t *>(event), std::strlen(event))
      : allnewmts_runtime_android_dispatch(created.runtime_id, reinterpret_cast<const uint8_t *>(event), std::strlen(event));
  assert(admitted.code == ALLNEWMTS_RUNTIME_OK && admitted.reserved_revision == 1);
  {
    std::unique_lock<std::mutex> lock(capture.mutex);
    assert(capture.ready.wait_for(lock, std::chrono::seconds(2), [&] { return !capture.output.empty(); }));
  }
  AllNewMTSRuntimeResult destroyed = ios ? allnewmts_runtime_ios_destroy(created.runtime_id)
                                         : allnewmts_runtime_android_destroy(created.runtime_id);
  assert(destroyed.code == ALLNEWMTS_RUNTIME_OK);
  {
    std::unique_lock<std::mutex> lock(capture.mutex);
    assert(capture.ready.wait_for(lock, std::chrono::seconds(2), [&] { return capture.releases == 1; }));
  }
  std::fwrite(capture.output.data(), 1, capture.output.size(), stdout);
  std::fputc('\n', stdout);
}
