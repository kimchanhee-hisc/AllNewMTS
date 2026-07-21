#ifndef ALLNEWMTS_RUNTIME_LUA_H
#define ALLNEWMTS_RUNTIME_LUA_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif
#include "lua.h"
#ifdef __cplusplus
}
#endif
#include "resource_bundle.h"

#ifdef __cplusplus
extern "C" {
#endif

enum {
  ALLNEWMTS_LUA_OK = 0,
  ALLNEWMTS_LUA_ARGUMENT = 1,
  ALLNEWMTS_LUA_LOOKUP = 2,
  ALLNEWMTS_LUA_LIMIT = 3,
  ALLNEWMTS_LUA_RAISE = 4
};

enum {
  ALLNEWMTS_LUA_VALUE_NONE = 0,
  ALLNEWMTS_LUA_VALUE_STRING = 1,
  ALLNEWMTS_LUA_VALUE_NUMBER = 2,
  ALLNEWMTS_LUA_VALUE_BOOLEAN = 3,
  ALLNEWMTS_LUA_VALUE_METHOD = 4
};

enum {
  ALLNEWMTS_LUA_GET_OPEN,
  ALLNEWMTS_LUA_GET_SHARED,
  ALLNEWMTS_LUA_GET_ITEM,
  ALLNEWMTS_LUA_MESSAGE,
  ALLNEWMTS_LUA_TOAST,
  ALLNEWMTS_LUA_RETURN,
  ALLNEWMTS_LUA_CLOSE,
  ALLNEWMTS_LUA_SET_DATA,
  ALLNEWMTS_LUA_GET_COUNT,
  ALLNEWMTS_LUA_GET_VALUE,
  ALLNEWMTS_LUA_TRIM
};

typedef struct {
  const char *bytes;
  size_t size;
  double number;
  int boolean;
  int kind;
} AllNewMTSLuaValue;

typedef struct {
  void *runtime;
  const char *id;
  size_t id_size;
} AllNewMTSLuaControlRef;

typedef struct {
  void *runtime;
  const void *event;
  const char *handler;
  size_t handler_size;
  int internal_close;
} AllNewMTSLuaInvocation;

void *allnewmts_lua_runtime(lua_State *state);
int allnewmts_lua_install(lua_State *state, void *runtime);
int allnewmts_lua_load_entry(lua_State *state, void *runtime,
                            const AllNewMTSResource *resource,
                            const char *path, size_t path_size);
int allnewmts_lua_call_handler(lua_State *state,
                              const AllNewMTSLuaInvocation *invocation);
int allnewmts_lua_validate_boundary(lua_State *state, void *runtime);
void allnewmts_lua_set_budget_hook(lua_State *state, int instruction_interval);
void allnewmts_lua_clear_budget_hook(lua_State *state);

size_t allnewmts_runtime_lua_control_count(void *runtime);
int allnewmts_runtime_lua_control(void *runtime, size_t index,
                                  const char **id, size_t *id_size);
int allnewmts_runtime_lua_host(void *runtime, int operation,
                              lua_State *state, AllNewMTSLuaValue *value);
int allnewmts_runtime_lua_control_call(AllNewMTSLuaControlRef *control,
                                      int operation, lua_State *state,
                                      AllNewMTSLuaValue *value);
int allnewmts_runtime_lua_prepare_request(void *runtime, lua_State *state,
                                         const char **transaction,
                                         size_t *transaction_size,
                                         uint64_t *request_token);
int allnewmts_runtime_lua_finish_request(void *runtime,
                                        const char *transaction,
                                        size_t transaction_size,
                                        uint64_t request_token,
                                        int nested_status);
int allnewmts_runtime_lua_prepare_dofile(void *runtime, lua_State *state,
                                        const AllNewMTSResource **resource,
                                        const char **path,
                                        size_t *path_size);
int allnewmts_runtime_lua_argument(const void *event, size_t index,
                                  AllNewMTSLuaValue *value);
size_t allnewmts_runtime_lua_argument_count(const void *event);
int allnewmts_runtime_lua_event_kind(const void *event);
int allnewmts_runtime_lua_event_strings(const void *event,
                                        AllNewMTSLuaValue values[3]);
int allnewmts_runtime_lua_budget_expired(void *runtime);
void allnewmts_runtime_lua_fail(void *runtime, const char *code);

#ifdef __cplusplus
}
#endif

#endif
