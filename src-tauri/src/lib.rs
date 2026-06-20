/// Application entry point. Builds and runs the Tauri app that hosts the
/// React UI in the OS-native webview.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Zanders DAW");
}
