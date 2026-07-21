require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
manifest = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'native', 'lua-source-manifest.json')))

Pod::Spec.new do |s|
  s.name = 'AllNewMTSLua'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'AllNewMTS'
  s.homepage = 'https://www.lua.org/'
  s.source = { :path => '..' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  lua_sources = manifest['compiledSources'].map { |path| File.join('..', 'vendor', 'lua-5.1.5', path) }
  s.source_files = ['../shared/*.{c,h}', '../vendor/lua-5.1.5/src/*.h', '*.{h,mm,swift}'] + lua_sources
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/../shared" "${PODS_TARGET_SRCROOT}/../vendor/lua-5.1.5/src"'
  }
end
