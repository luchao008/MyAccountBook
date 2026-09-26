#!/usr/bin/env ruby
# 生成 MyAccountBook.xcodeproj —— 由 xcodeproj gem 驱动
# 用法：ruby generate_project.rb
require 'xcodeproj'
require 'fileutils'

ROOT = File.expand_path(__dir__)
SRC_ROOT = File.join(ROOT, 'MyAccountBook')
TESTS_NAME = 'MyAccountBookTests'
TESTS_ROOT = File.join(ROOT, TESTS_NAME)
PROJECT_PATH = File.join(ROOT, 'MyAccountBook.xcodeproj')
APP_NAME = 'MyAccountBook'
BUNDLE_ID = 'com.luchao.MyAccountBook'
DEPLOYMENT_TARGET = '17.0'

# 删除旧工程
FileUtils.rm_rf(PROJECT_PATH)

project = Xcodeproj::Project.new(PROJECT_PATH)
# Xcode 26 需要较新的工程格式，objectVersion 46 / Xcode 3.2 会被判为「平台为空」
project.root_object.compatibility_version = 'Xcode 14.0'
target = project.new_target(:application, APP_NAME, :ios, DEPLOYMENT_TARGET)

# 工程级（project 级）也补上平台配置 —— 只写在 target 级不够
project.build_configurations.each do |config|
  config.build_settings['SDKROOT'] = 'iphoneos'
  config.build_settings['SUPPORTED_PLATFORMS'] = 'iphoneos iphonesimulator'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
end

# —— 源码文件（.m / .mm）——
sources = Dir.glob(File.join(SRC_ROOT, '**', '*.m')) + Dir.glob(File.join(SRC_ROOT, '**', '*.mm'))
# —— 头文件 ——
headers = Dir.glob(File.join(SRC_ROOT, '**', '*.h'))
# —— 资源 ——
# Assets.xcassets 作为普通引用；cat-icons 作为 folder reference（整个目录进 bundle）
resources = [File.join(SRC_ROOT, 'Resources', 'Assets.xcassets')]
folder_resources = [
  File.join(SRC_ROOT, 'Resources', 'cat-icons'),
  File.join(SRC_ROOT, 'Resources', 'color-icons')
]

# 分组：按目录结构创建 group
def add_files(project, target, files, group_name, phase)
  return if files.empty?
  group = project.main_group.new_group(group_name)
  files.each do |f|
    ref = group.new_reference(f)
    target.add_file_references([ref]) if phase == :sources
  end
end

sources.each do |f|
  rel = f.sub(SRC_ROOT + '/', '')
  dir = File.dirname(rel)
  group = project.main_group.find_subpath(dir, true)
  ref = group.new_reference(f)
  target.add_file_references([ref])
end

headers.each do |f|
  rel = f.sub(SRC_ROOT + '/', '')
  dir = File.dirname(rel)
  group = project.main_group.find_subpath(dir, true)
  group.new_reference(f)
end

# 资源加到 Resources phase
resources.each do |res|
  next unless File.exist?(res)
  rel = res.sub(SRC_ROOT + '/', '')
  group = project.main_group.find_subpath(File.dirname(rel), true)
  ref = group.new_reference(res)
  target.add_resources([ref])
end

# cat-icons：逐个 PNG 添加为资源（folder reference 在本项目会报错）
folder_resources.each do |res|
  next unless File.exist?(res)
  rel = res.sub(SRC_ROOT + '/', '')
  group = project.main_group.find_subpath(File.dirname(rel), true)
  Dir.glob(File.join(res, '*.png')).sort.each do |png|
    ref = group.new_reference(png)
    target.add_resources([ref])
  end
end

# —— Build Settings ——
target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_ID
  config.build_settings['INFOPLIST_FILE'] = 'MyAccountBook/Resources/Info.plist'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
  config.build_settings['CLANG_ENABLE_OBJC_ARC'] = 'YES'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  config.build_settings['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
  config.build_settings['GCC_PREFIX_HEADER'] = ''
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['HEADER_SEARCH_PATHS'] = '$(inherited) "$(SRCROOT)/MyAccountBook/**"'
  config.build_settings['SDKROOT'] = 'iphoneos'
  config.build_settings['SUPPORTED_PLATFORMS'] = 'iphoneos iphonesimulator'
  config.build_settings['SUPPORTS_MACCATALYST'] = 'NO'
  # ⚠️ 关掉「debug dylib + stub 可执行文件」拆分（Xcode 16 起 App target 的默认行为）。
  #    开着的话 `.app/MyAccountBook` 是个**最后才构建**的 stub，而测试 bundle 的
  #    BUNDLE_LOADER 正好指向它 → 并行构建时**偶发** `ld: library ... not found`
  #    （实测：先在干净产物上失败一次，重建就好了 —— 典型的时序竞争）。
  #    我们不用 SwiftUI 预览，没有保留它的理由。
  config.build_settings['ENABLE_DEBUG_DYLIB'] = 'NO'
end

# —— 单元测试 target（XCTest）——
# 用 TEST_HOST 跑在 App 里：这样测试能拿到 App 的全部符号（含 CocoaPods 的），
# 不需要为测试单独再链一遍依赖。
test_target = project.new_target(:unit_test_bundle, TESTS_NAME, :ios, DEPLOYMENT_TARGET)

# ⚠️ **必须显式声明依赖**。`BUNDLE_LOADER` 只是个**路径**，不会让 Xcode 先构建 App ——
#    没有这行时两个 target 的构建顺序是听天由命的，干净构建下会偶发
#    `ld: library '.../MyAccountBook.app/MyAccountBook' not found`
#    （实测：先失败一次、直接重跑又好了 —— 典型的时序竞争）。
test_target.add_dependency(target)
test_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID}Tests"
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
  config.build_settings['CLANG_ENABLE_OBJC_ARC'] = 'YES'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['SDKROOT'] = 'iphoneos'
  config.build_settings['SUPPORTED_PLATFORMS'] = 'iphoneos iphonesimulator'
  # 测试要 import 被测代码的头文件
  config.build_settings['HEADER_SEARCH_PATHS'] = '$(inherited) "$(SRCROOT)/MyAccountBook/**"'
  # iOS 的 App 可执行文件就在 .app 根下（没有 Contents/MacOS 这一层）
  config.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/MyAccountBook.app/MyAccountBook'
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  # 不手写 Info.plist，让 Xcode 生成
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
end

test_sources = Dir.glob(File.join(TESTS_ROOT, '**', '*.m'))
test_group = project.main_group.new_group(TESTS_NAME)
test_sources.each do |f|
  ref = test_group.new_reference(f)
  test_target.add_file_references([ref])
end

project.save

# objectVersion 46 太旧，Xcode 26 无法识别平台；提升为 56（Xcode 14 格式）
pbxproj_path = File.join(PROJECT_PATH, 'project.pbxproj')
content = File.read(pbxproj_path)
content = content.gsub('objectVersion = 46;', 'objectVersion = 56;')
File.write(pbxproj_path, content)


# 用 xcodeproj 的 scheme API 生成共享 scheme
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.set_launch_target(target)
scheme.add_test_target(test_target)
scheme.save_as(PROJECT_PATH, APP_NAME, true)

puts "✅ 生成工程: #{PROJECT_PATH}"
puts "   源文件: #{sources.size} 个"
puts "   头文件: #{headers.size} 个"
puts "   资源: #{resources.size} 个"
puts "   测试: #{test_sources.size} 个"
