use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("chronoward-tracking")
        .setup(|_app, api| {
            #[cfg(target_os = "android")]
            {
                api.register_android_plugin("com.chronoward.tracking", "TrackingPlugin")?;
            }
            let _ = api;
            Ok(())
        })
        .build()
}
