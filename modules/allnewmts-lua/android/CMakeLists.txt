cmake_minimum_required(VERSION 3.22.1)
project(allnewmts_lua C CXX)

set(LUA_ROOT "${CMAKE_CURRENT_LIST_DIR}/../vendor/lua-5.1.5/src")
set(SHARED_ROOT "${CMAKE_CURRENT_LIST_DIR}/../shared")
set(PRODUCT_CONFIG "${CMAKE_CURRENT_LIST_DIR}/../../../config/product-config.json")
file(READ "${PRODUCT_CONFIG}" PRODUCT_CONFIG_JSON)
string(JSON PRODUCT_ENVIRONMENT GET "${PRODUCT_CONFIG_JSON}" environment)
string(JSON ANDROID_MCI_CHANNEL_DETAIL GET
  "${PRODUCT_CONFIG_JSON}" platforms android mciChannelDetail)
if(NOT PRODUCT_ENVIRONMENT STREQUAL "beta" OR
   NOT ANDROID_MCI_CHANNEL_DETAIL MATCHES "^CC[0-9][0-9][0-9]$")
  message(FATAL_ERROR "invalid Android product config")
endif()
set(LUA_SOURCES
  ${LUA_ROOT}/lapi.c
  ${LUA_ROOT}/lauxlib.c
  ${LUA_ROOT}/lbaselib.c
  ${LUA_ROOT}/lcode.c
  ${LUA_ROOT}/ldebug.c
  ${LUA_ROOT}/ldo.c
  ${LUA_ROOT}/ldump.c
  ${LUA_ROOT}/lfunc.c
  ${LUA_ROOT}/lgc.c
  ${LUA_ROOT}/llex.c
  ${LUA_ROOT}/lmathlib.c
  ${LUA_ROOT}/lmem.c
  ${LUA_ROOT}/lobject.c
  ${LUA_ROOT}/lopcodes.c
  ${LUA_ROOT}/lparser.c
  ${LUA_ROOT}/lstate.c
  ${LUA_ROOT}/lstring.c
  ${LUA_ROOT}/lstrlib.c
  ${LUA_ROOT}/ltable.c
  ${LUA_ROOT}/ltablib.c
  ${LUA_ROOT}/ltm.c
  ${LUA_ROOT}/lundump.c
  ${LUA_ROOT}/lvm.c
  ${LUA_ROOT}/lzio.c
)

add_library(allnewmts_lua51 STATIC ${LUA_SOURCES})
set_target_properties(allnewmts_lua51 PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_include_directories(allnewmts_lua51 PUBLIC ${LUA_ROOT})
# Lua 5.1 trailing TString storage conflicts with Bionic BOS=0 checks; keep this compatibility opt-out vendor-only.
target_compile_options(allnewmts_lua51 PRIVATE -U_FORTIFY_SOURCE)

add_library(allnewmts_lua SHARED
  ${SHARED_ROOT}/allnewmts_mci.cpp
  ${SHARED_ROOT}/allnewmts_mci_socket.cpp
  ${SHARED_ROOT}/allnewmts_product_config.cpp
  ${SHARED_ROOT}/allnewmts_rest_auth.cpp
  ${SHARED_ROOT}/allnewmts_runtime.cpp
  ${SHARED_ROOT}/allnewmts_runtime_lua.c
  ${SHARED_ROOT}/allnewmts_runtime_adapters.c
  ${SHARED_ROOT}/resource_bundle.c
  ${SHARED_ROOT}/sha256.c
  allnewmts_runtime_android_adapter.c
  runtime_jni.cpp
)

if(DEFINED ENV{EXPO_PUBLIC_NATIVE_HARNESS} AND "$ENV{EXPO_PUBLIC_NATIVE_HARNESS}" STREQUAL "1")
  target_sources(allnewmts_lua PRIVATE
    ${SHARED_ROOT}/allnewmts_lua.c
    allnewmts_lua_android_adapter.c
    jni.cpp
  )
endif()

target_compile_features(allnewmts_lua PRIVATE cxx_std_17)
target_compile_definitions(allnewmts_lua PRIVATE
  ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL=\"${ANDROID_MCI_CHANNEL_DETAIL}\")
target_include_directories(allnewmts_lua PRIVATE ${LUA_ROOT} ${SHARED_ROOT})
target_link_libraries(allnewmts_lua allnewmts_lua51 log m)
