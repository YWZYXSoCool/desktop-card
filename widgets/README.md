# Widget 商店源

本目录是 **Widget 商店的发布源**，内容推送到
[`YWZYXSoCool/desktop-card-widgets`](https://github.com/YWZYXSoCool/desktop-card-widgets)。
桌面应用商店页从该仓库根目录的 `catalog.json` 拉取可安装列表。

## 目录结构

```
widgets/
├── catalog.json      # 商店目录：列出所有可安装 widget（必填）
├── README.md
└── <widget-id>/      # 每个 widget 一个子目录
    ├── widget.json   # 清单：id / name / entry / permissions / settings
    ├── index.js      # 入口 bundle（QuickJS 沙箱执行）
    └── ...           # 其它文件（在 catalog 的 files 里列出）
```

## 添加一个新 widget

1. 新建一个目录 `<widget-id>/`，内含 `widget.json` + 入口 JS。
   结构参考 `counter/` 与 `json-formatter/`（应用内可先用「从本地添加」验证）。
2. 在 `catalog.json` 的 `widgets` 数组里加一项：

   ```json
   {
     "id": "mywidget",
     "name": "我的组件",
     "description": "一句话简介",
     "version": "1.0.0",
     "author": "you",
     "path": "mywidget",
     "files": []
   }
   ```

   - `path`：仓库内相对目录名。
   - `files`：除 `widget.json` 与入口 JS 外，还需随 widget 一起下载的文件名（可选）。

## 发布

把 `widgets/` 目录下的内容推送到 `desktop-card-widgets` 仓库根即可：

```bash
git add catalog.json <widget-id>/
git commit -m "add: 新增 xxx widget"
git push   # -> https://github.com/YWZYXSoCool/desktop-card-widgets
```

> 商店抓取的是仓库 `main` 分支的 `catalog.json`，推送后应用内点「刷新」即可看到更新。
> 本地调试单个 widget：`set DESKTOP_CARD_WIDGETS=%CD%\widgets` 后 `npm run tauri dev`，
> 或直接在商店「从本地添加」导入该目录。