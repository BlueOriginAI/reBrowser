# macOS 正式版本的本机构建与发行

本流程只针对 `BlueOriginAI/reBrowser` 的 macOS Apple Silicon / arm64 DMG。首版为 `0.1.0`，品牌与 MCP 闲置会话修复版为 `0.1.1`。项目发布版本、原生内部产品版本和 Chromium 显示版本分别记录，不互相覆盖。

`0.1.1` 使用原生内部版本 `0.50.6`、build offset `241`，生成 Chromium 显示版本 `151.0.8163.137`；不改变 Chromium 源码基线。主扩展为 `0.2.30.0`，高于先前正式 `0.2.29.0` 与本地 `0.2.29.1`，并保持同一自有扩展签名 ID。

## 源码先进入 main

1. 基于独立仓库当前 `main` 建立发行准备分支，不合并导入前旧本地分支的祖先。
2. 提交已检查的代码，快进合并并推送 `main`。
3. 冻结完整 main SHA，确认工作树干净；以下所有资源、源码通知与 Release tag 使用这个 SHA。

## 本机资源与原生构建

- 使用 Bun 1.4.2 和冻结锁文件，重新构建 `apps/claw-app`、`apps/claw-onboard`。
- 用 `bos_build.release.server_resources.ServerResourceBuilder` 从同一 SHA 的源码准备 Rust `reBrowser-server`，生成实际资源路径、版本和 checksum metadata。
- 扩展公钥与 ID、CORS/native 配置必须一致。自有扩展签名私钥只在本机使用，不提交、打印或上传；构建临时密钥文件应为 `0600` 并及时移除。
- 首版只捆绑自有源码构建的主扩展，不分发来源与许可未核验的上游 Feedback CRX；反馈入口指向本仓库 GitHub Issues。兼容构建的 common prepared 清单可以保留本机已校验的旧 reporter，但产品 staging 和最终 app 必须排除它。
- 其他外部组件必须记录实际版本、来源、license 和 SHA256；不得把旧二进制宣称为当前源码构建，也不得把上游服务宣称为 reBrowser 自营云服务。
- 首版关闭当前产品的原生崩溃上传、原生统计初始化、上游后端 OTA 和主扩展远程配置拉取。Rust 与 UI 构建不嵌入 PostHog 项目 Key 或 Sentry DSN；不得沿用其他应用的环境凭据。用户主动配置模型提供商仍会连接其选择的服务。
- 复用已验证的 Chromium 基线和缓存安全同步源码，运行 GN 与增量编译，不清理或重置用户 checkout。正式 Developer ID 签名/Apple 公证不等同于 Chromium 的 `is_official_build` 优化选项；首版使用现有 release 配置并分别记录该选项。

完成原生编译后，使用 `bos_build.release.macos_source_notices.write_macos_source_notices` 把公开许可证及精确源码入口加入新的 app。这个操作必须在正式签名之前执行；不从用户配置或任意 `.env` 文件收集资料。

还需保留实际 bundle 中所含第三方依赖的版权和许可文本。Chromium 自带的 credits 不替代项目 AGPL、Rust/npm 依赖或字体的必要通知。

## 正式签名与 Apple 公证

1. 核验自己的 Developer ID Application 身份和对应团队，按内部组件到外部 app 的顺序签名，使用安全时间戳及正式 Hardened Runtime/JIT 配置。
2. 不沿用本地 ad-hoc Renderer/GPU 为无 Team ID framework 增加的开发用 library-validation 例外；正式同团队签名应能正常验证。后端既有 entitlement 按实际功能核验，不盲目删减。
3. 使用已在本机钥匙串保存且验证可用的 notarytool profile。Remocode 系列应用可使用本机已有 `remocode-notary`；这个名称不是凭据，凭据内容不写入仓库。
4. 上传必须以 `notarytool submit` 退出码 0 和 `Successfully uploaded file` 回执为准，立即保存提交 ID；仅有 ID 或 `In Progress` 不证明分片上传已经完成。网络不稳定时可使用 `--no-s3-acceleration`；失败先核对已有回执和历史，不盲目重复上传。
5. app 公证取得 `Accepted` 后 staple 并 validate。DMG 使用 `ditto` 保留 bundle 元数据，配合 `hdiutil create -srcfolder … -fs HFS+ -format UDZO`，不要使用会添加 FinderInfo 的旧 `pkg-dmg/makehybrid` 路径。现有 DMG 不覆盖，先保留或明确选择新路径。
6. DMG 上传前只读挂载，验证内部 app 的 `codesign --verify --deep --strict`、stapler 与 Gatekeeper；确认主程序 SHA256 与已公证 app 一致。随后签名、公证、staple/validate DMG，并执行 `spctl` 和 `hdiutil verify`。
7. 从最终 DMG 复制 app，在独立 HOME、profile、BROWSERCLAW_DIR、CLAUDE_CONFIG_DIR、CODEX_HOME、XDG 目录和 cwd 中核验启动、后端及语言同步。先等主扩展 READY，再确认 CDP 属于测试进程；不只隔离 Chromium profile。不重置用户配置、不替换现有安装。

源配置、钥匙串授权、公证或验证失败时停止，不用未公证预览包冒充正式发行，也不关闭系统安全保护。

## GitHub Releases

- 只在本仓库为冻结 main SHA 建立对应项目版本的 tag（本次 `v0.1.1`），不修改已有 `v0.1.0`，不要复活旧 tag 或推送 `--all` / `--mirror`。
- 创建 draft 后立即保存 release ID，使用 ID 或 releases 列表找回草稿；草稿的按 tag 查询可能返回 404，不能据此重复创建。
- 先创建明确 target SHA 的 draft，上传已公证 DMG、最终 `SHA256SUMS` 与来源信息。DMG staple 完成后再计算校验和。
- 发行说明记录项目版本、Chromium/组件版本、架构、精确构建 SHA、签名团队、公证验证事实、对应源码和已知限制。
- 核验上传文件名、大小、checksum 与 tag SHA 后才发布 draft，不把草稿或上传成功等同于正式发布完成。

不要直接 dispatch 继承的全平台发行 workflow：它会提前公开组件、更新 feeds 并上传 R2，超出这个单平台 GitHub DMG 流程。这里不配置生产 OTA、Cloudflare 部署或上游服务凭据。
