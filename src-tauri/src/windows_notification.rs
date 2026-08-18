use std::sync::{Mutex, Once};
use tauri::{AppHandle, Emitter};
use windows::core::{w, IInspectable, Interface, HSTRING};
use windows::Data::Xml::Dom::XmlDocument;
use windows::Foundation::TypedEventHandler;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyW, RegSetValueExW, HKEY_CURRENT_USER, REG_SZ,
};
use windows::Win32::System::SystemInformation::GetLocalTime;
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
use windows::UI::Notifications::{
    ToastActivatedEventArgs, ToastNotification, ToastNotificationManager, ToastNotifier,
};

const AUMID: &str = "com.chronoward.app";
const TOAST_TAG: &str = "timer";
const TOAST_GROUP: &str = "chronoward";

struct ActiveToast {
    notifier: ToastNotifier,
    notification: ToastNotification,
}

static ACTIVE: Mutex<Option<ActiveToast>> = Mutex::new(None);

fn active_lock() -> std::sync::MutexGuard<'static, Option<ActiveToast>> {
    ACTIVE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn ensure_identity() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = unsafe { SetCurrentProcessExplicitAppUserModelID(w!("com.chronoward.app")) };
        register_aumid_display_name();
    });
}

fn register_aumid_display_name() {
    let mut hkey = windows::Win32::System::Registry::HKEY::default();
    let created = unsafe {
        RegCreateKeyW(
            HKEY_CURRENT_USER,
            w!("Software\\Classes\\AppUserModelId\\com.chronoward.app"),
            &mut hkey,
        )
    };
    if created != ERROR_SUCCESS {
        return;
    }

    let display: Vec<u16> = "Chronoward\0".encode_utf16().collect();
    let bytes =
        unsafe { std::slice::from_raw_parts(display.as_ptr() as *const u8, display.len() * 2) };
    unsafe {
        let _ = RegSetValueExW(hkey, w!("DisplayName"), None, REG_SZ, Some(bytes));
        let _ = RegCloseKey(hkey);
    }
}

fn xml_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

fn session_title(session_type: &str) -> String {
    match session_type {
        "work" => "ChronoWard - Focus Session".to_string(),
        "shortBreak" | "short_break" => "ChronoWard - Short Break".to_string(),
        "longBreak" | "long_break" => "ChronoWard - Long Break".to_string(),
        other => format!("ChronoWard - {other}"),
    }
}

fn format_end_time(remaining_seconds: u64) -> String {
    let now = unsafe { GetLocalTime() };
    let total = u64::from(now.wHour) * 3600
        + u64::from(now.wMinute) * 60
        + u64::from(now.wSecond)
        + remaining_seconds;
    let secs = total % 86_400;
    let hour = (secs / 3600) as u32;
    let minute = ((secs % 3600) / 60) as u32;
    let (hour12, suffix) = match hour {
        0 => (12, "AM"),
        1..=11 => (hour, "AM"),
        12 => (12, "PM"),
        _ => (hour - 12, "PM"),
    };
    format!("{hour12}:{minute:02} {suffix}")
}

fn toast_body(remaining_seconds: u64, is_paused: bool) -> String {
    let end = format_end_time(remaining_seconds);
    if is_paused {
        format!("Paused · ends at {end}")
    } else {
        format!("Ends at {end}")
    }
}

fn build_toast_xml(session_type: &str, remaining_seconds: u64, is_paused: bool) -> String {
    let title = xml_escape(&session_title(session_type));
    let body = xml_escape(&toast_body(remaining_seconds, is_paused));
    format!(
        r#"<toast duration="long">
  <visual>
    <binding template="ToastGeneric">
      <text>{title}</text>
      <text>{body}</text>
    </binding>
  </visual>
  <actions>
    <action content="Pause" arguments="pause" activationType="background"/>
    <action content="Skip" arguments="skip" activationType="background"/>
    <action content="+5 Min" arguments="add_5m" activationType="background"/>
  </actions>
</toast>"#
    )
}

fn action_from_inspectable(insp: &Option<IInspectable>) -> Option<String> {
    let insp = insp.as_ref()?;
    let args = insp.cast::<ToastActivatedEventArgs>().ok()?;
    let raw = args.Arguments().ok()?.to_string();
    if raw.is_empty() {
        return None;
    }
    let name = raw
        .strip_prefix("action=")
        .unwrap_or(raw.as_str())
        .trim()
        .to_string();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

fn hide_current(state: &mut Option<ActiveToast>) {
    if let Some(prev) = state.take() {
        let _ = prev.notifier.Hide(&prev.notification);
    }
    if let Ok(history) = ToastNotificationManager::History() {
        let _ = history.RemoveGroupedTagWithId(
            &HSTRING::from(TOAST_TAG),
            &HSTRING::from(TOAST_GROUP),
            &HSTRING::from(AUMID),
        );
    }
}

/// Call once from `setup` so the process AUMID is set before the first toast.
pub fn init() {
    ensure_identity();
}

#[tauri::command]
pub fn show_windows_timer_toast(
    app: AppHandle,
    session_type: String,
    remaining_seconds: u64,
    is_paused: bool,
) -> Result<(), String> {
    ensure_identity();

    let xml = XmlDocument::new().map_err(|err| err.to_string())?;
    xml.LoadXml(&HSTRING::from(build_toast_xml(
        &session_type,
        remaining_seconds,
        is_paused,
    )))
    .map_err(|err| err.to_string())?;

    let toast = ToastNotification::CreateToastNotification(&xml).map_err(|err| err.to_string())?;
    toast
        .SetTag(&HSTRING::from(TOAST_TAG))
        .map_err(|err| err.to_string())?;
    toast
        .SetGroup(&HSTRING::from(TOAST_GROUP))
        .map_err(|err| err.to_string())?;

    let mut state = active_lock();
    if state.is_some() {
        let _ = toast.SetSuppressPopup(true);
    }

    let app_for_handler = app.clone();
    toast
        .Activated(&TypedEventHandler::new(move |_, insp| {
            if let Some(action) = action_from_inspectable(&insp) {
                let _ = app_for_handler.emit("notification-action", action);
            }
            Ok(())
        }))
        .map_err(|err| err.to_string())?;

    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(AUMID))
        .map_err(|err| err.to_string())?;

    hide_current(&mut state);
    notifier.Show(&toast).map_err(|err| err.to_string())?;
    *state = Some(ActiveToast {
        notifier,
        notification: toast,
    });
    Ok(())
}

#[tauri::command]
pub fn clear_windows_toast() -> Result<(), String> {
    let mut state = active_lock();
    hide_current(&mut state);
    Ok(())
}
