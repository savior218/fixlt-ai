# 修必达（FixIt AI）

面向普通家庭用户的 AI 家电故障分诊与维修决策助手。响应式 Web 应用，兼容手机、平板、电脑浏览器。

> 团队成员快速上手：按「快速开始」两步即可跑起来。未配置 AI 密钥时，诊断会**明确提示失败并保留输入**，用户可重试或主动选择模板演示；不再静默回退 Mock 冒充真实 AI。

- 产品需求文档：`../智修AI_FixItAI_PRD_V1.0.md`（需求基线；产品曾用名"智修AI"，现名"修必达 FixIt AI"）
- 当前状态：**阶段十（诊断可信性、安全与稳定性）已合并**，DEV-13 完整 Tab 循环 focus trap 与阶段十三端交互修复已完成。

## 核心业务闭环（已全部打通）

进入诊断 → 描述故障 → AI 多轮问诊 → 查看结果和报告 → 保存维修档案 → 一键带入智能报修

- **内容来源可追溯**：每条诊断保存 `source`（真实 AI / 模板演示 / 来源未记录）与模型名；旧记录标「来源未记录」，不推断为真实 AI
- **AI 失败不伪装**：失败保留设备、描述与全部问答，明确提示原因，允许重试；模板演示必须由用户主动选择，保存后来源标识仍然清楚
- **完整问答上下文**：每轮保存问题 ID、问题文本、回答与“未知”标记；「不知道 / 没试过」只作待确认信息，不升级为已确认事实
- **标准 / 长辈双文案**：同一次诊断保存两套表达，共用事实、原因排序与行动含义；切换模式不重新调用模型、不改变风险判断
- **安全守护（前后端独立）**：高风险关键词由前端规则与后端规则分别拦截；后端不信任前端风险等级，高风险请求直接 409 且不调用模型
- **长辈关怀模式**：顶栏切换，仅改文案表达风格，结论/风险判定不变

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + React Router + Zustand |
| 后端 | Python + FastAPI + SQLAlchemy + Pydantic |
| 数据库 | SQLite（开发期，生产可评估 PostgreSQL） |
| AI | 智谱 GLM glm-4-flash（OpenAI 兼容协议，默认 60s 超时，可用 `FIXITAI_AI_TIMEOUT_SECONDS` 调整） |
| 测试 | pytest（后端）、Vitest（前端单元）、playwright-core（浏览器 E2E / 截图） |

## 目录结构

```
fixitai/
├─ frontend/
│  ├─ src/components/       # 公共组件（TopBar/SidebarNav/MobileNavDrawer/ModalDialog/SourceBadge 等）
│  ├─ src/pages/            # 业务页面（Home/Diagnose/Result/Report/Repair/Devices/Records/Settings）
│  ├─ src/config/navigation.ts  # 导航单一数据源（侧栏与抽屉共用）
│  ├─ src/services/         # API、诊断服务、问诊问题脚本、报修服务
│  ├─ src/utils/            # 安全规则、诊断数据兼容
│  ├─ src/__tests__/        # Vitest 单元测试
│  └─ scripts/              # 构建脚本、阶段十 E2E / 截图脚本
├─ backend/app/
│  ├─ api/ models/ schemas/ services/
│  ├─ ai/glm_client.py      # 智谱 GLM 客户端（异常分类 + 输出校验）
│  ├─ safety/rules.py       # 独立安全规则引擎（版本 SAFETY-2026-11-18-A）
│  └─ services/facts.py     # 服务端事实 / 未知信息构造
├─ knowledge_base/          # 设备故障知识条目（Markdown）
├─ tests/                   # 后端测试（含前后端安全规则一致性测试）
├─ .env.example
└─ README.md
```

## 快速开始

### 1. 后端（端口 8000）

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env    # 需要真实 AI 时在 .env 填入 FIXITAI_AI_API_KEY
.venv\Scripts\python -m uvicorn app.main:app --reload
```

- 健康检查：http://127.0.0.1:8000/api/health
- 接口文档：http://127.0.0.1:8000/docs（public 模式自动关闭）

### 2. 前端（端口 5173，已配置 /api 代理到 8000）

```powershell
cd frontend
npm install
npm run dev
```

- 访问：http://localhost:5173
- 生产构建：`npm run build`（先 tsc 类型检查，再 vite build）

### 3. 运行测试

```powershell
# 后端（在 backend 目录）
.venv\Scripts\python -m pytest ../tests

# 前端（在 frontend 目录）
npm test
npm run e2e:stage11   # 需先启动前后端；浏览器验收注册/登录/设备隔离/三端
```

## 环境变量与密钥安全

- 复制 `backend/.env.example` 为 `backend/.env`，填入智谱 API Key（https://open.bigmodel.cn 控制台获取）。
- **真实密钥仅存放在后端 `.env`（已在 .gitignore 中排除，严禁提交/泄露到前端）**。
- 留空 = AI 未配置：诊断请求会返回 `ai_not_configured`，前端明确提示并提供「重试真实 AI / 查看模板演示（非 AI）」。
- 公开服务建议设置 `FIXITAI_DEPLOYMENT_MODE=public`，会关闭交互式文档。
- 账号会话使用 HttpOnly Cookie + 服务端可撤销会话；`public` 模式必须配置 `FIXITAI_SESSION_SECRET`，否则服务拒绝启动，禁止使用硬编码默认密钥。
- 修改数据的接口要求 `X-CSRF-Token`；设备归属由服务端会话决定，旧的 `X-User-Id` 机制已移除。
- 线上账号与设备必须配置可持久化的 `FIXITAI_DATABASE_URL`（PostgreSQL）。未配置时容器内 SQLite 会在重新部署后丢失。
- 本地开发默认 SQLite；数据库连接凭据不要提交到版本库或发送到聊天。

## 三端适配约定（团队协作必读）

- 断点统一 **1024px**：≥1024 桌面侧栏，<1024 顶栏汉堡 + 抽屉导航（六入口 + 安全守护一致）
- 导航只改 `config/navigation.ts` 一个文件，侧栏/抽屉自动同步
- 弹窗：`<sm` 底部弹层，`≥sm` 居中；正文独立滚动，Tab 焦点循环限制在弹窗内，关闭后焦点归还触发元素
- 抽屉：Esc 关闭、背景滚动锁定、Tab 循环、关闭恢复焦点；视口达到桌面宽度自动关闭
- 长文本使用 `break-words`；不全局裁切；输入法组合状态下 Enter 不发送
- 长辈模式只改文案风格，**不得改变结论、原因排序、风险判定结果**
- 安全关键词拦截前后端各有一套独立规则，规则版本与关键词由 `tests/test_safety_parity.py` 比对

## 常见问题（FAQ）

- **后端没启动会怎样？** 前端正常打开，设备列表显示错误横幅与重试按钮；诊断明确提示无法连接，不伪造 AI 结果。
- **真实 AI 诊断要多久？** 取决于模型服务，前端显示真实等待状态，不显示虚构进度；可随时取消等待。
- **没有 AI 密钥如何演示？** 在失败提示中主动点击「查看模板演示（非 AI）」，结果页与报告页会持续标注来源。
- **诊断数据存在哪？** 设备等账号私有数据保存在服务端数据库（本地默认 SQLite，线上需 PostgreSQL）；诊断草稿与维修记录保存在浏览器本地并按账号隔离，旧记录保留为独立的本机历史。
- **问诊草稿会丢吗？** 不会。草稿/偏好/维修记录本地持久化；旧版本草稿会在对应关系明确时迁移，不编造问题。

## 开发阶段（对应 PRD 第 17 章）

- [x] DEV-01 项目初始化与技术架构
- [x] DEV-02 UI 规范与公共组件
- [x] DEV-03 首页与导航
- [x] DEV-04 诊断页面与交互
- [x] DEV-05 后端 API 和数据库
- [x] DEV-06 AI 模型接入（智谱 GLM glm-4-flash）
- [x] DEV-07 多轮故障诊断
- [x] DEV-08 安全规则引擎（前后端独立拦截）
- [x] DEV-09 诊断报告
- [x] DEV-10 智能报修助手
- [x] DEV-11 设备档案与维修记录
- [x] DEV-12 长辈关怀模式
- [x] DEV-13 基础无障碍适配（焦点管理、Tab 循环 focus trap、弹窗 Esc 关闭）
- [x] DEV-14 测试与优化（后端 pytest、前端 Vitest、三端浏览器验收）
- [x] DEV-15 部署与公开访问（单容器部署：Dockerfile + render.yaml）

## 部署（单服务公开访问）

工程支持单容器部署：FastAPI 托管前端构建产物，前后端同源。构建前端后，将 `FIXITAI_FRONTEND_DIST_DIR` 指向 `frontend/dist`：

- `/` 返回前端首页；业务深链接刷新回退到 `index.html`
- 未匹配的 `/api/*` 返回 404，不回退成前端 HTML
- `/api/health` 可用于健康检查

推送到 GitHub 后在 Render 控制台选择 Blueprint（自动读取 `render.yaml`）即可获得公开 URL；或使用根目录 `Dockerfile` 部署到任意 Docker 平台。详细步骤见 `../比赛提交材料/部署指南.md`。
