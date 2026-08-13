# 更新日志

本文件记录本项目的显著变更。格式遵循 [Keep a Changelog]，版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 新增
- 自动检测 GitHub Releases 新版本：启动时后台检查，发现更新可一键下载并安装。
- 新增 `CHANGELOG.md` 版本变化记录。
- GitHub CI：PR / push 自动跑类型检查、Rust 测试与 clippy；打 `v*` tag 自动构建 Windows 安装包并发布 Release。修复两处既有 clippy 警告。