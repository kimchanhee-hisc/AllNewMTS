#include "allnewmts_lua_adapters.h"

AllNewMTSLua *allnewmts_lua_ios_create(void) {
  return allnewmts_lua_create();
}

int allnewmts_lua_ios_evaluate(AllNewMTSLua *runtime, const char *source,
                               char *result, size_t result_size,
                               char *error, size_t error_size) {
  return allnewmts_lua_evaluate(runtime, source, result, result_size, error, error_size);
}

void allnewmts_lua_ios_destroy(AllNewMTSLua *runtime) {
  allnewmts_lua_destroy(runtime);
}
