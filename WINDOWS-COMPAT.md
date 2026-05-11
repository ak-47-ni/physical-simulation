# Physics Sandbox — Windows 兼容适配记录

## 概览

该项目原为 macOS 平台开发，在 Windows 11 上适配运行共涉及 **3 个兼容性问题**，涉及前端配置、Tauri 构建资源、Rust 后端路径处理。以下逐一说明。

---

## 修复一：Vite 开发服务器端口冲突

### 涉及文件
- `apps/desktop/vite.config.ts`
- `apps/desktop/src-tauri/tauri.conf.json`

### 问题
Tauri 配置文件 `tauri.conf.json` 中 `devUrl` 原值为 `http://localhost:1420`，但 Vite 配置中未指定端口（使用默认值 5173），导致 Tauri 壳启动后无法连接到 Vite 开发服务器。更严重的是，端口 **1420 在 Windows 上属于系统保留端口**（Windows 的 `netsh interface portproxy` 保留范围或 Hyper-V 动态端口范围的一部分），即使手动指定也无法绑定（`EACCES: permission denied`）。

### 修复
1. `vite.config.ts` — 添加 `server` 配置，固定端口 `5173`，并启用 `strictPort: true` 避免冲突时静默跳转其他端口：

```ts
server: {
  port: 5173,
  strictPort: true,
},
```

2. `tauri.conf.json` — 将 `devUrl` 从 `http://localhost:1420` 改为 `http://localhost:5173`，与 Vite 端口保持一致。

### 原理
Windows 的 TCP/IP 端口分配策略与 macOS 不同。macOS 的临时端口范围默认从 49152 开始，1420 可用；Windows 的默认动态端口范围通常从 1025 开始，且部分低端口被系统组件预留。应选用 1024 以上的非特权端口，并确保不在 Windows 排除列表中（可通过 `netsh int ipv4 show excludedportrange tcp` 查看）。

---

## 修复二：缺失 Windows 应用图标 (icon.ico)

### 涉及文件
- `apps/desktop/src-tauri/icons/icon.ico`（新建）

### 问题
原项目仅在 `icons/` 目录下提供了 `icon.png`（104 字节占位图），缺少 Windows 必需的 `icon.ico` 文件。Tauri 的 `tauri-build` crate 在 Windows 平台编译时，会在 `build.rs` 中调用 `tauri-winres` 生成 Windows Resource 文件，该过程强制要求 `icons/icon.ico` 存在，否则编译失败：

```
`icons/icon.ico` not found; required for generating a Windows Resource file during tauri-build
```

### 修复
用 Node.js 将现有 `icon.png` 封装为合法的 ICO 文件（ICO 格式支持内嵌 PNG 数据，自 Windows Vista 起原生支持）。操作等效于：

1. 读取原始 icon.png（32x32 像素 PNG）
2. 按 ICO 文件格式构造：6 字节头部 + 16 字节图标目录项 + PNG 原始数据
3. 写入 `icons/icon.ico`

### 原理
ICO 文件是 Windows 原生图标容器格式。`tauri-build` 在 `#[cfg(target_os = "windows")]` 条件下调用 `tauri-winres::WindowsResource::new()` 设置窗口属性（如产品名称、文件版本等），该步骤会读取 `icons/icon.ico` 嵌入编译产物。macOS 使用 `.icns` 格式，因此原开发者不需要此文件。

---

## 修复三：硬编码 Unix 临时目录路径 `/tmp/`

### 涉及文件
- `apps/desktop/src-tauri/src/main.rs`

### 问题
原代码中运行时 trace 日志路径硬编码为 `/tmp/physics-sandbox-runtime-trace.jsonl`。`/tmp/` 是 Unix 文件系统约定，Windows 上不存在此路径，导致每次 IPC 命令调用都输出错误：

```
failed to reset runtime trace file /tmp/physics-sandbox-runtime-trace.jsonl:
  系统找不到指定的路径。 (os error 3)
```

虽不影响核心功能，但会在每次场景编译、运行时控制、帧步进等操作时产生噪音，且 trace 数据完全丢失。

### 修复
1. 删除硬编码常量 `DEFAULT_RUNTIME_TRACE_PATH`
2. 修改 `default_runtime_trace_path()` 函数，非测试模式下使用 `std::env::temp_dir()` 获取系统临时目录：

```rust
// 修改前（仅非测试分支）
PathBuf::from("/tmp/physics-sandbox-runtime-trace.jsonl")

// 修改后
std::env::temp_dir().join("physics-sandbox-runtime-trace.jsonl")
```

该函数的测试分支本身已经使用了 `std::env::temp_dir()`，因此修改后行为与测试代码一致。

### 原理
Rust 标准库的 `std::env::temp_dir()` 会根据操作系统返回正确的临时目录路径：
- Windows → `C:\Users\{用户名}\AppData\Local\Temp\`
- macOS → `/var/folders/.../T/` 或 `$TMPDIR`
- Linux → `/tmp/`

---

## 环境准备

### Rust 工具链
项目需要 Rust 工具链编译 Tauri 原生后端。本次安装到 F 盘：

- `RUSTUP_HOME=F:\.rustup`
- `CARGO_HOME=F:\.cargo`

### pnpm 依赖
项目使用 pnpm 工作区管理前端依赖，运行 `pnpm install` 安装后即可。

### Tauri CLI
额外安装了 `cargo tauri` CLI 工具（`cargo install tauri-cli`），后续可用 `cargo tauri dev` 一键启动（自动同时启动 Vite 和 Tauri 壳）。

---

## 总结

| 问题 | 类型 | 影响 | 修复方式 |
|------|------|------|----------|
| 端口 1420 被 Windows 保留 | 前端/配置 | Tauri 无法连接 Vite | 改用 5173，两端同步 |
| 缺少 icon.ico | Tauri 构建 | 编译失败 | 从 PNG 生成 ICO |
| `/tmp/` 路径不存在 | Rust 后端 | trace 文件写入失败 | 改用 `std::env::temp_dir()` |

三个问题均属于平台差异，非代码逻辑错误。修复后建议同事将以上改动合入主分支，后续即可保证 macOS / Windows 双平台正常开发运行。
