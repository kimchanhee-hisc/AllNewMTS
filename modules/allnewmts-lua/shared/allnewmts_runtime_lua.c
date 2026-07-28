#include "allnewmts_runtime_lua.h"

#include "lauxlib.h"
#include "lualib.h"
#include "sha256.h"

#include <string.h>

static char runtime_key;
static char globals_key;
static char form_key;
static char form_members_key;
static char form_metatable_key;
static char datamanager_key;
static char datamanager_members_key;
static char datamanager_metatable_key;
static char trim_key;
static char dofile_key;
static char control_metatable_key;
static char controls_key;
static char protected_metatable_marker;

static int absolute_index(lua_State *state, int index) {
  return index > 0 || index <= LUA_REGISTRYINDEX
      ? index
      : lua_gettop(state) + index + 1;
}

static void save_registry(lua_State *state, void *key, int index) {
  index = absolute_index(state, index);
  lua_pushlightuserdata(state, key);
  lua_pushvalue(state, index);
  lua_rawset(state, LUA_REGISTRYINDEX);
}

static void push_registry(lua_State *state, void *key) {
  lua_pushlightuserdata(state, key);
  lua_rawget(state, LUA_REGISTRYINDEX);
}

void *allnewmts_lua_runtime(lua_State *state) {
  void *runtime;
  lua_pushlightuserdata(state, &runtime_key);
  lua_rawget(state, LUA_REGISTRYINDEX);
  runtime = lua_touserdata(state, -1);
  lua_pop(state, 1);
  return runtime;
}

static int fail(lua_State *state, int status) {
  const char *code = status == ALLNEWMTS_LUA_LOOKUP ? "HOST_LOOKUP_MISS" :
                     status == ALLNEWMTS_LUA_LIMIT ? "RESOURCE_LIMIT" :
                     "HOST_ARGUMENT_ERROR";
  void *runtime = allnewmts_lua_runtime(state);
  allnewmts_runtime_lua_fail(runtime, code);
  lua_pushstring(state, code);
  return lua_error(state);
}

static int push_value(lua_State *state, const AllNewMTSLuaValue *value) {
  if (value->kind == ALLNEWMTS_LUA_VALUE_STRING)
    lua_pushlstring(state, value->bytes, value->size);
  else if (value->kind == ALLNEWMTS_LUA_VALUE_NUMBER)
    lua_pushnumber(state, value->number);
  else if (value->kind == ALLNEWMTS_LUA_VALUE_BOOLEAN)
    lua_pushboolean(state, value->boolean);
  return value->kind == ALLNEWMTS_LUA_VALUE_NONE ? 0 : 1;
}

static int host(lua_State *state, int operation) {
  AllNewMTSLuaValue value = {0};
  int status = allnewmts_runtime_lua_host(allnewmts_lua_runtime(state),
                                         operation, state, &value);
  if (status != ALLNEWMTS_LUA_OK) return fail(state, status);
  lua_settop(state, 0);
  return push_value(state, &value);
}

static int host_get_open(lua_State *state) { return host(state, ALLNEWMTS_LUA_GET_OPEN); }
static int host_get_shared(lua_State *state) { return host(state, ALLNEWMTS_LUA_GET_SHARED); }
static int host_get_item(lua_State *state) { return host(state, ALLNEWMTS_LUA_GET_ITEM); }
static int host_message(lua_State *state) { return host(state, ALLNEWMTS_LUA_MESSAGE); }
static int host_toast(lua_State *state) { return host(state, ALLNEWMTS_LUA_TOAST); }
static int host_return(lua_State *state) { return host(state, ALLNEWMTS_LUA_RETURN); }
static int host_close(lua_State *state) { return host(state, ALLNEWMTS_LUA_CLOSE); }
static int host_set_data(lua_State *state) { return host(state, ALLNEWMTS_LUA_SET_DATA); }
static int host_get_count(lua_State *state) { return host(state, ALLNEWMTS_LUA_GET_COUNT); }
static int host_get_value(lua_State *state) { return host(state, ALLNEWMTS_LUA_GET_VALUE); }
static int host_trim(lua_State *state) { return host(state, ALLNEWMTS_LUA_TRIM); }

static int host_request(lua_State *state) {
  const char *transaction = NULL;
  size_t transaction_size = 0;
  uint64_t request_token = 0;
  int status = allnewmts_runtime_lua_prepare_request(
      allnewmts_lua_runtime(state), state, &transaction, &transaction_size,
      &request_token);
  if (status != ALLNEWMTS_LUA_OK) return fail(state, status);
  lua_getglobal(state, "DATAMANAGER_OnSendTranBefore");
  if (!lua_isfunction(state, -1)) {
    lua_pop(state, 1);
    status = ALLNEWMTS_LUA_LOOKUP;
  } else {
    lua_pushvalue(state, 1);
    status = lua_pcall(state, 1, 0, 0) == 0 ? ALLNEWMTS_LUA_OK : ALLNEWMTS_LUA_RAISE;
  }
  status = allnewmts_runtime_lua_finish_request(allnewmts_lua_runtime(state),
                                                transaction, transaction_size,
                                                request_token,
                                                status);
  if (status == ALLNEWMTS_LUA_RAISE) return lua_error(state);
  if (status != ALLNEWMTS_LUA_OK) return fail(state, status);
  lua_settop(state, 0);
  return 0;
}

static int host_request_realtime(lua_State *state) {
  const char *transaction = NULL;
  size_t transaction_size = 0;
  int status = allnewmts_runtime_lua_prepare_realtime_request(
      allnewmts_lua_runtime(state), state, &transaction, &transaction_size);
  if (status != ALLNEWMTS_LUA_OK) return fail(state, status);
  lua_getglobal(state, "DATAMANAGER_OnSendRealBefore");
  if (!lua_isfunction(state, -1)) {
    lua_pop(state, 1);
    status = ALLNEWMTS_LUA_LOOKUP;
  } else {
    lua_pushvalue(state, 1);
    status = lua_pcall(state, 1, 0, 0) == 0 ? ALLNEWMTS_LUA_OK
                                            : ALLNEWMTS_LUA_RAISE;
  }
  status = allnewmts_runtime_lua_finish_realtime_request(
      allnewmts_lua_runtime(state), transaction, transaction_size, status);
  if (status == ALLNEWMTS_LUA_RAISE) return lua_error(state);
  if (status != ALLNEWMTS_LUA_OK) return fail(state, status);
  lua_settop(state, 0);
  return 0;
}

static int host_cancel_realtime(lua_State *state) {
  int status = allnewmts_runtime_lua_cancel_realtime(
      allnewmts_lua_runtime(state), state);
  if (status != ALLNEWMTS_LUA_OK) return fail(state, status);
  lua_settop(state, 0);
  return 0;
}

static int control_set_radius(lua_State *state);

static int control_call(lua_State *state, int operation) {
  AllNewMTSLuaControlRef *control =
      (AllNewMTSLuaControlRef *)lua_touserdata(state, 1);
  AllNewMTSLuaValue value = {0};
  int status = allnewmts_runtime_lua_control_call(control, operation, state, &value);
  if (status != ALLNEWMTS_LUA_OK) return fail(state, status);
  if (value.kind == ALLNEWMTS_LUA_VALUE_METHOD) {
    lua_pushcfunction(state, control_set_radius);
    return 1;
  }
  return push_value(state, &value);
}

static int control_index(lua_State *state) { return control_call(state, 0); }
static int control_newindex(lua_State *state) { return control_call(state, 1); }
static int control_set_radius(lua_State *state) { return control_call(state, 2); }
static int deny_member(lua_State *state) { return fail(state, ALLNEWMTS_LUA_LOOKUP); }
static int runtime_dofile(lua_State *state);

static void set_function(lua_State *state, const char *name,
                         lua_CFunction function) {
  lua_pushcfunction(state, function);
  lua_setfield(state, -2, name);
}

static void clear_global(lua_State *state, const char *name) {
  lua_pushnil(state);
  lua_setglobal(state, name);
}

static void protect_metatable(lua_State *state) {
  lua_pushlightuserdata(state, &protected_metatable_marker);
  lua_setfield(state, -2, "__metatable");
}

static void save_members(lua_State *state, int table_index,
                         const char *const *names, size_t count, void *key) {
  size_t index;
  table_index = absolute_index(state, table_index);
  lua_newtable(state);
  for (index = 0; index < count; ++index) {
    lua_pushstring(state, names[index]);
    lua_rawget(state, table_index);
    lua_setfield(state, -2, names[index]);
  }
  save_registry(state, key, -1);
  lua_pop(state, 1);
}

static int install_frame(lua_State *state) {
  void *runtime = lua_touserdata(state, 1);
  static const char *const form_members[] = {
      "GetOpenLinkData", "GetSharedData", "GetItemCodeInfo", "MsgBoxEx",
      "Toast", "SendReturnToParent", "CloseForm"};
  static const char *const datamanager_members[] = {
      "RequestTranData", "RequestRealData", "CancelRealData", "SetDataValue",
      "GetDataCount", "GetDataValue"};
  size_t index, count;
  lua_pushlightuserdata(state, &runtime_key);
  lua_pushlightuserdata(state, runtime);
  lua_rawset(state, LUA_REGISTRYINDEX);
  luaopen_base(state); lua_settop(state, 1);
  luaopen_table(state); lua_settop(state, 1);
  luaopen_string(state); lua_settop(state, 1);
  luaopen_math(state); lua_settop(state, 1);
  lua_pushvalue(state, LUA_GLOBALSINDEX);
  save_registry(state, &globals_key, -1);
  lua_pop(state, 1);
  clear_global(state, "loadfile"); clear_global(state, "package");
  clear_global(state, "io"); clear_global(state, "os"); clear_global(state, "debug");
  lua_pushcfunction(state, host_trim);
  save_registry(state, &trim_key, -1);
  lua_setglobal(state, "Trim");

  lua_newtable(state);
  set_function(state, "GetOpenLinkData", host_get_open);
  set_function(state, "GetSharedData", host_get_shared);
  set_function(state, "GetItemCodeInfo", host_get_item);
  set_function(state, "MsgBoxEx", host_message);
  set_function(state, "Toast", host_toast);
  set_function(state, "SendReturnToParent", host_return);
  set_function(state, "CloseForm", host_close);
  save_members(state, -1, form_members,
               sizeof(form_members) / sizeof(form_members[0]),
               &form_members_key);
  lua_newtable(state); set_function(state, "__index", deny_member);
  set_function(state, "__newindex", deny_member); protect_metatable(state);
  save_registry(state, &form_metatable_key, -1);
  lua_setmetatable(state, -2);
  save_registry(state, &form_key, -1);
  lua_setglobal(state, "Form");

  lua_newtable(state);
  set_function(state, "RequestTranData", host_request);
  set_function(state, "RequestRealData", host_request_realtime);
  set_function(state, "CancelRealData", host_cancel_realtime);
  set_function(state, "SetDataValue", host_set_data);
  set_function(state, "GetDataCount", host_get_count);
  set_function(state, "GetDataValue", host_get_value);
  save_members(state, -1, datamanager_members,
               sizeof(datamanager_members) / sizeof(datamanager_members[0]),
               &datamanager_members_key);
  lua_newtable(state); set_function(state, "__index", deny_member);
  set_function(state, "__newindex", deny_member); protect_metatable(state);
  save_registry(state, &datamanager_metatable_key, -1);
  lua_setmetatable(state, -2);
  save_registry(state, &datamanager_key, -1);
  lua_setglobal(state, "DATAMANAGER");

  lua_pushcfunction(state, runtime_dofile);
  save_registry(state, &dofile_key, -1);
  lua_setglobal(state, "dofile");
  luaL_newmetatable(state, "AllNewMTS.Control");
  set_function(state, "__index", control_index);
  set_function(state, "__newindex", control_newindex);
  protect_metatable(state);
  save_registry(state, &control_metatable_key, -1);
  lua_pop(state, 1);

  lua_newtable(state);
  save_registry(state, &controls_key, -1);
  lua_pop(state, 1);

  count = allnewmts_runtime_lua_control_count(runtime);
  for (index = 0; index < count; ++index) {
    const char *id = NULL;
    size_t id_size = 0;
    AllNewMTSLuaControlRef *control;
    if (!allnewmts_runtime_lua_control(runtime, index, &id, &id_size))
      return luaL_error(state, "RESOURCE_LIMIT");
    lua_pushlstring(state, id, id_size);
    lua_gettable(state, LUA_GLOBALSINDEX);
    if (!lua_isnil(state, -1)) return luaL_error(state, "HOST_LOOKUP_MISS");
    lua_pop(state, 1);
    control = (AllNewMTSLuaControlRef *)lua_newuserdata(state, sizeof(*control));
    control->runtime = runtime; control->id = id; control->id_size = id_size;
    luaL_getmetatable(state, "AllNewMTS.Control");
    lua_setmetatable(state, -2);

    push_registry(state, &controls_key);
    lua_pushlstring(state, id, id_size);
    lua_pushvalue(state, -3);
    lua_rawset(state, -3);
    lua_pop(state, 1);

    lua_pushlstring(state, id, id_size);
    lua_pushvalue(state, -2);
    lua_rawset(state, LUA_GLOBALSINDEX);
    lua_pop(state, 1);
  }
  return 0;
}

static int runtime_dofile(lua_State *state) {
  const AllNewMTSResource *resource = NULL;
  const char *path = NULL;
  size_t path_size = 0;
  int status = allnewmts_runtime_lua_prepare_dofile(
      allnewmts_lua_runtime(state), state, &resource, &path, &path_size);
  if (status != ALLNEWMTS_LUA_OK) return fail(state, status);
  lua_pushliteral(state, "@");
  lua_pushlstring(state, path, path_size);
  lua_concat(state, 2);
  if (luaL_loadbuffer(state, (const char *)resource->bytes, resource->size,
                      lua_tostring(state, -1)) != 0)
    return lua_error(state);
  lua_remove(state, -2);
  lua_remove(state, 1);
  if (lua_pcall(state, 0, LUA_MULTRET, 0) != 0) return lua_error(state);
  return lua_gettop(state);
}

int allnewmts_lua_install(lua_State *state, void *runtime) {
  return lua_cpcall(state, install_frame, runtime);
}

static int raw_global_matches_registry(lua_State *state, const char *name,
                                       void *key) {
  int equal;
  lua_pushstring(state, name);
  lua_rawget(state, LUA_GLOBALSINDEX);
  push_registry(state, key);
  equal = lua_rawequal(state, -1, -2);
  lua_pop(state, 2);
  return equal;
}

static size_t raw_table_count(lua_State *state, int table_index) {
  size_t count = 0;
  table_index = absolute_index(state, table_index);
  lua_pushnil(state);
  while (lua_next(state, table_index) != 0) {
    ++count;
    lua_pop(state, 1);
  }
  return count;
}

static int raw_members_match(lua_State *state, int table_index, void *key) {
  int expected_index;
  table_index = absolute_index(state, table_index);
  push_registry(state, key);
  expected_index = lua_gettop(state);
  if (!lua_istable(state, expected_index) ||
      raw_table_count(state, table_index) != raw_table_count(state, expected_index)) {
    lua_pop(state, 1);
    return 0;
  }
  lua_pushnil(state);
  while (lua_next(state, expected_index) != 0) {
    int equal;
    lua_pushvalue(state, -2);
    lua_rawget(state, table_index);
    equal = lua_rawequal(state, -1, -2);
    lua_pop(state, 2);
    if (!equal) {
      lua_pop(state, 2);
      return 0;
    }
  }
  lua_pop(state, 1);
  return 1;
}

static int metatable_matches(lua_State *state, int value_index, void *key) {
  int equal;
  value_index = absolute_index(state, value_index);
  if (!lua_getmetatable(state, value_index)) return 0;
  push_registry(state, key);
  equal = lua_rawequal(state, -1, -2);
  lua_pop(state, 2);
  return equal;
}

static int host_table_valid(lua_State *state, const char *name, void *table_key,
                            void *members_key, void *metatable_key) {
  int valid;
  if (!raw_global_matches_registry(state, name, table_key)) return 0;
  lua_pushstring(state, name);
  lua_rawget(state, LUA_GLOBALSINDEX);
  valid = lua_istable(state, -1) &&
          raw_members_match(state, -1, members_key) &&
          metatable_matches(state, -1, metatable_key);
  lua_pop(state, 1);
  return valid;
}

static int validate_boundary_frame(lua_State *state) {
  void *runtime = lua_touserdata(state, 1);
  const char *absent[] = {"loadfile", "package", "io", "os", "debug"};
  size_t index, count;
  if (lua_getmetatable(state, LUA_GLOBALSINDEX))
    return luaL_error(state, "HOST_LOOKUP_MISS");
  if (!raw_global_matches_registry(state, "_G", &globals_key) ||
      !host_table_valid(state, "Form", &form_key, &form_members_key,
                        &form_metatable_key) ||
      !host_table_valid(state, "DATAMANAGER", &datamanager_key,
                        &datamanager_members_key,
                        &datamanager_metatable_key) ||
      !raw_global_matches_registry(state, "Trim", &trim_key) ||
      !raw_global_matches_registry(state, "dofile", &dofile_key))
    return luaL_error(state, "HOST_LOOKUP_MISS");
  for (index = 0; index < sizeof(absent) / sizeof(absent[0]); ++index) {
    lua_pushstring(state, absent[index]);
    lua_rawget(state, LUA_GLOBALSINDEX);
    if (!lua_isnil(state, -1)) return luaL_error(state, "HOST_LOOKUP_MISS");
    lua_pop(state, 1);
  }
  count = allnewmts_runtime_lua_control_count(runtime);
  for (index = 0; index < count; ++index) {
    const char *id = NULL;
    size_t id_size = 0;
    AllNewMTSLuaControlRef *control;
    if (!allnewmts_runtime_lua_control(runtime, index, &id, &id_size))
      return luaL_error(state, "RESOURCE_LIMIT");
    push_registry(state, &controls_key);
    lua_pushlstring(state, id, id_size);
    lua_rawget(state, -2);
    lua_pushlstring(state, id, id_size);
    lua_rawget(state, LUA_GLOBALSINDEX);
    control = (AllNewMTSLuaControlRef *)lua_touserdata(state, -1);
    if (!lua_rawequal(state, -1, -2) || lua_type(state, -1) != LUA_TUSERDATA ||
        lua_objlen(state, -1) != sizeof(*control) || !control ||
        control->runtime != runtime || control->id_size != id_size ||
        memcmp(control->id, id, id_size) != 0 ||
        !metatable_matches(state, -1, &control_metatable_key))
      return luaL_error(state, "HOST_LOOKUP_MISS");
    lua_pop(state, 3);
  }
  return 0;
}

int allnewmts_lua_validate_boundary(lua_State *state, void *runtime) {
  return lua_cpcall(state, validate_boundary_frame, runtime);
}

typedef struct {
  void *runtime;
  const AllNewMTSResource *resource;
  const char *path;
  size_t path_size;
} Load;

static int load_frame(lua_State *state) {
  Load *load = (Load *)lua_touserdata(state, 1);
  lua_settop(state, 0);
  lua_pushliteral(state, "@");
  lua_pushlstring(state, load->path, load->path_size);
  lua_concat(state, 2);
  if (luaL_loadbuffer(state, (const char *)load->resource->bytes,
                      load->resource->size, lua_tostring(state, -1)) != 0)
    return lua_error(state);
  lua_remove(state, 1);
  return lua_pcall(state, 0, 0, 0) == 0 ? 0 : lua_error(state);
}

int allnewmts_lua_load_entry(lua_State *state, void *runtime,
                            const AllNewMTSResource *resource,
                            const char *path, size_t path_size) {
  Load load = {runtime, resource, path, path_size};
  return lua_cpcall(state, load_frame, &load);
}

static int invoke_frame(lua_State *state) {
  AllNewMTSLuaInvocation *call =
      (AllNewMTSLuaInvocation *)lua_touserdata(state, 1);
  size_t index, count;
  AllNewMTSLuaValue values[3] = {{0}};
  lua_settop(state, 0);
  lua_pushlstring(state, call->handler, call->handler_size);
  lua_gettable(state, LUA_GLOBALSINDEX);
  if (lua_isnil(state, -1)) return 0;
  if (!lua_isfunction(state, -1)) return luaL_error(state, "HOST_LOOKUP_MISS");
  count = allnewmts_runtime_lua_argument_count(call->event);
  for (index = 0; index < count; ++index) {
    if (!allnewmts_runtime_lua_argument(call->event, index, &values[0]))
      return luaL_error(state, "RESOURCE_LIMIT");
    push_value(state, &values[0]);
  }
  if (allnewmts_runtime_lua_event_strings(call->event, values)) {
    int amount = allnewmts_runtime_lua_event_kind(call->event) == 2 ? 3 : 1;
    int i;
    for (i = 0; i < amount; ++i) push_value(state, &values[i]);
    count += (size_t)amount;
  }
  return lua_pcall(state, (int)count, 0, 0) == 0 ? 0 : lua_error(state);
}

int allnewmts_lua_call_handler(lua_State *state,
                              const AllNewMTSLuaInvocation *invocation) {
  return lua_cpcall(state, invoke_frame, (void *)invocation);
}

static void budget_hook(lua_State *state, lua_Debug *debug) {
  (void)debug;
  if (allnewmts_runtime_lua_budget_expired(allnewmts_lua_runtime(state)))
    luaL_error(state, "EXECUTION_TIMEOUT");
}

void allnewmts_lua_set_budget_hook(lua_State *state, int instruction_interval) {
  lua_sethook(state, budget_hook, LUA_MASKCOUNT, instruction_interval);
}

void allnewmts_lua_clear_budget_hook(lua_State *state) {
  lua_sethook(state, NULL, 0, 0);
}
