# 修必达（FixIt AI）

面向普通家庭用户的 AI 家电故障分诊与维修决策助手。响应式 Web 应用，兼容手机、平板、电脑浏览器。

> 团队成员快速上手：按「快速开始」两步即可跑起来；没有 AI 密钥也能完整演示（自动回退本地 Mock）。

- 产品需求文档：`../智修AI_FixItAI_PRD_V1.0.md`（需求基线；产品曾用名"智修AI"，现名"修必达 FixIt AI"）
- 当前状态：**DEV-01 ~ DEV-12 完成，三端适配实施与验收通过（45/45）**，可进入「后端数据闭环与真实 AI 接入」深化阶段

## 核心业务闭环（已全部打通）

进入诊断 → 描述故障 → AI 多轮问诊 → 查看结果和报告 → 保存维修档案 → 一键带入智能报修

- **安全守护**：漏电/燃气/火灾等高风险关键词由前端本地拦截（不经过 LLM），标准模式与长辈模式判定完全一致
- **长辈关怀模式**：顶栏切换，仅改文案表达风格，结论/风险判定不变
- **AI 诊断**：智谱 GLM（glm-4-flash，OpenAI 兼容协议），单次调用同时生成标准/长辈双份文案；未配置密钥时自动回退本地 Mock，可离线演示
- **演示状态标注**：一键联系维修、图片上传、语音输入、报告导出等未接入功能均有明确「演示」标识

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + React Router + Zustand |
| 后端 | Python + FastAPI + SQLAlchemy + Pydantic |
| 数据库 | SQLite（开发期，生产可评估 PostgreSQL） |
| AI | 智谱 GLM glm-4-flash（OpenAI 兼容协议，60s 超时） |

## 目录结构

```
fixitai/
├─ frontend/src/
│  ├─ components/           # 公共组件（TopBar/SidebarNav/MobileNavDrawer/ModalDialog 等）
│  ├─ pages/                # 业务页面（Home/Diagnose/Result/Report/Repair/Devices/Records/Settings）
│  ├─ config/navigation.ts  # 导航单一数据源（侧栏与抽屉共用）
│  ├─ stores/ services/ hooks/ accessibility/ styles/
├─ backend/app/
│  ├─ api/ models/ schemas/ services/
│  ├─ ai/glm_client.py      # 智谱 GLM 客户端
│  ├─ knowledge/ safety/ database/ core/
├─ knowledge_base/          # 设备故障知识条目（Markdown）
├─ tests/                   # 后端测试
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
- 接口文档：http://127.0.0.1:8000/docs

### 2. 前端（端口 5173，已配置 /api 代理到 8000）

```powershell
cd frontend
npm install
npm run dev
```

- 访问：http://localhost:5173
- 生产构建：`npm run build`

### 3. 运行后端测试

```powershell
cd backend
.venv\Scripts\python -m pytest ../tests
```

## 环境变量与密钥安全

- 复制 `backend/.env.example` 为 `backend/.env`，填入智谱 API Key（https://open.bigmodel.cn 控制台获取）。
- **真实密钥仅存放在后端 `.env`（已在 .gitignore 中排除，严禁提交/泄露到前端）**。
- 留空 = AI 未配置，前端自动回退本地诊断（离线演示模式），功能流程完整可演示。

## 三端适配约定（团队协作必读）

- 断点统一 **1024px**：≥1024 桌面侧栏，<1024 顶栏汉堡 + 抽屉导航（六入口 + 安全守护一致）
- 导航只改 `config/navigation.ts` 一个文件，侧栏/抽屉自动同步
- 新增组件遵循：弹窗正文可滚动 + 底部按钮固定；筛选栏/设置控件窄屏堆叠；长文本 `break-words`
- 长辈模式只改文案风格，**不得改变结论、原因排序、风险判定结果**
- 安全关键词拦截逻辑必须保留在前端本地，LLM 不参与风险判定
- 所有新功能必须保留本地 Mock 降级能力（无 API 配置可离线演示）

## 常见问题（FAQ）

- **后端没启动会怎样？** 前端正常打开，设备列表显示错误横幅与重试按钮；诊断自动回退 Mock 模式。
- **真实 AI 诊断要多久？** GLM 实际响应约 30~35 秒，前端有加载气泡，接口超时 60 秒，请耐心等待。
- **诊断数据存在哪？** 开发期 SQLite（`backend/fixitai.db`，已 gitignore），首次启动自动建表并写入演示用户与示例设备。
- **问诊草稿会丢吗？** 不会。草稿/偏好/维修记录本地持久化，刷新与窗口调整均保留。

## 开发阶段（对应 PRD 第 17 章）

- [x] DEV-01 项目初始化与技术架构
- [x] DEV-02 UI 规范与公共组件
- [x] DEV-03 首页与导航
- [x] DEV-04 诊断页面与交互
- [x] DEV-05 后端 API 和数据库
- [x] DEV-06 AI 模型接入（智谱 GLM glm-4-flash）
- [x] DEV-07 多轮故障诊断
- [x] DEV-08 安全规则引擎（前端本地拦截）
- [x] DEV-09 诊断报告
- [x] DEV-10 智能报修助手
- [x] DEV-11 设备档案与维修记录
- [x] DEV-12 长辈关怀模式
- [x] DEV-13 基础无障碍适配（焦点管理、弹窗 Esc 关闭已完成；完整 Tab 循环 focus trap 待收尾）
- [x] DEV-14 测试与优化（后端 pytest、45 项三端验收通过）
- [x] DEV-15 部署与公开访问（单容器部署：Dockerfile + render.yaml，见 `../比赛提交材料/部署指南.md`）

## 部署（单服务公开访问）

工程支持单容器部署：FastAPI 托管前端构建产物，前后端同源。推送到 GitHub 后在 Render 控制台选择 Blueprint（自动读取 `render.yaml`）即可获得公开 URL；或使用根目录 `Dockerfile` 部署到任意 Docker 平台。详细步骤见 `../比赛提交材料/部署指南.md`。
