# 贡献指南

欢迎改进 reBrowser 的界面、浏览器能力、文档和测试。公开仓库为 <https://github.com/BlueOriginAI/reBrowser>。

## 选择开发范围

| 范围 | 源码 |
| --- | --- |
| 智能体控制台、MCP、回放 | `packages/reBrowser-agent/apps/claw-app`、`apps/claw-server-rust` |
| 助手、聊天、定时任务、设置 | `packages/reBrowser-agent/apps/app`、`apps/server` |
| 引导、共享语言与诊断 | `apps/app-onboard`、`apps/claw-onboard`、`packages/i18n`、`packages/diagnostics` |
| 浏览器与平台能力 | `packages/reBrowser/chromium_patches`、`chromium_files`、`bos_build` |

仍需遵守相应应用的开发规则。部分保留的上游文档描述上游服务或贡献流程，应以本仓库当前说明为准。

## 工具与检查

Agent 工作区使用 Bun 1.4.2，不使用 npm、yarn 或 pnpm 修改锁文件。Rust 和 Python 工具版本见工作区及构建系统清单。

```sh
cd packages/reBrowser-agent
bun install --frozen-lockfile
bun run check
bun run test
```

浏览器构建需额外获取公开的 Chromium 基线及平台工具链。参见 [开发说明](docs/remocode-development.md)。不要用源码任务关闭现有浏览器、重置用户配置或启动未经审查的旧监控脚本。

## 提交改动

- 从当前独立仓库 `main` 建立新分支，不将旧导入历史或旧标签重新推回仓库。
- 使用 Conventional Commits，说明改动原因和测试结果。
- 界面改动附可复现步骤或截图；不得附带账号凭据、用户浏览数据或付费服务密钥。
- 保留适用的许可证、版权和第三方通知；不要直接手改生成组件或接口类型。
- 自动化构建、安装包发布和云部署是不同操作，提交源码不代表授权执行发行或上传秘密。

本仓库不使用向 `browseros-ai/cla-signatures` 提交签名的上游 CLA 自动化。`CLA.md`、上游文档等历史材料不代表要求新贡献者向上游主体转移权利。贡献须符合本项目及相应组件的适用开源许可证；保留的版权材料不能因重建 Git 历史而删除。

## 问题与安全报告

普通问题在本仓库报告，不向上游反馈本项目特有的缺陷。安全问题不要公开粘贴秘密或利用详情；优先使用本仓库提供的私密安全报告渠道（若已启用），否则先与维护者确认安全的沟通方式。
