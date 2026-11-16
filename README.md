# 智修AI（FixItAI）

面向普通家庭用户的 AI 家电故障分诊与维修决策助手。响应式 Web 应用，兼容 PC 与移动端浏览器。

- 产品需求文档：`../智修AI_FixItAI_PRD_V1.0.md`（需求基线）
- 当前进度：DEV-01 项目初始化与技术架构

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + React Router + Zustand |
| 后端 | Python + FastAPI + SQLAlchemy + Pydantic |
| 数据库 | SQLite（开发期，生产可评估 PostgreSQL） |

## 目录结构

```
fixitai/
├─ frontend/src/
│  ├─ components/ pages/ layouts/ hooks/
│  ├─ services/ stores/ accessibility/ styles/
├─ backend/app/
│  ├─ api/ models/ schemas/ services/
│  ├─ ai/ knowledge/ safety/ database/ core/
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

### 3. 运行后端测试

```powershell
cd backend
.venv\Scripts\python -m pytest ../tests
```

## 数据库

开发期使用 SQLite（`backend/fixitai.db`，已加入 .gitignore）。首次启动后端时自动建表并写入演示用户（id=1）与示例设备。表结构对应 PRD 第 10 章：users、user_preferences、devices、diagnoses、messages、repair_records、knowledge_documents。

## 环境变量

参考 `.env.example`。AI 模型密钥仅通过服务端环境变量注入（DEV-06 接入统一模型适配层）。

## 开发阶段（对应 PRD 第 17 章）

- [x] DEV-01 项目初始化与技术架构
- [ ] DEV-02 UI 规范与公共组件
- [ ] DEV-03 首页与导航
- [ ] DEV-04 诊断页面与交互
- [ ] DEV-05 后端 API 和数据库（设备 CRUD 已就绪，其余随 DEV-04/07 补充）
- [ ] DEV-06 AI 模型接入
- [ ] DEV-07 多轮故障诊断
- [ ] DEV-08 安全规则引擎
- [ ] DEV-09 诊断报告
- [ ] DEV-10 智能报修助手
- [ ] DEV-11 设备档案与维修记录
- [ ] DEV-12 长辈关怀模式
- [ ] DEV-13 基础无障碍适配
- [ ] DEV-14 测试与优化
- [ ] DEV-15 部署与公开访问
