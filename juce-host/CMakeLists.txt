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
    Source/Mixer.cpp
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

# ----------------------------------------------------------------------------
# Headless test / benchmark targets (CI only; OFF by default so normal and
# release builds stay lean and untouched). They drive the AudioEngine render
# path directly — no GUI, no WebView, no live audio device — via tests/.
#
#   ZD_RT_SANITIZE   -> rt_check     : clang RealtimeSanitizer (needs clang>=20)
#   ZD_BUILD_SANITIZE-> engine_check : ASan / UBSan / TSan (pick via ZD_SANITIZER;
#                                      ZD_SANITIZER=none builds a plain console app,
#                                      handy for a local MSVC compile/smoke check)
#   ZD_BUILD_BENCH   -> perf_bench   : nanobench micro-benchmark (added in perf PR)
# ----------------------------------------------------------------------------
option(ZD_RT_SANITIZE    "Build rt_check under clang RealtimeSanitizer (needs clang>=20)" OFF)
option(ZD_BUILD_SANITIZE "Build engine_check under a sanitizer (see ZD_SANITIZER)"        OFF)
set(ZD_SANITIZER "address" CACHE STRING "Sanitizer for ZD_BUILD_SANITIZE: address | undefined | thread | none")

# Engine sources a headless driver needs (no GUI / WebView / EngineController).
# The supporting types (GroupBus/DeviceRack/AutomationStore/TrackSynth/...) are
# header-only and compile inline.
set(ZD_ENGINE_SOURCES
    Source/AudioEngine.cpp
    Source/Mixer.cpp
    Source/MasterBus.cpp
    Source/TrackChannel.cpp)

# Wire a console target to the engine: JUCE header, modules, defines, includes.
# (No WebView, no plugin-format hosting — the harness loads no plugins.)
function(zd_configure_engine_console target)
    set_target_properties(${target} PROPERTIES EXCLUDE_FROM_ALL TRUE)
    target_include_directories(${target} PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/Source
        ${CMAKE_CURRENT_SOURCE_DIR}/tests)
    target_compile_definitions(${target} PRIVATE
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_PLUGINHOST_VST3=0
        JUCE_PLUGINHOST_AU=0
        JUCE_PLUGINHOST_VST=0
        JUCE_PLUGINHOST_LV2=0)
    target_link_libraries(${target} PRIVATE
        juce::juce_audio_utils
        juce::juce_audio_processors
        juce::juce_gui_extra
        juce::juce_recommended_config_flags)
    juce_generate_juce_header(${target})
endfunction()

if(ZD_RT_SANITIZE)
    juce_add_console_app(rt_check PRODUCT_NAME "rt_check")
    target_sources(rt_check PRIVATE tests/rt_check.cpp ${ZD_ENGINE_SOURCES})
    zd_configure_engine_console(rt_check)
    # CMake passes the brackets through fine inside the quoted define.
    target_compile_definitions(rt_check PRIVATE "ZD_RT_NONBLOCKING=[[clang::nonblocking]]")
    target_compile_options(rt_check PRIVATE -fsanitize=realtime)
    target_link_options   (rt_check PRIVATE -fsanitize=realtime)
endif()

if(ZD_BUILD_SANITIZE)
    juce_add_console_app(engine_check PRODUCT_NAME "engine_check")
    target_sources(engine_check PRIVATE tests/rt_check.cpp ${ZD_ENGINE_SOURCES})
    zd_configure_engine_console(engine_check)
    if(NOT ZD_SANITIZER STREQUAL "none")
        target_compile_options(engine_check PRIVATE -fsanitize=${ZD_SANITIZER} -fno-omit-frame-pointer -g)
        target_link_options   (engine_check PRIVATE -fsanitize=${ZD_SANITIZER})
        if(ZD_SANITIZER STREQUAL "thread")
            # Spin a control thread so TSan has cross-thread access to inspect.
            target_compile_definitions(engine_check PRIVATE ZD_CONCURRENT_CONTROL=1)
        endif()
    endif()
endif()

option(ZD_BUILD_BENCH "Build the perf_bench micro-benchmark (fetches nanobench)" OFF)

if(ZD_BUILD_BENCH)
    include(FetchContent)
    FetchContent_Declare(nanobench
        GIT_REPOSITORY https://github.com/martinus/nanobench.git
        GIT_TAG        v4.3.11
        GIT_SHALLOW    TRUE)
    FetchContent_MakeAvailable(nanobench)

    juce_add_console_app(perf_bench PRODUCT_NAME "perf_bench")
    target_sources(perf_bench PRIVATE tests/perf_bench.cpp ${ZD_ENGINE_SOURCES})
    zd_configure_engine_console(perf_bench)
    # perf_bench.cpp defines ANKERL_NANOBENCH_IMPLEMENT itself, so just add the
    # header include dir — do NOT link the nanobench library target (duplicate symbols).
    target_include_directories(perf_bench PRIVATE ${nanobench_SOURCE_DIR}/src/include)
endif()
