# 来源与修改说明

## 源码来源

reBrowser 基于 [BrowserOS](https://github.com/browseros-ai/BrowserOS) 和 Chromium 继续开发，由 BlueOriginAI 维护。本项目不代表上游背书，也不将上游源码的原有版权归属转移给当前维护者。

当前独立源码快照于 **2026-10-11** 整理。重建前的 BrowserOS 衍生仓库基线为 `509ade7effa6d848d5e127a8f6f42660581e4a24`；这个基线已经包含早期 RemocodeBrowser 品牌修改。随后实际开发代码来自当前工作树，不只来自该提交。

主要修改包括：

- `packages/browseros-agent` / `packages/browseros` 迁移为 `packages/reBrowser-agent` / `packages/reBrowser`，以及产品/配置身份和品牌调整。
- 两应用、两引导和诊断的中英双语、系统语言默认、持久化与跨页面同步。
- 中文输入法提交防护、中文审计搜索和相关测试。
- 原生语言偏好、变更事件及引导桥接。
- 内置 Rust 后端的构建、资源、签名和运行路径统一为 `reBrowser-server`；内部 crate、协议及配置标识保留。
- 公开源码整理、私有文档依赖及不适用上游自动化的退出。
- 修正目录迁移后的 `env` 源码忽略范围、补齐字体许可，并将编译二进制策略测试改为有界日志就绪等待，避免冷启动固定延时误报。

## 许可与版权

保留根及组件许可证、源码中的原有版权与免责声明、必要第三方通知。主项目适用 GNU AGPL v3；声明为 `AGPL-3.0-or-later` 的工作区仍保留该声明。MIT、BSD、SIL OFL 等独立组件不因根目录 AGPL 文件而改用另一许可证。

`README.upstream.md` 等上游资料作为来源参考保留，其中上游链接、服务、下载和历史说明不代表当前维护者的发行或运营承诺。

新 Git 根提交只表示当前源码的独立导入与整理，不声称当前维护者创作了所有历史代码。重建历史、删除旧标签和分支不免除许可证义务。

## 对应构建材料

本仓库提供应用/后端/共享模块、锁文件、接口与迁移、测试、Chromium 补丁及 overlay、资源和构建脚本。公开 Chromium 基线见 `packages/reBrowser/chromium_patches/.store.yaml`：`8f5d36bc16f57115aeeff34baf4ad6aa964d509c`，基线版本 `151.0.7922.137`。

按 [开发与构建说明](docs/remocode-development.md) 获取公开基线及依赖，使用锁定工具链应用项目补丁。没有将完整 Chromium checkout、依赖缓存、用户配置或私钥作为源码提交；这些与必要构建控制脚本的职责不同。

当前本地开发代码已做过 macOS 构建和功能验证；本次提交不等同于所有平台正式发行验证。分发二进制时应提供与其实际版本相符的对应源码及适用安装信息。源码获取入口为 <https://github.com/BlueOriginAI/reBrowser>；网络服务须按 AGPL 第 13 条向相应用户提供该入口或版本匹配的来源。
