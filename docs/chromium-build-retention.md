# Chromium 构建资产长期保留

源码下的 `chromium/` 和 `.local-builds/chromium-arm64` 保存已完整编译并发布 v0.1.3 的工作树与配套产物，**不是可自动删除的缓存**。`.gitignore` 只防止误提交，不提供操作系统级防删；实际清理必须遵守本项目与全局保留规则。

## 当前构建链

- Chromium 主树：`/Users/ai/Documents/VibeApp/reBrowser/chromium/src`，完整增量输出为其 `out/Default_browserclaw_arm64`。保持原路径层级，避免 GN 中指向 Xcode 等系统工具的相对路径失效。
- 配套构建根：`/Users/ai/Documents/VibeApp/reBrowser/.local-builds/chromium-arm64`。其 `chromium` 是到源码根目录 `chromium/` 的兼容链接；主树包含源码、对象文件、Ninja 元数据及固定工具链，配套根还保存 Go 缓存、depot_tools、源码压缩包、发布包及回退应用。
- 旧外部路径 `/Users/ai/Documents/RemocodeBrowserBuild/native-url-completion-20261025` 已按用户要求删除。环境脚本、当前状态指针及 28 个工具/缓存链接均已迁到新位置，不再依赖或重建旧路径。历史回执保留原始路径，仅作为历史记录。 同时迁移了两份生成依赖清单的 1,462 处绝对路径并保留其修改时间，避免无谓的 719 项连带构建；删除旧链接后的 Ninja 干跑已确认 `no work to do`。
- 正式构建源码/资源和 Python venv：`/Users/ai/Documents/RemocodeBrowserBuild/release-0.1.3-20261025`。当前工作区可能包含其他未提交改动，不得把这些改动套用到已发布构建树。
- 固定 Python 环境：`/Users/ai/Library/Caches/vpython-root.501/store/python_venv-qn2o61rehrrebrlo87po2vbce0` 及其基础解释器 `cpython+imtqbdtj1fpfsbh62ifqjedh7c`。它们虽然位于 Caches，仍是需要保留的编译输入。
- 机器级清单：`/Users/ai/.config/rebrowser-build-retention.json`。

## 复用增量构建

```sh
cd /Users/ai/Documents/VibeApp/reBrowser
source ./.local-builds/chromium-arm64/native-env.sh
./chromium/src/third_party/ninja/ninja -C ./chromium/src/out/Default_browserclaw_arm64 -n chrome
# 查看计划确认只包含预期改动后，移除 -n 并保留 -j 2 才会实际编译。
```

迁移检查曾发现多加两级目录会破坏已有 GN 的相对 SDK 路径，故把主树固定在源码根目录 `chromium/`。迁移通过同卷 rename 完成，保留编译对象文件 inode/mtime；旧外部链接随后已完成引用迁移并删除，新目录内部 `chromium` 链接继续保留。不要为了改目录名重新生成 GN、重新应用 435 个补丁或重新同步整个源码。后续真实改动仍需按目标修改配置并编译；保留缓存不能保证编译器版本、GN 参数或大规模源码升级后仍然零重编译。

## 清理边界

普通垃圾清理、磁盘空间告警、Git ignored 状态、长时间不使用或进程已退出均不构成删除授权。清理候选只要是保留路径、其子目录、别名，或包含保留路径的父目录，都必须跳过。禁止对此树执行 `git clean -fdx`、GN/Ninja clean、gclient reset/clean 或移入/清空废纸篓。需要删掉具体产物时，先列出精确路径、说明一天级冷编译风险并另行获得明确授权。
