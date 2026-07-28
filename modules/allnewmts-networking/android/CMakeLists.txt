cmake_minimum_required(VERSION 3.22.1)
project(allnewmts_networking C CXX)

set(SHARED_ROOT "${CMAKE_CURRENT_LIST_DIR}/../shared")
set(COMMON_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../native/common")
set(PRODUCT_CONFIG "${CMAKE_CURRENT_LIST_DIR}/../../../config/product-config.json")
file(READ "${PRODUCT_CONFIG}" PRODUCT_CONFIG_JSON)
string(JSON PRODUCT_ENVIRONMENT GET "${PRODUCT_CONFIG_JSON}" environment)
string(JSON ANDROID_MCI_CHANNEL_DETAIL GET
  "${PRODUCT_CONFIG_JSON}" platforms android mciChannelDetail)
if(NOT PRODUCT_ENVIRONMENT STREQUAL "beta" OR
   NOT ANDROID_MCI_CHANNEL_DETAIL MATCHES "^CC[0-9][0-9][0-9]$")
  message(FATAL_ERROR "invalid Android product config")
endif()

add_library(allnewmts_networking SHARED
  ${SHARED_ROOT}/allnewmts_mci.cpp
  ${SHARED_ROOT}/allnewmts_mci_socket.cpp
  ${SHARED_ROOT}/allnewmts_product_config.cpp
  ${SHARED_ROOT}/allnewmts_product_mci.cpp
  ${SHARED_ROOT}/allnewmts_rest_auth.cpp
  networking_jni.cpp
  ${COMMON_ROOT}/sha256.c
)
target_compile_features(allnewmts_networking PRIVATE cxx_std_17)
target_compile_definitions(allnewmts_networking PRIVATE
  ALLNEWMTS_SHA256_NAME=allnewmts_networking_sha256
  ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL="${ANDROID_MCI_CHANNEL_DETAIL}")
target_include_directories(allnewmts_networking PRIVATE ${SHARED_ROOT} ${COMMON_ROOT})
target_link_libraries(allnewmts_networking log)
