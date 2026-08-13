# Widget 开发指南（外部可插拔）

卡片核心是一个 **widget 平台**：功能以 widget 为单元，内置与外部共用同一套契约。
外部 widget 以目录形式放入运行时可扫描的位置，**放入即用，无需重新构建应用**。

可直接参考本仓库的示例：[`widgets/counter/`](../widgets/counter/)。

---

## 1. 目录结构

每个 widget 是一个目录，**必须**包含 `widget.json`（清单）与一个入口 bundle：

```
widgets/
  my-widget/
    widget.json   # 清单：元数据 + 权限 + 声明式设置（必须）
    index.js      # 入口 bundle：通过 registerWidget 注册实现
    ...           # 其余资源（样式、assets 等）随 bundle 分发
```

- 内置 widget（`src/lib/widgets/*`）结构一致：`widget.json` + `index.ts` + Svelte 组件。
- 内置用 `index.ts` + `svelteRenderer(Component)`；外部用 `index.js`，在 **QuickJS 沙箱**里
  以声明式 UI 树表达界面（沙箱无 DOM，见下）。

## 2. 安装位置（运行时可扫描根目录）

启动时 Rust 扫描该根目录下每个含 `widget.json` 的子目录：

| 方式 | 根目录 |
|------|--------|
| 生产 | 应用数据目录下的 `widgets`（Windows 为 `%APPDATA%/<identifier>/widgets`） |
| 开发调试 | 环境变量 `DESKTOP_CARD_WIDGETS` 指向任意目录（如仓库 `widgets`） |

```bash
# 开发：让应用扫描仓库里的 widgets/
set DESKTOP_CARD_WIDGETS=%CD%\widgets
npm run tauri dev
```

缺 `widget.json`、清单解析失败、或 bundle 未调用 `registerWidget` 的目录会被跳过，
仅影响该 widget，不影响其它 widget 与内置。

## 3. widget.json 清单

```jsonc
{
  "id": "counter",            // 唯一标识（参与搜索匹配）
  "name": "计数器",            // 展示名（参与搜索匹配）
  "version": "1.0.0",          // 可选
  "entry": "index.js",         // 相对该目录的入口 bundle
  "keywords": ["计数", "count"], // 搜索关键词（模糊匹配）
  "size": { "width": 200, "height": 120 },  // 窗口尺寸（切换时自动 resize）
  "dropHint": "松开",           // 可选：申请了 drop 权限时的拖拽提示文案
  "permissions": ["store", "settings", "toast"],  // 显式声明要用的宿主能力
  "settings": [                // 可选：声明式设置项（设置页由平台统一渲染）
    { "key": "counter.step", "label": "步长", "type": "number",
      "default": 1, "min": 1, "max": 20, "step": 1 }
  ]
}
```

设置项按 `type` 判别，`key` 是持久化存储键（widget 自己命名空间）。支持类型：

| `type` | 控件 | 字段 |
|--------|------|------|
| `toggle` | 开关 | `default: boolean` |
| `number` | 数字框 | `default`, `min?`, `max?`, `step?` |
| `slider` | 滑块 | `default`, `min?`, `max?`, `step?` |
| `select` | 下拉框 | `default`, `options: [{label, value}]` |
| `text` | 单行文本 | `default`, `placeholder?` |
| `textarea` | 多行文本 | `default`, `placeholder?` |
| `color` | 取色器 | `default: "#5b8def"` |
| `folder` | **目录选择**（原生对话框） | `default`, `startDir?` |
| `section` | 分隔组（纯展示标题） | `name` |

`folder` 会渲染一个按钮，点击弹出**原生目录选择框**，选中结果写入该设置项——
适合下载目录、输出路径这类需要落盘路径的选项。`startDir` 指定对话框起始目录（缺省当前目录）。
另外可用 `visibleWhen: { key, equals }` 让某项仅在另一项等于某值时显示，满足条件联动。

## 4. 权限模型（严格控制 API 下放）

宿主不把整份能力交给 widget，而是**只下放 `permissions` 里显式声明的能力**。
widget 通过各生命周期方法收到的 `ctx: WidgetContext` 只含它申请过的键，其余为 `undefined`
（调用会报错）。

| 权限 | ctx 键 | 能力 |
|------|--------|------|
| `store` | `ctx.store` | 持久化读写 `get<T>(key, fb)` / `set(key, value)` |
| `settings` | — | 声明式设置项 + `onSettingChange` 回调（宿主渲染设置面板） |
| `drop` | `ctx.drop.hint` | 文件拖拽提示文案 + `onDrop` 回调 |
| `toast` | `ctx.toast` | 通知 `info(msg)` / `error(msg)` |
| `download` | `ctx.download` | 通用网络/文件下载原语（裸 HTTP / URL→文件 / 文本→文件） |
| `window` | — | 保留：自定义窗口（未开放） |
| `execute` | — | 保留：系统命令（默认不开放） |

> 未申请 `store` 的 widget 触不到持久化；未申请 `toast` 的拿不到通知。**按需最小化申请。**
>
> **注意**：外部 widget 跑在 QuickJS 沙箱里，其 `ctx.store` 是**同步** API
> （`ctx.store.get(key, fb)` 直接返回值，`ctx.store.set(key, value)` 立即写入），
> 与内置 widget 的异步 `Promise` 版不同。原因：沙箱内走宿主→Rust 的 JSON 字符串转发，
> 同步即可，无需 Promise。

### 4.1 download 权限：通用网络 / 文件下载原语

沙箱外部 widget 本身**没有网络、没有文件写入**。需要这些能力时申请 `download` 权限，
宿主注入通用原语（后端零业务、不关心前端），业务（API 构造、解析、选流、拼文件名）
全部由 widget 自己负责。**后端不含任何 B 站 / 具体服务商字样，任何需要下载的外部 widget 都能复用。**

申请后 `ctx.download` 提供（全部同步返回）：

| 方法 | 说明 |
|------|------|
| `http(method, url, headers?, body?)` | 裸 HTTP：转发请求，返回 `{ok, status, body}`，**不解析**。适合 JSON / XML 解析类请求 |
| `download(url, headers, filename)` | 把 URL 流式下载到**下载目录**的指定文件名，返回 job id |
| `writeText(filename, content)` | 把文本写入下载目录的指定文件名，返回 job id |
| `dir()` | 当前下载目录路径（读 store 键 `download.dir`，缺省 `%USERPROFILE%\Downloads`） |
| `status()` | 全部任务状态快照 `SandboxJobStatus[]` |
| `cancel(id)` | 取消任务（下载在下一块中断并标记 `cancelled`） |

- **下载目录**：`download.dir` 设置项（平台设置页渲染）或默认下载文件夹。
- **进度刷新**：沙箱内无计时器（不可自轮询）。下载任务进度变更时，宿主发
  `widget-progress`（带 sandbox handle）事件 → 前端 `sandboxView` 按 handle 自动重渲染，
  因此 widget 只要在 `render()` 里读 `ctx.download.status()` 就能实时显示进度条。
- **任务归属**：后端注册表是进程级的，`status()` 返回全部任务。widget 应记录自己提交的
  job id（如 `state.jobs[id] = label`）并按 id 过滤展示，避免混入其它 widget 的任务。
- **文件名安全**：后端会清洗文件名（去路径分隔符与 Windows 非法字符），防路径穿越。
- 参考实现：[`widgets/bilibili/`](../widgets/bilibili/)（B 站下载器，混合批量）。

## 5. 入口 bundle 契约（QuickJS 沙箱）

外部 bundle 在 **Rust 内嵌的 QuickJS 沙箱**里执行（`rquickjs`），与 webview 应用上下文
彻底隔离：**没有 DOM、没有 window/document、没有浏览器 API、触不到 Tauri 能力**。
UI 以**声明式 JSON 树**表达，由宿主水合为真实 DOM。交互经 `handleEvent` 回调沙箱、
返回新树后由宿主重渲染。

调用 `registerWidget` 注册实现对象：

```js
registerWidget({
  setup(ctx) {
    // 可选：启动时同步恢复状态
    this.count = ctx.store.get("my.count", 0);   // ctx.store 同步
  },

  render() {
    // 返回声明式 UI 树（宿主水合渲染）
    return {
      type: "column",
      style: { gap: "8px", alignItems: "center" },
      children: [
        { type: "text", props: { value: String(this.count) } },
        { type: "button", props: { label: "＋" }, on: "inc" },
      ],
    };
  },

  handleEvent(id, type, data, ctx) {
    // 交互节点（带 on）触发时回调；随后宿主重调 render() 刷新
    this.count += 1;
    ctx.store.set("my.count", this.count);
  },

  onSettingChange(key, value, ctx) {},   // 可选：设置项变更副作用
  onDrop(path, ctx) {},                  // 可选：处理拖入文件（需申请 drop）
});
```

生命周期与方法签名：
- `setup(ctx)`：应用启动时对每个 widget 调用一次，常用于从 `ctx.store` 恢复状态。
- `render(ctx) → UINode`：widget 被激活（及每次交互后）调用，返回声明式 UI 树。
- `handleEvent(id, type, data, ctx)`：带 `on` 的交互节点触发时回调，改内部状态即可，
  宿主随后重调 `render()`。
- `onSettingChange(key, value, ctx)`：用户在设置面板改项时回调。
- `onDrop(path, ctx)`：文件拖到卡片松开时回调，widget 自行判定是否处理。

### 声明式 UI 树节点（UINode）

每个节点：`{ type, props?, style?, children?, on? }`

渲染由宿主 **Svelte 组件库**（`src/lib/widgets/ui/*`）承担，与内置 widget 共用同一套主题
CSS 变量（`--accent`、`--bg-input`、`--text` 等），明暗主题切换时同步翻转，观感原生一致。

| type | 说明 | 关键 props |
|------|------|-----------|
| `row` / `column` / `stack` / `box` | 布局容器（flex 行 / 列 / 叠层 / 普通块） | — |
| `spacer` | 弹性占位（flex:1） | — |
| `text` | 文本 | `value` / `label` |
| `button` | 按钮（点击 → `on`） | `label`, `tone: accent\|ghost\|danger` |
| `input` | 文本框 | `value`, `placeholder`, `password` |
| `number` | 数字框 | `value`, `min`, `max`, `step` |
| `search` | 搜索框（带放大镜） | `value`, `placeholder` |
| `textarea` | 多行文本 | `value`, `placeholder` |
| `toggle` | 开关（切换 → `on`） | `checked` |
| `checkbox` | 复选框（勾选 → `on`） | `checked`, `label` |
| `radio` | 单选组（选择 → `on`） | `options: [{label,value}]`, `value` |
| `select` | 下拉框（选择 → `on`） | `options: [{label,value}]`, `value` |
| `slider` | 滑块（拖动 → `on`） | `value`, `min`, `max`, `step` |
| `color` | 取色器（选色 → `on`） | `value` |
| `date` | 日期输入（→ `on`） | `value` |
| `time` | 时间输入（→ `on`） | `value` |
| `image` | 图片 | `src`, `alt` |
| `icon` | lucide 图标（安全子集） | `name`, `size`, `color` |
| `avatar` | 圆形头像 | `src`, `size` |
| `badge` | 状态徽章（彩色胶囊） | `value`, `tone: neutral\|accent\|success\|danger\|info` |
| `divider` | 分隔线（可带居中文字） | `label` |
| `card` | 边框面板容器（可含子树） | `title`, `padding`, `tone: default\|accent\|sunken` |
| `progress` | 进度条 | `value(0-100)`, `tone: accent\|success\|danger`, `label` |
| `link` | 链接（点击 → `on`） | `value` |
| `field` | 标签+控件容器（含子树） | `label`, `hint` |

- `style`：内联样式子集（flex / 宽高 / 字号 / 颜色 / 圆角 / 间距 / 对齐等），键为 CSS 属性名
  （camelCase 亦可，如 `overflowY`）。内联样式覆盖组件库默认观感。
- `on`：交互节点的事件 id。触发时宿主回调 `handleEvent(id, type, data)`：
  - `button`/`link` → `type="click"`、`data={}`；
  - 输入类（`input`/`number`/`search`/`slider`/`color`/`textarea`/`date`/`time`）→ `type="change"`、`data=当前值`；
  - `toggle`/`checkbox` → `type="change"`、`data=boolean`；`select`/`radio` → `type="change"`、`data=选中值`。

## 6. 对外类型声明

契约类型在 [`src/lib/widgets/api/types.d.ts`](../src/lib/widgets/api/types.d.ts)，**纯类型声明
（.d.ts）、零 Svelte 依赖**。外部作者有两种用法：

**方式 A：拷贝进 widget 目录（推荐，目录自包含、可整体部署）**
把 `types.d.ts` 复制到 widget 目录，本地引用。示例见
[`widgets/counter/`](../widgets/counter/)（目录内自带一份同源拷贝）：

```js
/// <reference path="./types.d.ts" />
/** @typedef {import("./types.d.ts").UINode} UINode */
```

**方式 B：直接引用宿主绝对路径（仅开发期，部署后路径失效）**
```js
/// <reference path="e:/desktop-card/src/lib/widgets/api/types.d.ts" />
```

> 拷贝方式会随宿主版本漂移（这是一份快照），好处是 widget 目录独立、拷到任意
> `widgets/` 根都能自解释。示例里加了 JSDoc 标注，编辑器打开即有补全与校验。
> 只标注两边共享的 `UINode`：沙箱 `ctx` 的 store 是**同步**版，与内置宿主的
> 异步 `WidgetStore` 不同，故不把沙箱 ctx 标成 `WidgetContext`。

## 7. 安全边界（真沙箱）

外部 widget 在 **Rust 内嵌的 QuickJS 沙箱**里执行，与宿主彻底隔离：

- **无 DOM / 无浏览器全局**：拿不到 `window`、`document`、`fetch`、`localStorage` 等。
- **无 Tauri 能力**：沙箱内没有 `invoke` / IPC，触不到文件系统与窗口系统。
- **API 面同时收窄**：只注入 `permissions` 里显式声明的宿主函数（`store` / `toast` /
  `download`），且都经 JSON 字符串往返，widget 只能通过这些白名单触点与宿主通信。

每个沙箱跑在**独立 worker 线程**，崩溃/死循环不影响其它 widget 与宿主（宿主调用带超时
语义由通道断开兜底）。恶意 bundle 无法逃逸 QuickJS 触碰宿主进程。看参考实现：
`src-tauri/src/sandbox.rs`（Rust 沙箱）、`src/lib/widgets/api/sandboxView.ts`（UI 水合）。

> 内置 Svelte widget 是可信代码，走直接 mount（不经沙箱），保持原契约与性能。

## 8. 内置 widget 的改造范式

内置与外部共用同一契约，区别仅在渲染实现：

```ts
// src/lib/widgets/clock/index.ts
import manifest from "./widget.json";
import { svelteRenderer } from "$lib/widgets/api/svelteAdapter";

export const definition = {
  manifest,                                   // 来自 widget.json
  render: svelteRenderer(ClockCard),          // Svelte 组件 → mount 渲染器
  setup(ctx) { /* ctx.store!.get(...) */ },
  onSettingChange(key, value) { /* ... */ },
};
```