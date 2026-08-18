use serde::Serialize;
use std::path::Path;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uiautomation::patterns::UIValuePattern;
use uiautomation::types::{ControlType, Handle};
use uiautomation::UIAutomation;
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WindowContext {
    pub app_name: String,
    pub window_title: String,
    pub url: String,
}

impl WindowContext {
    fn empty() -> Self {
        Self {
            app_name: String::new(),
            window_title: String::new(),
            url: String::new(),
        }
    }
}

pub fn start(app: AppHandle) {
    thread::spawn(move || {
        let mut last = WindowContext::empty();
        loop {
            let context = get_active_window_context();
            if context != last {
                let _ = app.emit("window-context-changed", &context);
                last = context;
            }
            thread::sleep(Duration::from_secs(1));
        }
    });
}

pub fn get_active_window_context() -> WindowContext {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() {
        return WindowContext::empty();
    }

    let window_title = window_title(hwnd);
    let app_name = process_app_name(hwnd).unwrap_or_else(|| {
        if window_title.is_empty() {
            "Unknown".to_string()
        } else {
            window_title.clone()
        }
    });

    let url = if is_chromium_browser(&window_title, &app_name) {
        browser_address_bar(hwnd).unwrap_or_default()
    } else {
        String::new()
    };

    WindowContext {
        app_name,
        window_title,
        url,
    }
}

fn window_title(hwnd: HWND) -> String {
    let mut buf = [0u16; 512];
    let len = unsafe { GetWindowTextW(hwnd, &mut buf) };
    if len <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..len as usize])
}

fn process_app_name(hwnd: HWND) -> Option<String> {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return None;
    }

    let handle =
        unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut buf = [0u16; 260];
    let mut size = buf.len() as u32;
    let result = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut size,
        )
    };
    let _ = unsafe { CloseHandle(handle) };
    result.ok()?;

    let path = String::from_utf16_lossy(&buf[..size as usize]);
    let stem = Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&path);
    Some(friendly_app_name(stem))
}

fn friendly_app_name(exe_stem: &str) -> String {
    match exe_stem.to_ascii_lowercase().as_str() {
        "chrome" => "Google Chrome".into(),
        "msedge" => "Microsoft Edge".into(),
        "brave" => "Brave".into(),
        "opera" => "Opera".into(),
        "vivaldi" => "Vivaldi".into(),
        "chromium" => "Chromium".into(),
        "code" => "Visual Studio Code".into(),
        "devenv" => "Visual Studio".into(),
        "explorer" => "File Explorer".into(),
        _ => exe_stem.to_string(),
    }
}

fn is_chromium_browser(title: &str, app_name: &str) -> bool {
    let title_l = title.to_ascii_lowercase();
    let app_l = app_name.to_ascii_lowercase();
    title_l.ends_with("- google chrome")
        || title_l.ends_with("- microsoft edge")
        || title_l.ends_with("- brave")
        || title_l.ends_with("- opera")
        || title_l.ends_with("- vivaldi")
        || matches!(
            app_l.as_str(),
            "google chrome" | "microsoft edge" | "brave" | "opera" | "vivaldi" | "chromium"
        )
}

fn browser_address_bar(hwnd: HWND) -> Option<String> {
    let automation = UIAutomation::new().ok()?;
    let root = automation
        .element_from_handle(Handle::from(hwnd.0 as isize))
        .ok()?;

    if let Some(value) = match_edit_value(&automation, &root, Some("Address")) {
        return Some(value);
    }
    if let Some(value) = match_edit_value(&automation, &root, Some("Search bar")) {
        return Some(value);
    }

    let edits = automation
        .create_matcher()
        .from_ref(&root)
        .control_type(ControlType::Edit)
        .depth(12)
        .timeout(0)
        .find_all()
        .ok()?;

    for edit in edits {
        if let Some(value) = element_value(&edit) {
            if looks_like_url(&value) {
                return Some(value);
            }
        }
    }
    None
}

fn match_edit_value(
    automation: &UIAutomation,
    root: &uiautomation::UIElement,
    name_fragment: Option<&str>,
) -> Option<String> {
    let mut matcher = automation
        .create_matcher()
        .from_ref(root)
        .control_type(ControlType::Edit)
        .depth(12)
        .timeout(0);

    if let Some(fragment) = name_fragment {
        matcher = matcher.contains_name(fragment);
    }

    let edit = matcher.find_first().ok()?;
    element_value(&edit).filter(|value| !value.is_empty())
}

fn element_value(element: &uiautomation::UIElement) -> Option<String> {
    element
        .get_pattern::<UIValuePattern>()
        .ok()?
        .get_value()
        .ok()
}

fn looks_like_url(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.contains("://")
        || trimmed.starts_with("www.")
        || trimmed.contains('.') && !trimmed.contains(' ')
}
