# KIKO（桌面 AI 助手）

一个简体中文、极简、多项目独立记忆的桌面 AI 助手（目前只支持Windows），带 KIKO 熊猫桌宠。Electron + Vue 3，数据保存在本机用户目录。

## 功能
- **多项目独立状态**：已完成、进行中、卡点、下一步、待办、决策、历史时间线。
- **自然语言整理**：告诉助手工作进展，兼容 OpenAI Chat Completions API 的模型整理为结构化更新；**先预览、后确认、再写入**。
- **记忆安全**：已完成/决策/待办只追加不覆盖；每次更新保留快照，可一键**撤销上次更新**；AI 返回内容先校验结构，非法即拒收且原数据不动。
- **恢复上下文**：时隔多日打开项目自动显示"上次做到哪"横幅；历史时间线可追溯每条原始输入。
- **待办与提醒**：从自然语言提取待办（标题/到期/优先级），到期通过 Windows 系统通知提醒（可在设置中关闭）。
- **多服务商**：内置 DeepSeek / 通义千问 / Kimi 预设，支持连接测试与自定义地址；密钥经 Electron `safeStorage` 加密（Windows 凭据保护）。
- **数据安全**：本地 JSON 原子写入 + 串行写队列、手动导出备份（不含密钥）、从备份校验后恢复（恢复前自动留档现有数据）。
- **桌面体验**：系统托盘（打开/快速记录/设置/退出）、可自定义全局快捷键（默认 `Ctrl+Shift+Space`）、窗口置顶、窗口位置记忆、开机启动可选、项目搜索（`Ctrl+K`）、保存状态提示、超 7 天未备份提醒。
- **KIKO 桌宠**：透明置顶小窗，可拖动（位置记忆）、单击打开、双击速记、右键菜单；AI 整理时工作、成功时庆祝、失败时沉思、待办到期弹气泡，5 分钟无互动自动休息；设置中可关。形象由 `tools/slice.js` 从 `kiko.png` 切图，应用图标由 `tools/make-ico.js` 生成 `build/icon.ico`。

## Windows 开发运行
1. 安装 Node.js 20 或更高版本。
2. 获取源码：`git clone https://github.com/qqchen6903/KIKO.git`（或下载 ZIP 解压），在项目目录打开 PowerShell。
3. 执行：
   ```powershell
   npm install
   npm start        # 自动构建前端并启动应用
   npm test         # 共享逻辑单元测试
   node_modules\.bin\electron test\ui-smoke.js   # 真实 Electron 的 UI 冒烟自动化
   ```
4. 打开应用右上角「设置」，选择服务商预设（默认 DeepSeek），填入 API Key，可点「测试连接」验证。

> 国内网络建议保留项目内 `.npmrc`（Electron 与 electron-builder 二进制走 npmmirror 镜像）。

## 打包 Windows 安装程序
在 Windows 电脑执行：
```powershell
npm install
npm run dist:win
```
安装程序输出到 `release` 目录。也可推送到 GitHub，由 `.github/workflows/build-windows.yml` 自动构建并下载 Artifact。

## 工程结构
```
├─ src/
│  ├─ main.js            # Electron 主进程（数据、加密、托盘、提醒、模型调用、写队列）
│  ├─ preload.js         # contextBridge 白名单
│  ├─ shared.js          # 校验/合并/迁移纯逻辑（主进程、渲染层、测试三方共用）
│  ├─ storage.js         # Markdown 存储层（读写/迁移/原子写）
│  ├─ app/               # Vue 3 渲染层（SFC 组件、store、Apple 风格样式）
│  ├─ public/kiko/       # 桌宠形象与图标（tools/slice.js 从 kiko.png 切图生成）
│  └─ dist/              # Vite 构建产物（npm start 自动生成，勿手改）
├─ test/                 # 单元测试（node --test）与 UI 冒烟自动化（electron test/ui-smoke.js）
├─ tools/                # 切图与图标生成脚本
├─ build/                # 打包资源（icon.ico）
├─ docs/                 # 项目文档（现状与后续计划、待办登记）
├─ .github/workflows/    # CI：打 v* 标签自动构建 Windows 安装包
└─ kiko.png              # 形象图版源文件
```

## 数据位置
默认在 `%APPDATA%\KIKO`，**可在「设置 → 数据存储位置」改到任意目录**（切换时数据自动复制过去，原目录保留）。目录结构：
- `projects/*.md`：**每个项目一个 Markdown 文件**（frontmatter 为机器态：状态字段/历史/撤销快照；正文是可读副本：概况、卡点、待办任务列表、决策、时间线），可备份、可用任何编辑器查看
- `index.json`：应用配置（服务地址、快捷键、窗口/桌宠位置等，不含 Key）
- `provider.enc`：加密后的 API Key（safeStorage）
- `archive/pre-restore-*.json`：每次恢复备份前对现有数据的自动留档
- `config.json`（位于 `%APPDATA%\KIKO`）：记录自定义数据目录指针

v1.x 的旧 `workspace.json` 首次启动自动迁移为 md 并留 `.bak` 档。建议定期点击「导出备份」（单文件 JSON，不含 API Key，可跨目录恢复）。

## 安全与限制
- 目前仅支持 OpenAI-compatible `/chat/completions` 接口；模型供应商的 API 使用和费用由用户自己的账户承担。
- 如果 Windows 环境不支持 Electron `safeStorage`，程序会退回本地文件保存密钥；设置界面会提示这一点。请勿在公用 Windows 账户使用。
- AI 返回内容仍需人工核对（因此更新采用预览确认制）；程序保留输入历史，不自动删除旧记录。
- 实机验收清单（真实模型联调、托盘/快捷键、开机启动、系统通知、安装与卸载）见 `docs/桌面AI工作助手_项目现状与后续计划.md` 第十节。

