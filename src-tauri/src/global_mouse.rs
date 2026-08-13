//! 全局鼠标钩子：长按中键（屏幕任意位置）触发卡片系统菜单。
//! 仅 Windows 实现（WH_MOUSE_LL 低级鼠标钩子）；其它平台为 no-op。
//!
//! 钩子只负责识别“长按中键”手势，把光标物理坐标经 `card-menu-open` 事件交给前端；
//! 菜单由前端调用 `show_card_menu` 命令（Rust）弹出原生系统菜单。

use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::AppHandle;

#[cfg(target_os = "windows")]
mod imp {
    use super::*;
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL, VK_C,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, MSG, MSLLHOOKSTRUCT,
        SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, WH_MOUSE_LL,
        WM_MBUTTONDOWN, WM_MBUTTONUP,
    };

    /// 长按判定阈值：按住中键超过该时长视为触发菜单（普通中键点击不到此阈值）。
    const LONG_PRESS: Duration = Duration::from_millis(400);

    /// 向当前前台窗口发送一次 Ctrl+C，把选中文本复制进系统剪贴板。
    /// 长按中键触发菜单时调用，使词典等可读取“当前选中内容”而非剪贴板历史旧条目。
    fn send_ctrl_c() {
        let key = |vk: u16, flags: u32| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let inputs = [
            key(VK_CONTROL, 0),
            key(VK_C, 0),
            key(VK_C, KEYEVENTF_KEYUP),
            key(VK_CONTROL, KEYEVENTF_KEYUP),
        ];
        unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            );
        }
    }

    struct HookState {
        app: AppHandle,
        /// 中键按下时刻；为 None 表示当前未按住。
        press: Option<Instant>,
    }

    /// 钩子回调与消息循环同线程，仅此线程读写，用 Mutex 只是让静态状态安全。
    static STATE: Mutex<Option<HookState>> = Mutex::new(None);

    /// 低级鼠标钩子回调：ncode 为 0/正数时必须检测并调用 CallNextHookEx 放行事件。
    unsafe extern "system" fn hook_proc(n_code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
        if n_code >= 0 {
            let mut guard = STATE.lock().unwrap();
            if let Some(st) = guard.as_mut() {
                let msg = w_param as u32;
                if msg == WM_MBUTTONDOWN {
                    st.press = Some(Instant::now());
                } else if msg == WM_MBUTTONUP {
                    if let Some(start) = st.press.take() {
                        if start.elapsed() >= LONG_PRESS {
                            // 把前台窗口选中文本复制进剪贴板，供词典等读取“当前选中内容”
                            send_ctrl_c();
                            // 触发菜单：把松开时的光标物理坐标交给前端，由前端调 show_card_menu 弹出
                            let pt = *(l_param as *const MSLLHOOKSTRUCT);
                            let app = st.app.clone();
                            drop(guard);
                            let _ = app.emit("card-menu-open", (pt.pt.x, pt.pt.y));
                        }
                    }
                }
            }
        }
        CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param)
    }

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            *STATE.lock().unwrap() = Some(HookState { app, press: None });

            // 安装全局低级鼠标钩子（hmod 传 NULL + threadid 0 → 全局）
            let hook = unsafe {
                SetWindowsHookExW(WH_MOUSE_LL, Some(hook_proc), std::ptr::null_mut(), 0)
            };
            if hook.is_null() {
                return;
            }

            // 低级钩子的回调运行在安装它的线程上，需要消息泵才能被调用。
            let mut msg = MSG {
                hwnd: std::ptr::null_mut(),
                message: 0,
                wParam: 0,
                lParam: 0,
                time: 0,
                pt: POINT { x: 0, y: 0 },
            };
            while unsafe { GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) } > 0 {
                unsafe {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
            unsafe {
                UnhookWindowsHookEx(hook);
            }
        });
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::*;
    pub fn start(_app: AppHandle) {}
}

/// 启动全局鼠标钩子（幂等无关，仅调用一次）。
pub fn start(app: AppHandle) {
    imp::start(app);
}