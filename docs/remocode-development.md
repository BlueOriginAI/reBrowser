# 开发与构建说明

## 仓库和工具

源码：<https://github.com/BlueOriginAI/reBrowser>。来源和许可见 [UPSTREAM.md](../UPSTREAM.md) 与 [第三方说明](../THIRD_PARTY_NOTICES.md)。

- Agent 工作区：Bun **1.4.2**，以 `package.json` 和 `bun.lock` 为准。
- Rust 后端：最低工具版本见 `packages/reBrowser-agent/Cargo.toml`，当前声明 Rust **1.94**；依赖以 `Cargo.lock` 为准。
- 浏览器构建驱动：Python **3.12+** 和 uv，以 `packages/reBrowser/pyproject.toml` 与锁文件为准。
- Chromium 使用自己的 depot_tools/Python、Clang 和平台 SDK；不能把构建驱动的 Python 要求与 Chromium 自身工具环境混为一谈。

## 产品与对应源码

| 内部构建键 | 显示名称 | macOS bundle ID | 配置目录 |
| --- | --- | --- | --- |
| `browseros` | reBrowser | `com.remocode.RemocodeBrowser` | RemocodeBrowser |
| `browserclaw` | reBrowser | `com.remocode.RemocodeBrowserNeo` | RemocodeBrowserNeo |

兼容性键和 API 命名保留。`browserclaw` 的 Rust 编译目标仍是 `browseros-claw-server-rs`，构建资源按描述符暂存为 **`reBrowser-server`**（Windows 为 `reBrowser-server.exe`）。不要仅重命名已签名安装包中的文件。

完整功能源码包括 `apps/app`、`apps/claw-app`、两个 onboarding、两种后端、CLI、共享包、Rust crates、接口、迁移与测试。浏览器部分包括 `chromium_patches`、`chromium_files`、系列补丁、资源、版本配置及 `bos_build`。

此公开源码不依赖上游 `.internal-docs` 私有文档子模块。它及其同步/CLA 自动化不在当前公开构建流程中。

## Agent 工作区

```sh
cd packages/reBrowser-agent
bun install --frozen-lockfile
bun run check
bun run test
bun run --filter @browseros/claw-app build
bun run --filter @browseros/app-onboard build:chromium
bun run --filter @browseros/claw-onboard build:chromium
cargo test -p claw-server-rust
```

查看 `package.json` 中的构建脚本选择另一界面或 CLI。需要服务配置时，使用项目提供的示例和自己的配置；真实 `.env`、浏览器用户配置、数据库、私钥和运行日志不得提交。缺少服务配置时应显示明确能力限制，不要填入上游或他人的凭据。

## Chromium 基线和浏览器构建

基线由 `packages/reBrowser/chromium_patches/.store.yaml` 记录：

- 原始基线版本：`151.0.7922.137`。
- 基线提交：`8f5d36bc16f57115aeeff34baf4ad6aa964d509c`。
- 项目构建号/偏移由构建配置管理；实际显示版本可能不同，不要为匹配版本字符串任意修改基线。

按 [Chromium Get the Code](https://www.chromium.org/developers/how-tos/get-the-code/) 获取 depot_tools 和完整公开源码，并按项目构建说明同步到记录的提交。Chromium 与其第三方依赖也各有许可证，原始声明必须保留。

```sh
cd packages/reBrowser
uv sync
uv run browseros build --preset debug --product browserclaw --chromium-src /path/to/chromium/src
```

另一产品使用 `--product browseros`。先查看构建计划及 `uv run browseros build --help`，再执行；完整 source/prepared resource 模式、平台配置与所需资源详见 [`bos_build/README.md`](../packages/reBrowser/bos_build/README.md)。源码获取、锁定依赖、资源生成和补丁应用属于构建材料，不应以提交生成产物代替。

源码/构建缓存需要大量磁盘，首次完整构建可能数小时；保留既有源码与缓存做增量构建，不擅自清理其他项目或用户数据。

## 扩展身份和本地签名

正式发行与本地开发不同。扩展 ID 受签名公钥影响；使用自有密钥时，必须保持扩展 manifest、产品描述符、可信扩展 ID、CORS 与 native bundled-extension 配置一致。可在隔离的开发配置中按支持的开发方式验证，不能用不匹配的签名冒充现有扩展身份。

项目不公开发布私钥或 Apple 发行凭据。本地 macOS 开发构建可用 ad-hoc 签名：按 dylib/独立 helper → helper app → framework → 主 app 的内部到外部顺序签名，最后验证整个 bundle。Renderer/GPU 必须保留 JIT 权限；Hardened Runtime 下的 ad-hoc framework 无 Team ID 时，本地 helper 需相应 library-validation 兼容权限。使用 `resources/entitlements` 的既有模板，根据本地开发场景明确调整，不修改已签好的资源。

示例本地签名形式为 `codesign --sign - --timestamp=none ...`；正式签名、公证、更新源及发布流水线须另行配置和验证。ad-hoc 签名不等于 Apple 公证，不应为绕过提示而全局关闭系统安全保护。

## 验证与发行边界

可先运行不依赖完整 Chromium 下载的产品、资源和补丁测试。原生集成必须以实际浏览器构建验证，Python 源码契约检查不能冒充 C++ 编译或已安装验证。

本仓库初始独立提交只发布源码，不同时发布安装包、OTA 或云服务。仍保留的上游地址及历史资源标识不等于由 reBrowser 自营，正式分发前须核查平台身份、资源许可、服务配置、安装信息和对应源码获取方式。

分发修改版二进制应提供与该版本对应的源码和构建材料；向他人提供修改版网络服务应按 AGPL 第 13 条提供源码入口。公开源码地址为本仓库，不需要提供密码、API key 或用户数据。
