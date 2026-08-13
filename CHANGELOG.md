# 更新日志

本文件记录本项目的显著变更。格式遵循 [Keep a Changelog]，版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.2.0] - 2026-08-13

### 新增
- 主页左下角显示应用版本号，有更新时在旁边显示更新图标，点击即可下载安装。
- 新增「倒计时」widget：设置目标日期与名称，常驻显示剩余天数/时分秒，到点提醒。
- 英英词典 AI 来源扩充：新增 OpenAI / 智谱 GLM / Kimi / 通义千问 / OpenRouter，并支持完全自定义来源（手动填接口地址 + 模型 + Key）。

## [0.1.0] - 2026-08-13

### 新增
- 自动检测 GitHub Releases 新版本：启动时后台检查，发现更新可一键下载并安装。
- 新增 `CHANGELOG.md` 版本变化记录。
- GitHub CI：PR / push 自动跑类型检查、Rust 测试与 clippy；打 `v*` tag 自动构建 Windows 安装包并发布 Release。修复两处既有 clippy 警告。