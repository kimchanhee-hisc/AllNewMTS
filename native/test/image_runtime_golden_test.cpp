#include "allnewmts_runtime_adapters.h"

#include <cassert>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <utility>

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

static void waitOutput(Capture &capture) {
  std::unique_lock<std::mutex> lock(capture.mutex);
  assert(capture.ready.wait_for(lock, std::chrono::seconds(2), [&] { return !capture.output.empty(); }));
}

static void waitRelease(Capture &capture) {
  std::unique_lock<std::mutex> lock(capture.mutex);
  assert(capture.ready.wait_for(lock, std::chrono::seconds(2), [&] { return capture.releases == 1; }));
}

int main(int argc, char **argv) {
  assert(argc == 3);
  const bool ios = std::strcmp(argv[1], "ios") == 0;
  assert(ios || std::strcmp(argv[1], "android") == 0);
  std::string config =
      "{\"schemaVersion\":1,\"entry\":{\"path\":\"fixtures/image-runtime.lua\",\"sha256\":\"PLACEHOLDER_HASH\"},\"host\":{\"openLinkData\":\"\",\"sharedData\":{},\"itemCodeInfo\":[]},\"controls\":[{\"id\":\"Hero\",\"type\":\"Image\",\"properties\":{\"imgpath\":\"initial\",\"imagetarget\":0,\"visible\":true,\"enabled\":true,\"left\":-4,\"top\":8,\"width\":32,\"height\":24,\"autosize\":false,\"circle\":false}}],\"transactions\":[]}";
  config.replace(config.find("PLACEHOLDER_HASH"), std::strlen("PLACEHOLDER_HASH"), argv[2]);
  auto create = [&](Capture &capture) {
    return ios
        ? allnewmts_runtime_ios_create(reinterpret_cast<const uint8_t *>(config.data()), config.size(), sink, release, &capture)
        : allnewmts_runtime_android_create(reinterpret_cast<const uint8_t *>(config.data()), config.size(), sink, release, &capture);
  };
  auto dispatch = [&](uint64_t id, const std::string &event) {
    return ios
        ? allnewmts_runtime_ios_dispatch(id, reinterpret_cast<const uint8_t *>(event.data()), event.size())
        : allnewmts_runtime_android_dispatch(id, reinterpret_cast<const uint8_t *>(event.data()), event.size());
  };
  auto destroy = [&](uint64_t id) {
    return ios ? allnewmts_runtime_ios_destroy(id) : allnewmts_runtime_android_destroy(id);
  };
  auto event = [](const char *handler) {
    return std::string("{\"schemaVersion\":1,\"kind\":\"handler\",\"baseRevision\":\"0\",\"handler\":\"") +
        handler + "\",\"arguments\":[],\"controlMutations\":[]}";
  };

  Capture success;
  auto created = create(success);
  assert(created.code == ALLNEWMTS_RUNTIME_OK);
  assert(dispatch(created.runtime_id, event("ImageState")).code == ALLNEWMTS_RUNTIME_OK);
  waitOutput(success);
  const std::string golden = success.output;
  assert(destroy(created.runtime_id).code == ALLNEWMTS_RUNTIME_OK);
  waitRelease(success);

  for (const auto &probe : {
      std::pair<const char *, const char *>{"ImageRollback", "LUA_ERROR"},
      {"ImageDenied", "HOST_LOOKUP_MISS"},
      {"ImageBadTarget", "HOST_ARGUMENT_ERROR"},
      {"ImageBadBoolean", "HOST_ARGUMENT_ERROR"},
      {"ImageBadGeometry", "HOST_ARGUMENT_ERROR"},
      {"ImageBadResource", "HOST_ARGUMENT_ERROR"}}) {
    Capture failed;
    created = create(failed);
    assert(created.code == ALLNEWMTS_RUNTIME_OK);
    assert(dispatch(created.runtime_id, event(probe.first)).code == ALLNEWMTS_RUNTIME_OK);
    waitOutput(failed);
    assert(failed.output.find(probe.second) != std::string::npos);
    assert(failed.output.find("\"imgpath\":\"initial\"") != std::string::npos);
    assert(failed.output.find("rollback-secret") == std::string::npos);
    waitRelease(failed);
  }

  std::string invalid = config;
  invalid.replace(invalid.find("\"imagetarget\":0"), std::strlen("\"imagetarget\":0"), "\"imagetarget\":4");
  Capture rejected;
  auto rejection = ios
      ? allnewmts_runtime_ios_create(reinterpret_cast<const uint8_t *>(invalid.data()), invalid.size(), sink, release, &rejected)
      : allnewmts_runtime_android_create(reinterpret_cast<const uint8_t *>(invalid.data()), invalid.size(), sink, release, &rejected);
  assert(rejection.code == ALLNEWMTS_RUNTIME_INVALID_ARGUMENT && rejected.output.empty() && rejected.releases == 0);

  const size_t controls_start = config.find("\"controls\":[") + std::strlen("\"controls\":[");
  const size_t controls_end = config.find("],\"transactions\"");
  const std::string control = config.substr(controls_start, controls_end - controls_start);
  std::string many;
  for (int index = 0; index < 65; ++index) {
    std::string item = control;
    item.replace(item.find("\"Hero\""), std::strlen("\"Hero\""), "\"Image" + std::to_string(index) + "\"");
    if (!many.empty()) many += ",";
    many += item;
  }
  std::string too_many = config.substr(0, controls_start) + many + config.substr(controls_end);
  rejection = ios
      ? allnewmts_runtime_ios_create(reinterpret_cast<const uint8_t *>(too_many.data()), too_many.size(), sink, release, &rejected)
      : allnewmts_runtime_android_create(reinterpret_cast<const uint8_t *>(too_many.data()), too_many.size(), sink, release, &rejected);
  assert(rejection.code == ALLNEWMTS_RUNTIME_INVALID_ARGUMENT);

  std::fwrite(golden.data(), 1, golden.size(), stdout);
  std::fputc('\n', stdout);
}
