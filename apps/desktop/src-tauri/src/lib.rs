//! Kawase on the desktop (plan Lane C item 13): a native window around the live web app at
//! https://app.getkawase.xyz. Nothing is bundled, so the desktop app is always the current web release.
//!
//! - The window stays on the app. Sign-in pages (Google, Apple, Privy) may load in it; any other site opens in
//!   the person's browser.
//! - Pop-ups the app opens itself (the sign-in window, Buy) become child windows that share the app's session, so
//!   the opener can read their result exactly as in a browser.
//! - `kawase://…` links (the same scheme as the phone app) open the matching page in the window: `kawase://r/abc`
//!   goes to https://app.getkawase.xyz/r/abc.
//! - On macOS the title bar takes the app's background colour (Lime on Ink: ink in dark mode, paper in light) and
//!   follows the system appearance.
use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::{
    menu::Menu,
    webview::{NewWindowResponse, WebviewWindowBuilder},
    window::Color,
    AppHandle, Manager, Runtime, Theme, WebviewUrl, WebviewWindow, WindowEvent,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;

/// The deployed web app (apps/mobile's web build on Coolify).
const APP_URL: &str = "https://app.getkawase.xyz";
const MAIN_WINDOW: &str = "main";
const TITLE: &str = "Kawase";
/// Wide enough for the desktop rail layout (DOCK.railBreakpointPt = 900 in packages/config).
const DEFAULT_SIZE: (f64, f64) = (1280.0, 820.0);
/// The phone layout's narrowest comfortable width.
const MIN_SIZE: (f64, f64) = (380.0, 600.0);
/// Sign-in pages that may load inside Kawase's windows: Google's and Apple's, and Privy's own (auth.privy.io answers
/// their redirect and sends the page back to the app; D41).
const AUTH_HOSTS: &[&str] = &["accounts.google.com", "account.apple.com", "appleid.apple.com"];
const AUTH_DOMAIN_SUFFIXES: &[&str] = &[".privy.io"];
/// packages/ui-tokens: themes.dark.background and themes.light.background.
const INK: Color = Color(0x0B, 0x0C, 0x10, 0xFF);
const PAPER: Color = Color(0xF7, 0xF8, 0xF4, 0xFF);

static POPUPS: AtomicUsize = AtomicUsize::new(0);

/// Same origin as the app (scheme, host and port), so a dev build pointed at a local server works too.
fn is_app(url: &Url) -> bool {
    Url::parse(APP_URL).is_ok_and(|app| app.origin() == url.origin())
}

fn is_auth(url: &Url) -> bool {
    let Some(host) = url.host_str() else { return false };
    url.scheme() == "https"
        && (AUTH_HOSTS.contains(&host) || AUTH_DOMAIN_SUFFIXES.iter().any(|suffix| host.ends_with(suffix)))
}

/// Only web pages leave the app; blob:, data: and about: (exports, blank pop-ups) stay where the page put them.
fn is_web(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

/// `kawase://r/abc?x=1` → `https://app.getkawase.xyz/r/abc?x=1` (also `kawase:///r/abc`).
fn app_url_for(link: &Url) -> Option<Url> {
    if link.scheme() != "kawase" {
        return None;
    }
    let mut path = String::new();
    if let Some(host) = link.host_str() {
        path.push('/');
        path.push_str(host);
    }
    path.push_str(link.path());
    let mut target = Url::parse(APP_URL).ok()?;
    target.set_path(if path.is_empty() { "/" } else { &path });
    target.set_query(link.query());
    target.set_fragment(link.fragment());
    Some(target)
}

fn background_for(theme: Theme) -> Color {
    match theme {
        Theme::Light => PAPER,
        _ => INK,
    }
}

fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("kawase: could not open {url} in the browser: {error}");
    }
}

/// Shows the main window and brings it to the front.
fn reveal<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let window = app.get_webview_window(MAIN_WINDOW)?;
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Some(window)
}

fn open_links<R: Runtime>(app: &AppHandle<R>, links: Vec<Url>) {
    let Some(target) = links.iter().find_map(app_url_for) else { return };
    if let Some(window) = reveal(app) {
        if let Err(error) = window.navigate(target) {
            eprintln!("kawase: could not open the link: {error}");
        }
    }
}

/// A pop-up the app opened (sign-in, Buy): a child window sharing the app's session, so `window.opener` works.
fn popup<R: Runtime>(
    app: &AppHandle<R>,
    url: Url,
    features: tauri::webview::NewWindowFeatures,
) -> NewWindowResponse<R> {
    let label = format!("popup-{}", POPUPS.fetch_add(1, Ordering::Relaxed));
    let handle = app.clone();
    let built = WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
        .window_features(features)
        .title(TITLE)
        .on_navigation(move |next| {
            // A pop-up may move through the sign-in providers and back to the app; anything else goes to the browser.
            if !is_web(next) || is_app(next) || is_auth(next) {
                return true;
            }
            open_in_browser(&handle, next);
            false
        })
        .build();
    match built {
        Ok(window) => NewWindowResponse::Create { window },
        Err(error) => {
            eprintln!("kawase: could not open a window: {error}");
            NewWindowResponse::Deny
        }
    }
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    let url = Url::parse(APP_URL).expect("APP_URL is a valid URL");
    let navigation = app.clone();
    let opener = app.clone();
    let builder = WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::External(url))
        .title(TITLE)
        .inner_size(DEFAULT_SIZE.0, DEFAULT_SIZE.1)
        .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
        .center()
        .zoom_hotkeys_enabled(true)
        .on_navigation(move |next| {
            if !is_web(next) || is_app(next) || is_auth(next) {
                return true;
            }
            open_in_browser(&navigation, next);
            false
        })
        .on_new_window(move |url, features| {
            // `window.open()` from the app: a blank or sign-in pop-up becomes a child window; a link to anywhere else
            // (an explorer, the docs) opens in the browser.
            if !is_web(&url) || is_app(&url) || is_auth(&url) {
                return popup(&opener, url, features);
            }
            open_in_browser(&opener, &url);
            NewWindowResponse::Deny
        });
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Transparent)
        .hidden_title(true);
    let window = builder.build()?;
    let theme = window.theme().unwrap_or(Theme::Dark);
    let _ = window.set_background_color(Some(background_for(theme)));
    let themed = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::ThemeChanged(theme) = event {
            let _ = themed.set_background_color(Some(background_for(*theme)));
        }
    });
    Ok(window)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Must be the first plugin: a second launch (Windows/Linux deep links) hands its link to this window and quits.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        reveal(app);
    }));
    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        // The standard menus, so copy, paste, undo and select-all work in the page (macOS needs the Edit menu).
        .menu(Menu::default)
        .setup(|app| {
            let handle = app.handle().clone();
            main_window(&handle)?;
            // Installed builds register kawase:// themselves; a dev run on Windows/Linux registers it here.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            app.deep_link().register_all()?;
            if let Ok(Some(links)) = app.deep_link().get_current() {
                open_links(&handle, links);
            }
            let links = handle.clone();
            app.deep_link().on_open_url(move |event| open_links(&links, event.urls()));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Kawase");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_deep_links_onto_the_web_app() {
        let link = |raw: &str| app_url_for(&Url::parse(raw).unwrap()).map(|url| url.to_string());
        assert_eq!(link("kawase://r/abc?x=1").as_deref(), Some("https://app.getkawase.xyz/r/abc?x=1"));
        assert_eq!(link("kawase:///r/abc").as_deref(), Some("https://app.getkawase.xyz/r/abc"));
        assert_eq!(link("kawase://").as_deref(), Some("https://app.getkawase.xyz/"));
        assert_eq!(link("https://evil.example/r/abc"), None);
    }

    #[test]
    fn keeps_the_window_on_the_app() {
        let url = |raw: &str| Url::parse(raw).unwrap();
        assert!(is_app(&url("https://app.getkawase.xyz/send")));
        assert!(!is_app(&url("http://app.getkawase.xyz/")));
        assert!(!is_app(&url("https://app.getkawase.xyz.evil.example/")));
        assert!(is_auth(&url("https://accounts.google.com/o/oauth2/v2/auth")));
        assert!(is_auth(&url("https://auth.privy.io/api/v1/oauth/callback")));
        assert!(!is_auth(&url("https://privy.io.evil.example/")));
        assert!(!is_web(&url("blob:https://app.getkawase.xyz/123")));
    }
}
