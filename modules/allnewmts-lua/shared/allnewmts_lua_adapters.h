#ifndef ALLNEWMTS_LUA_ADAPTERS_H
#define ALLNEWMTS_LUA_ADAPTERS_H

#include "allnewmts_lua.h"

#ifdef __cplusplus
extern "C" {
#endif

AllNewMTSLua *allnewmts_lua_ios_create(void);
int allnewmts_lua_ios_evaluate(AllNewMTSLua *runtime, const char *source,
                               char *result, size_t result_size,
                               char *error, size_t error_size);
void allnewmts_lua_ios_destroy(AllNewMTSLua *runtime);

AllNewMTSLua *allnewmts_lua_android_create(void);
int allnewmts_lua_android_evaluate(AllNewMTSLua *runtime, const char *source,
                                   char *result, size_t result_size,
                                   char *error, size_t error_size);
void allnewmts_lua_android_destroy(AllNewMTSLua *runtime);

#ifdef __cplusplus
}
#endif

#endif
