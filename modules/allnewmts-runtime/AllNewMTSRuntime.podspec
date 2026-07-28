require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
manifest = JSON.parse(File.read(File.join(__dir__, '..', '..', 'native', 'lua-source-manifest.json')))

Pod::Spec.new do |s|
  s.name = 'AllNewMTSRuntime'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'AllNewMTS'
  s.homepage = 'https://www.lua.org/'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  lua_sources = manifest['compiledSources'].map { |path| File.join('vendor', 'lua-5.1.5', path) }
  production_sources = [
    'shared/allnewmts_runtime*.{c,cpp,h}',
    'shared/resource_bundle.{c,h}',
    'vendor/lua-5.1.5/src/*.h',
    'ios/AllNewMTSRuntime*.{h,mm,swift}',
    'ios/allnewmts_runtime_ios_adapter.c'
  ]
  verification_sources = ENV['EXPO_PUBLIC_NATIVE_HARNESS'] == '1' ? [
    'shared/allnewmts_lua.{c,h}',
    'shared/allnewmts_lua_adapters.h',
    'ios/AllNewMTSLua*.{h,mm,swift}',
    'ios/allnewmts_lua_ios_adapter.c'
  ] : []
  s.source_files = production_sources + verification_sources + lua_sources
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) ALLNEWMTS_SHA256_NAME=allnewmts_runtime_sha256',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/shared" "${PODS_TARGET_SRCROOT}/vendor/lua-5.1.5/src" "${PODS_TARGET_SRCROOT}/../../native/common"'
  }
end
