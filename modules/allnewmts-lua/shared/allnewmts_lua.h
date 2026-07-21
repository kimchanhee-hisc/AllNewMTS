#ifndef ALLNEWMTS_LUA_H
#define ALLNEWMTS_LUA_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct AllNewMTSLua AllNewMTSLua;

AllNewMTSLua *allnewmts_lua_create(void);
int allnewmts_lua_evaluate(AllNewMTSLua *runtime, const char *source,
                           char *result, size_t result_size,
                           char *error, size_t error_size);
void allnewmts_lua_destroy(AllNewMTSLua *runtime);

#ifdef __cplusplus
}
#endif

#endif
