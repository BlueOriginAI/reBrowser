# reBrowser

reBrowser 是面向智能体工作流的开源 Chromium 浏览器，由 [BlueOriginAI](https://github.com/BlueOriginAI) 维护。

仓库：<https://github.com/BlueOriginAI/reBrowser>

## 开发

主要源码位于：

| 路径 | 内容 |
| --- | --- |
| `packages/reBrowser-agent` | 界面、扩展、MCP/后端、CLI、共享模块及测试 |
| `packages/reBrowser` | Chromium 补丁、资源与构建系统 |
| `docs` | 开发和使用说明 |

Agent 工作区使用 **Bun 1.4.2**：

```sh
cd packages/reBrowser-agent
bun install --frozen-lockfile
bun run check
bun run test
```

完整浏览器构建还需要 Chromium 源码及平台工具链。详见 [开发与构建说明](docs/remocode-development.md)、[贡献指南](CONTRIBUTING.md) 和 [浏览器构建系统](packages/reBrowser/bos_build/README.md)。

这是开发源码，不是已公证的正式安装包。macOS 本地签名、公证、Windows/Linux 完整安装身份、更新基础设施及第三方服务配置具有不同的要求；不要将仍保留的上游服务地址理解为 reBrowser 自营服务。

## 许可、来源与对应源码

本项目基于 [BrowserOS](https://github.com/browseros-ai/BrowserOS) 和 Chromium 的工作继续开发，保留原有版权和适用许可证，不表示获得上游背书。

- 项目主要许可为 [GNU AGPL v3](LICENSE)；相关工作区另有 `AGPL-3.0-or-later` 声明。
- 独立第三方组件仍使用各自许可证，包括 MIT、BSD 和字体的 SIL OFL，详见 [第三方说明](THIRD_PARTY_NOTICES.md)。
- [来源与修改说明](UPSTREAM.md) 记录基线、修改范围和对应构建材料；[上游原始 README](README.upstream.md) 作为来源参考保留。
- 取得对应源码可使用本仓库公开下载或克隆，并配合记录的 Chromium 基线和构建脚本。分发修改版二进制时，须提供与该版本匹配的对应源码；向他人提供修改版网络服务时，须按 AGPL 第 13 条提供适用的源码获取入口。

重建本仓库 Git 历史不改变这些许可义务，也不将上游代码的版权归属转移给当前维护者。
