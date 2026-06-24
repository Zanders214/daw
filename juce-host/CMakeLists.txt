cmake_minimum_required(VERSION 3.22)

project(ZandersDAW VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ----------------------------------------------------------------------------
# JUCE: use a local checkout if -DJUCE_PATH=/path/to/JUCE is given (fast/offline),
# otherwise fetch JUCE 8 from GitHub.
# ----------------------------------------------------------------------------
if(DEFINED JUCE_PATH)
    add_subdirectory(${JUCE_PATH} ${CMAKE_BINARY_DIR}/JUCE)
else()
    include(FetchContent)
    FetchContent_Declare(JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG        8.0.4
        GIT_SHALLOW    TRUE)
    FetchContent_MakeAvailable(JUCE)
endif()

# ----------------------------------------------------------------------------
# The application
# ----------------------------------------------------------------------------
juce_add_gui_app(ZandersDAW
    PRODUCT_NAME "Zanders DAW"
    COMPANY_NAME "Zanders"
    BUNDLE_ID    com.zanders.daw
    ICON_BIG     "${CMAKE_CURRENT_SOURCE_DIR}/../app-icon.svg"
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2    TRUE
    MICROPHONE_PERMISSION_ENABLED TRUE
    MICROPHONE_PERMISSION_TEXT "Zanders DAW uses the audio input to feed plugins.")

juce_generate_juce_header(ZandersDAW)

target_sources(ZandersDAW PRIVATE
    Source/Main.cpp
    Source/MainComponent.cpp
    Source/WebUI.cpp
    Source/EngineController.cpp
    Source/SessionManager.cpp
    Source/MasterBus.cpp
    Source/AudioEngine.cpp
    Source/TrackChannel.cpp
    Source/PluginHost.cpp
    Source/SessionStore.cpp)

# ----------------------------------------------------------------------------
# Bundle the built web UI (Vite `dist/`) as BinaryData.
# Run `npm run build` in the repo root first. In Debug builds the app loads the
# Vite dev server (localhost:1420) instead, so the bundle is optional there.
# ----------------------------------------------------------------------------
set(ZD_DIST_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../dist" CACHE PATH "Path to the built web UI (vite dist)")
file(GLOB_RECURSE ZD_WEB_FILES CONFIGURE_DEPENDS "${ZD_DIST_DIR}/*")

if(ZD_WEB_FILES)
    juce_add_binary_data(ZandersDawWeb SOURCES ${ZD_WEB_FILES})
    target_link_libraries(ZandersDAW PRIVATE ZandersDawWeb)
    target_compile_definitions(ZandersDAW PRIVATE ZD_HAS_WEB=1)
else()
    target_compile_definitions(ZandersDAW PRIVATE ZD_HAS_WEB=0)
    message(WARNING "No web UI at ${ZD_DIST_DIR}. Run `npm run build` in the repo root. "
                    "Debug builds will use the Vite dev server (localhost:1420).")
endif()

target_compile_definitions(ZandersDAW PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_AU=1      # guarded to macOS inside JUCE
    JUCE_PLUGINHOST_VST=0
    JUCE_PLUGINHOST_LV2=0
    JUCE_USE_CURL=0
    JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:ZandersDAW,JUCE_PRODUCT_NAME>"
    JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:ZandersDAW,JUCE_VERSION>")

target_link_libraries(ZandersDAW PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_gui_extra
    PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)
