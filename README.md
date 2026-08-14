# Desktop Card

一个开机自启、带位置记忆、常驻最上层的桌面音频小卡片。
把音频文件拖到卡片上松开即开始播放。不占任务栏，✕ 收进系统托盘，音频不中断。

- **平台**：仅 Windows
- **技术栈**：Tauri 2 + SvelteKit (Svelte 5, SPA 静态模式) + Rust
- **策划文档**：[docs/PLAN.md](docs/PLAN.md)

## 功能（v1）

| 功能 | 说明 |
|------|------|
| 拖入即播 | 一次拖入一份或多份音频（mp3 / wav / ogg / m4a / aac / flac），空闲时从拖入的第一首开始播 |
| 播放列表 | 多首歌曲组成列表，自动连播；点列表按钮进入列表页，可点切歌 / 移除单曲 / 清空；重启后恢复 |
| 播放 / 暂停 | 点击播放按钮或左侧封面切换 |
| 上一首 / 下一首 | 播放按钮两侧的跳转按钮；结尾自动连播下一首 |
| 随机播放 | 洗牌序切歌（不重复直到一轮播完），可回退上一首 |
| 循环模式 | 循环按钮依次切换：列表循环 / 单曲循环 / 关闭；重启后恢复 |
| 播放速度 | 速度按钮循环切换倍速（0.5x–2x）；重启后恢复 |
| 进度显示 + 拖拽定位 | 进度条可点击 / 拖动跳转 |
| 音量控制 | 音量滑块 + 静音开关，重启后恢复 |
| 曲名 / 时长 | 曲名单行截断（hover 显示完整路径），时长 `m:ss / m:ss` |
| 专辑封面 | 音频含嵌入封面时显示在左侧封面位，无则回落占位音符图标 |
| 歌词 | 同名 `.lrc` 文件自动加载，随进度滚动高亮 |
| 全局显隐快捷键 | `Ctrl+Alt+Space` 任意位置切换卡片显隐，显示时自动聚焦 |
| 时钟 widget | 随卡片自带一个时钟/日期 widget，与播放器并存 |
| 主页即 main | 主页是特殊 main widget：启动默认显示，**不参与 Tab 循环**，按 `Home` 键随时返回 |
| widget 自定义尺寸 | 每个 widget 声明自己的窗口尺寸，切换时自动 resize |
| 切换过渡动画 | 切换 widget 时 150ms 淡入淡出 |
| Tab 切换 widget | 卡片聚焦时按 Tab 在普通 widget 间循环切换（播放器 ↔ 单位转换器 ↔ 待办），main 主页不参与，需 `Home` 键或 Ctrl+F 返回 |
| 单位转换器 | 顶部标签切换类型：进制（十进制 / 十六进制 / 八进制 / 二进制，任选一个输入其余自动同步，粘贴自动剔除非法字符如十六进制 `0x1145f` 解释为 `1145f`）+ 长度 / 重量 / 温度 / 面积 / 体积 / 数据 / 时间 / 速度 / 压力 等多类单位换算，任一输入框可编辑，其余自动同步 |
| B站下载（外部） | 输入 B 站链接（BV/av/URL），解析后可下载 **视频 / 视频音频(MP4) / 音频 / 封面 / 弹幕**，支持**混合批量**（每项独立选类型一键全下）；下载进度实时刷新、可取消，落盘到 `download.dir` |
| Ctrl+F 搜索 widget | 聚焦时按 Ctrl+F 弹出搜索，模糊匹配 name/id/keywords，方向键+Enter 或点击切换 |
| Ctrl+S widget 设置 | 聚焦时按 Ctrl+S 弹出**居中的独立窗口**，平台统一渲染当前 widget 的声明式设置项（无则提示）；设置项较多时窗口内滚动；改动经事件同步并持久化 |
| 位置记忆 | 移动窗口防抖 300ms 保存，启动恢复，越界自动居中 |
| 开机自启 | 卡片上 **右键** 切换（隐藏开关位），状态以系统实际注册为准 |
| 常驻最上层 | always-on-top 无边框透明圆角卡片 |
| 拖拽移动 | 卡片背景区（非控件区）拖动移动窗口 |
| 无任务栏 / 托盘常驻 | 不在任务栏占位；`✕` 隐藏到托盘（继续播放）；托盘左键点击显隐，右键菜单「退出」彻底退出进程 |

拖拽判定在 widget 内完成：处理的文件按 widget 逻辑处理；不支持的格式 / 文件夹 / 非当前 widget 的拖入 → widget 静默忽略（不提示）。损坏文件 → toast「无法播放该文件」，回到空闲态。

## 开发

前置：[Rust](https://rustup.rs/)、Node.js ≥ 18、Windows 上自带的 WebView2。

```bash
npm install
npm run tauri dev      # 开发模式
npm run tauri build    # 发布构建（msi / nsis 安装包见 src-tauri/target/release/bundle/）
npm run check          # svelte-check 类型检查
```

> **sccache 编译缓存（可选，推荐）**：本地装 [sccache](https://github.com/mozilla/sccache) 并按
> `E:\\.cargo\\config.toml` 里的注释接入后，重复构建 Rust 更快。CI 已内置：`.github/workflows/`
> 的 check / release 流程用 `mozilla-actions/sccache-action` 走 GitHub Actions 共享缓存，
> 跨多次 run 复用编译产物。

## 项目结构

```
src/
  routes/+page.svelte          # 入口：只选当前 widget 并挂载 WidgetHost
  lib/
    core/                      # 卡片平台层（与业务无关，所有 widget 共用）
      WidgetHost.svelte        # 外壳：组装 Card + mount 渲染 + 拖拽分发 + 自启 + 位置记忆 + 托盘
      WidgetSearch.svelte      # Ctrl+F 搜索 widget（模糊匹配 + 键盘选择）
      SettingsPanel.svelte     # 平台设置表单：声明式渲染 widget 的设置项
      SettingsPage.svelte      # 设置窗口页（居中独立窗口，Esc 关闭）
      Card.svelte              # 卡片外壳 / 拖拽区 / 关闭按钮 / 拖入高亮
      window.ts                # 位置记忆、边界保护、防抖
      settings.ts              # 共享 store + 窗口位置 / 自启开关
      types.ts                 # 兼容层：契约转发自 widgets/api/types
    widgets/
      api/                     # 平台公开契约（宿主与外部 widget 共用）
        types.ts               # WidgetDefinition / WidgetManifest / WidgetContext / 权限契约（零 Svelte 依赖）
        context.ts             # createWidgetContext：按 manifest.permissions 权限下放
        hostApis.ts            # 宿主特权实现（绝不直接给 widget）
        svelteAdapter.ts       # Svelte 组件 → 框架无关 mount 渲染器
        loadExternal.ts        # 扫描 + 求值外部 widget bundle
      builtin.ts               # 聚合 4 个内置 widget
      registry.svelte.ts       # 异步注册表：内置 + 外部合并 + 当前激活项 + main(clock 主页) + Tab 循环/返回
      audio-player/            # 例：音频播放器（widget.json + index.ts + 组件）
      clock/                   # 主页（widget.json + index.ts + 组件）
      unit-convert/            # 单位转换器（widget.json + index.ts + 组件 + conversions.ts）
      todo/                    # 待办（widget.json + index.ts + 组件）
widgets/                       # Widget 商店发布源（catalog.json + 各 widget 目录；推送到 desktop-card-widgets 仓库）
docs/widgets.md                # 外部 widget 开发指南
src-tauri/src/lib.rs           # 插件注册 + get_album_art + list_external_widgets + 沙箱命令
src-tauri/src/sandbox.rs       # 外部 widget 的 QuickJS 沙箱（worker 线程 + mpsc，JSON 往返）
```

> **外部 widget**：每个 widget 目录必含 `widget.json`（显式声明元数据 + 权限），
> 宿主只把 `permissions` 声明的能力下放进 `WidgetContext`。外部 widget 以目录形式
> 放入运行时扫描根目录（`DESKTOP_CARD_WIDGETS` 或应用数据目录 `widgets`），放入即用。
> 对外契约与外部开发指南见 [docs/widgets.md](docs/widgets.md)。

## 持久化（tauri-plugin-store，settings.json）

| key | 默认 | 说明 |
|-----|------|------|
| `window.x` / `window.y` | null | 窗口物理坐标；null 时启动居中 |
| `volume.level` | 0.8 | 音量 0–1 |
| `volume.muted` | false | 静音 |
| `playback.loopMode` | "all" | 循环模式：`all` 列表循环 / `one` 单曲循环 / `off` 关闭 |
| `playback.shuffle` | false | 随机播放 |
| `playback.rate` | 1 | 播放倍速（0.5–2） |
| `player.playlist` | [] | 播放列表（文件绝对路径数组），重启后恢复 |
| `player.currentIndex` | -1 | 当前曲目在列表中的下标 |
| `playback.autoResume` | false | 启动后自动续播 |
| `playback.showLyrics` | true | 显示歌词 |
| `clipboard.showImages` | true | 显示图片条目 |
| `clipboard.showFiles` | true | 显示文件条目 |
| `color.copyFormat` | "none" | 取色后自动复制格式（none/hex/rgb/hsl） |
| `countdown.alert` | true | 到点提醒 |
| `todo.showCompleted` | true | 显示已完成 |
| `todo.doneToBottom` | false | 已完成置底 |
| `unit.decimals` | "auto" | 结果小数位（auto/0–6） |
| `download.dir` | "%USERPROFILE%\\Downloads" | 外部下载类 widget 的下载目录（如 B站下载） |
| `theme.accent` | "blue" | 主题色预设（blue/purple/teal/green/orange/red/pink/gold） |
| `autostart.enabled` | false | 与系统注册状态保持同步 |

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
