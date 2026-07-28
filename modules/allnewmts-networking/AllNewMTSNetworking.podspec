require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
product_config = JSON.parse(File.read(File.join(__dir__, '..', '..', 'config', 'product-config.json')))
ios_channel_detail = product_config.dig('platforms', 'ios', 'mciChannelDetail')
raise 'invalid iOS product config' unless product_config['environment'] == 'beta' && ios_channel_detail&.match?(/\ACC[0-9]{3}\z/)

Pod::Spec.new do |s|
  s.name = 'AllNewMTSNetworking'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'AllNewMTS'
  s.homepage = 'https://allnewmts.invalid/'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = [
    'shared/allnewmts_mci*.{cpp,h}',
    'shared/allnewmts_networking_sha256.c',
    'shared/allnewmts_product_config.{cpp,h}',
    'shared/allnewmts_product_mci.{cpp,h}',
    'shared/allnewmts_rest_auth.{cpp,h}',
    'ios/*.swift'
  ]
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) ALLNEWMTS_SHA256_NAME=allnewmts_networking_sha256 ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL=\"' + ios_channel_detail + '\"',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/shared" "${PODS_TARGET_SRCROOT}/../../native/common"'
  }
end
