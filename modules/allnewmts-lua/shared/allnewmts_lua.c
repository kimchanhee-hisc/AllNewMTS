#define _POSIX_C_SOURCE 200809L

#include "allnewmts_lua.h"
#include "resource_bundle.h"
#include "sha256.h"

#include "lauxlib.h"
#include "lua.h"
#include "lualib.h"

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MEMORY_LIMIT (32u * 1024u * 1024u)
#define DEADLINE_MILLISECONDS 50u

struct AllNewMTSLua {
  lua_State *state;
  size_t allocated;
  int allocation_failed;
  int timed_out;
  uint64_t deadline_ns;
};

static char runtime_registry_key;

static uint64_t monotonic_ns(void) {
  struct timespec value;
  clock_gettime(CLOCK_MONOTONIC, &value);
  return (uint64_t)value.tv_sec * 1000000000ull + (uint64_t)value.tv_nsec;
}

static void copy_text(char *target, size_t size, const char *text) {
  if (!target || !size) return;
  snprintf(target, size, "%s", text ? text : "");
}

static void *limited_alloc(void *opaque, void *pointer, size_t old_size, size_t new_size) {
  AllNewMTSLua *runtime = (AllNewMTSLua *)opaque;
  if (!new_size) {
    free(pointer);
    runtime->allocated = old_size <= runtime->allocated ? runtime->allocated - old_size : 0;
    return NULL;
  }
  if (new_size > old_size && new_size - old_size > MEMORY_LIMIT - runtime->allocated) {
    runtime->allocation_failed = 1;
    return NULL;
  }
  pointer = realloc(pointer, new_size);
  if (!pointer) {
    runtime->allocation_failed = 1;
    return NULL;
  }
  runtime->allocated = runtime->allocated - old_size + new_size;
  return pointer;
}

static AllNewMTSLua *runtime_for(lua_State *state) {
  AllNewMTSLua *runtime;
  lua_pushlightuserdata(state, &runtime_registry_key);
  lua_rawget(state, LUA_REGISTRYINDEX);
  runtime = (AllNewMTSLua *)lua_touserdata(state, -1);
  lua_pop(state, 1);
  return runtime;
}

static void deadline_hook(lua_State *state, lua_Debug *debug) {
  AllNewMTSLua *runtime = runtime_for(state);
  (void)debug;
  if (runtime && monotonic_ns() > runtime->deadline_ns) {
    runtime->timed_out = 1;
    luaL_error(state, "execution deadline exceeded");
  }
}

static int valid_resource_path(const char *value, size_t size) {
  size_t i, segment = 0;
  if (!size || value[0] == '/' || memchr(value, '\0', size) || memchr(value, '\\', size)) return 0;
  for (i = 0; i <= size; i++) {
    if (i == size || value[i] == '/') {
      if (i == segment || (i - segment == 1 && value[segment] == '.') ||
          (i - segment == 2 && value[segment] == '.' && value[segment + 1] == '.')) return 0;
      segment = i + 1;
    }
  }
  return 1;
}

static int manifest_dofile(lua_State *state) {
  const AllNewMTSResource *resource;
  unsigned char actual[32];
  size_t path_size;
  const char *path = luaL_checklstring(state, 1, &path_size);
  if (!valid_resource_path(path, path_size)) return luaL_error(state, "resource path rejected");
  resource = allnewmts_resource(path, path_size);
  if (!resource) return luaL_error(state, "resource is not manifest-listed");
  allnewmts_sha256(resource->bytes, resource->size, actual);
  if (memcmp(actual, resource->sha256, sizeof(actual)) != 0) return luaL_error(state, "resource hash mismatch");
  lua_settop(state, 0);
  if (luaL_loadbuffer(state, (const char *)resource->bytes, resource->size, resource->path) != 0) return lua_error(state);
  lua_call(state, 0, LUA_MULTRET);
  return lua_gettop(state);
}

static int global_probe(lua_State *state) {
  lua_pushliteral(state, "global");
  return 1;
}

static int form_probe(lua_State *state) {
  lua_pushliteral(state, "form");
  return 1;
}

static int data_probe(lua_State *state) {
  lua_pushliteral(state, "data");
  return 1;
}

static int control_ping(lua_State *state) {
  lua_pushliteral(state, "method");
  return 1;
}

static int control_index(lua_State *state) {
  const char *key = luaL_checkstring(state, 2);
  if (strcmp(key, "caption") == 0) lua_pushliteral(state, "property");
  else if (strcmp(key, "ping") == 0) lua_pushcfunction(state, control_ping);
  else lua_pushnil(state);
  return 1;
}

static void set_nil(lua_State *state, const char *name) {
  lua_pushnil(state);
  lua_setglobal(state, name);
}

static void open_sandbox(lua_State *state) {
  luaopen_base(state); lua_settop(state, 0);
  luaopen_table(state); lua_settop(state, 0);
  luaopen_string(state); lua_settop(state, 0);
  luaopen_math(state); lua_settop(state, 0);
  set_nil(state, "loadfile"); set_nil(state, "package"); set_nil(state, "io");
  set_nil(state, "os"); set_nil(state, "debug");
  lua_pushcfunction(state, manifest_dofile); lua_setglobal(state, "dofile");
}

static void install_probes(lua_State *state) {
  lua_pushcfunction(state, global_probe); lua_setglobal(state, "NativeGlobal");
  lua_newtable(state); lua_pushcfunction(state, form_probe); lua_setfield(state, -2, "probe"); lua_setglobal(state, "Form");
  lua_newtable(state); lua_pushcfunction(state, data_probe); lua_setfield(state, -2, "probe"); lua_setglobal(state, "DATAMANAGER");
  lua_newuserdata(state, 1);
  lua_newtable(state); lua_pushcfunction(state, control_index); lua_setfield(state, -2, "__index"); lua_setmetatable(state, -2);
  lua_setglobal(state, "Control");
}

AllNewMTSLua *allnewmts_lua_create(void) {
  AllNewMTSLua *runtime = (AllNewMTSLua *)calloc(1, sizeof(*runtime));
  if (!runtime) return NULL;
  runtime->state = lua_newstate(limited_alloc, runtime);
  if (!runtime->state) { free(runtime); return NULL; }
  lua_pushlightuserdata(runtime->state, &runtime_registry_key);
  lua_pushlightuserdata(runtime->state, runtime);
  lua_rawset(runtime->state, LUA_REGISTRYINDEX);
  open_sandbox(runtime->state);
  install_probes(runtime->state);
  return runtime;
}

static void terminate_state(AllNewMTSLua *runtime) {
  if (runtime && runtime->state) {
    lua_sethook(runtime->state, NULL, 0, 0);
    lua_close(runtime->state);
    runtime->state = NULL;
  }
}

int allnewmts_lua_evaluate(AllNewMTSLua *runtime, const char *source,
                           char *result, size_t result_size,
                           char *error, size_t error_size) {
  lua_State *state;
  int status;
  const char *text;
  if (!runtime || !runtime->state) { copy_text(error, error_size, "STATE_DESTROYED"); return 0; }
  if (!source) { copy_text(error, error_size, "SOURCE_REQUIRED"); return 0; }
  state = runtime->state;
  runtime->allocation_failed = 0;
  runtime->timed_out = 0;
  runtime->deadline_ns = monotonic_ns() + (uint64_t)DEADLINE_MILLISECONDS * 1000000ull;
  lua_settop(state, 0);
  status = luaL_loadbuffer(state, source, strlen(source), "=evaluate");
  if (!status) {
    lua_sethook(state, deadline_hook, LUA_MASKCOUNT, 10000);
    status = lua_pcall(state, 0, LUA_MULTRET, 0);
    lua_sethook(state, NULL, 0, 0);
  }
  if (status) {
    text = lua_tostring(state, -1);
    copy_text(error, error_size, text ? text : "LUA_ERROR");
    if (runtime->allocation_failed || runtime->timed_out) terminate_state(runtime);
    return 0;
  }
  if (lua_gettop(state) == 0 || lua_isnil(state, 1)) text = "nil";
  else if (lua_isboolean(state, 1)) text = lua_toboolean(state, 1) ? "true" : "false";
  else text = lua_tostring(state, 1);
  if (!text) { copy_text(error, error_size, "UNSUPPORTED_RESULT"); return 0; }
  copy_text(result, result_size, text);
  copy_text(error, error_size, "");
  return 1;
}

void allnewmts_lua_destroy(AllNewMTSLua *runtime) {
  if (!runtime) return;
  terminate_state(runtime);
  free(runtime);
}
