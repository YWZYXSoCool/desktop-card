# ffmpeg 随附依赖

本 widget 做高画质「视频音频」下载时走 DASH（视频、音频拆成两条流），需要 ffmpeg
把两条流合并成单个 MP4。**平台不注入 ffmpeg** —— 由 widget 自动探测，按以下顺序：

1. 设置里的「ffmpeg 路径」（留空则跳过）；
2. 本目录 `widgets/bilibili/ffmpeg/` 下的 `ffmpeg.exe`（Windows）或 `ffmpeg`（其它平台）；
3. 运行时自动下载到**下载目录**的 `ffmpeg.exe`（见下）。

## 运行时自动下载（推荐）

仓库不捆绑二进制（体积大，GitHub 单文件上限 100MB）。首次做「视频音频」下载且
找不到 ffmpeg 时，widget 自动从
[eugeneware/ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
拉取一份 Windows 静态构建到**当前下载目录**，同时本次退回 MP4 单文件（仍出片）。
下载完成后，下次「视频音频」即走 DASH 高清合并。

若自动下载失败，可手动放置 ffmpeg 后重启 widget 生效：

```
widgets/bilibili/ffmpeg/ffmpeg.exe
```

## 备选

你也可以不随包，改成在 widget 设置里「ffmpeg 路径」直接指向系统里已安装的
`ffmpeg.exe` 所在目录。没找到 ffmpeg 时，「视频音频」自动退回 MP4 单文件（画质受限）。