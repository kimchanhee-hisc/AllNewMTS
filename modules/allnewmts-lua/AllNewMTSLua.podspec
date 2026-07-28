require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
manifest = JSON.parse(File.read(File.join(__dir__, '..', '..', 'native', 'lua-source-manifest.json')))
product_config = JSON.parse(File.read(File.join(__dir__, '..', '..', 'config', 'product-config.json')))
ios_channel_detail = product_config.dig('platforms', 'ios', 'mciChannelDetail')
raise 'invalid iOS product config' unless product_config['environment'] == 'beta' && ios_channel_detail&.match?(/\ACC[0-9]{3}\z/)

Pod::Spec.new do |s|
  s.name = 'AllNewMTSLua'
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
    'shared/allnewmts_mci*.{cpp,h}',
    'shared/allnewmts_product_config.{cpp,h}',
    'shared/allnewmts_rest_auth.{cpp,h}',
    'shared/allnewmts_runtime*.{c,cpp,h}',
    'shared/resource_bundle.{c,h}',
    'shared/sha256.{c,h}',
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
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL=\"' + ios_channel_detail + '\"',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/shared" "${PODS_TARGET_SRCROOT}/vendor/lua-5.1.5/src"'
  }
end
