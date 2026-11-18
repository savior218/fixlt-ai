# 修必达 FixIt AI · 工作进度与完成效果报告（V2）

> 汇报日期：2026-11-18
> 本报告承接第一版《智修AI_阶段九工作进度与完成效果报告》（存于工作区根目录，未纳入本仓库，与本文件分开存放互不覆盖），覆盖阶段九完成之后的全部工作：产品更名、比赛合规补齐、部署能力建设与线上发布验收
> 结论：**产品已部署至可公开访问的线上环境，真实 AI 诊断在线上生效，比赛要求的交付形态已全部达成**
>
> 线上体验地址：<https://fixlt-ai.onrender.com>

---

## 一、总体进度对照（承接 V1 的 9 阶段）

V1 报告时点：任务书 9 个开发阶段全部完成，本地可演示。本次 V2 新增三项里程碑：

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 产品更名「修必达 FixIt AI」（品牌定位：修必达，坏了必达） | ✅ 完成 |
| M2 | 比赛合规四件套（图标 / 隐私说明 / 权属说明 / TRAE 过程记录） | ✅ 完成 |
| M3 | 单容器部署能力 + 线上发布（Render）+ 线上验收 | ✅ 完成 |

---

## 二、M1 产品更名明细

产品定名 **修必达 FixIt AI**（英文名按比赛要求 FixIt AI，中文名重新命名以区别于原方案）。

| 改动位置 | 内容 |
|---|---|
| 前端全部页面文案 | 品牌名替换为「修必达 FixIt AI」，页面 `<title>` 更新 |
| `backend/app/core/config.py` | `app_name = "修必达 FixIt AI"`（/api/health、/docs 同步生效） |
| `backend/app/api/diagnose.py` | system prompt 中 AI 自我介绍改为「修必达（FixIt AI）家用家电维修助手」 |
| `README.md`、`.env.example` | 品牌名与说明更新 |
| 代码标识符 | 保留 `fixitai` 命名空间不变（避免无意义的大规模重构） |

浏览器回归确认：UI 无旧名残留。

---

## 三、M2 比赛合规四件套

| 交付物 | 位置 | 说明 |
|---|---|---|
| 产品图标 | `frontend/public/favicon.svg` | 品牌蓝底 + 白色扳手，全站生效 |
| 隐私说明 | 设置页「隐私与数据」模块弹窗 | 收集范围 / 存储方式 / AI 处理说明 / 用户控制权四节，浏览器验证通过 |
| 权属与团队分工说明 | `比赛提交材料/权属与团队分工说明.md` | 含第三方许可证清单（React / FastAPI / 智谱 GLM 等），成员信息留占位待填 |
| TRAE 开发过程记录清单 | `比赛提交材料/TRAE开发过程记录清单.md` | 10 阶段任务表 + 5 个关键 Session ID + 截图清单，佐证 AI 辅助开发过程 |

---

## 四、M3 部署能力建设与线上发布

### 4.1 单服务部署架构

前端构建产物由 FastAPI 统一托管，单容器前后端同源，无跨域问题：

```
用户浏览器 ──► Render 容器（uvicorn:10000）
                ├─ /api/*      FastAPI 路由（health / devices / diagnose）
                ├─ /assets/*   静态资源（Vite 构建产物）
                └─ /*          SPA 回退 → index.html（含防目录穿越校验）
```

| 文件 | 说明 |
|---|---|
| `Dockerfile` | 两阶段构建：node:20-slim 构建前端 → python:3.11-slim 运行后端 + 托管 dist |
| `render.yaml` | Render Blueprint 配置（Docker 服务 + 10000 端口 + 健康检查路径） |
| `backend/app/main.py` | 生产模式：`FIXITAI_FRONTEND_DIST_DIR` 非空时启用 SPA 托管；本地开发留空走 Vite dev server |

### 4.2 代码仓库布局（双远程）

| 远程 | 地址 | 用途 |
|---|---|---|
| `origin` | <https://gitee.com/savior218/fix-ai> | 主仓库（国内团队协作） |
| `github` | <https://github.com/savior218/fixlt-ai> | Render 部署镜像仓库（Render 仅支持 GitHub/GitLab 拉取） |

推送链路：本地 commit → 同时 push Gitee + GitHub（GitHub 走本地代理）→ Render 检测到 push 自动重新部署。

### 4.3 部署过程与一次真实问题修复

部署后线上验收发现：访问 `/` 返回 API 根 JSON 而非前端页面。

- **根因**：`main.py` 中显式注册的 `@app.get("/")` 抢占了后注册的 `/{full_path:path}` SPA 回退路由（Starlette 按注册顺序匹配）
- **修复**：SPA 回退提前注册；同时补强——未匹配的 `/api/*` 返回 404 而非 index.html；删除冗余的 API 根路由（`/docs`、`/api/health` 保留）
- **验证**：后端 pytest 3/3 通过 → 本地 uvicorn 冒烟（`/`、`/diagnose` 返回 HTML，`/api/nonexistent` 正确 404）→ 推送后 Render 自动重新部署 → 线上复验通过
- 提交：`95e4baa fix: 修复生产环境根路径被 API 根路由抢占导致首页 404 的问题`

### 4.4 线上验收记录（2026-11-18 实测）

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 首页 `https://fixlt-ai.onrender.com/` | ✅ 200，返回前端页面（lang="zh-CN"） |
| 2 | SPA 路由 `/diagnose` | ✅ 200 text/html |
| 3 | JS 资源 `/assets/index-*.js`（约 312KB） | ✅ 200 |
| 4 | 健康检查 `/api/health` | ✅ `{"status":"ok","app":"修必达 FixIt AI"}` |
| 5 | 设备 API `/api/devices`（含种子数据：客厅空调/格力 KFR-35GW 等） | ✅ 200 |
| 6 | **真实 AI 诊断** `POST /api/diagnose/complete` | ✅ **200（线上已配置智谱 GLM 密钥，非 Mock 模式）** |

### 4.5 运行环境说明

- 部署平台：Render（Docker 单容器，免费档）
- 免费档限制：15 分钟无访问自动休眠，首次访问约 30~50 秒唤醒 → **演示/答辩前先打开页面预热**
- AI 服务：智谱 GLM `glm-4-flash`，密钥通过 Render 环境变量 `FIXITAI_AI_API_KEY` 注入，不写入代码
- 详细部署步骤与复部署方法见 `比赛提交材料/部署指南.md`

---

## 五、当前整体能力快照（截至 V2）

- **核心闭环**：设备管理 → 四步问诊（含安全关键词本地拦截）→ 真实 GLM 诊断（标准/长辈双文案）→ 报修工单 → 维修记录档案
- **两条红线**：风险判定仍在前端 `risk.ts` 本地完成，LLM 不参与风险判断；长辈模式只改表达不改判断
- **降级能力**：GLM 未配置或调用失败时前端自动回退本地 Mock，断网仍可演示
- **线上形态**：单 URL 公开访问，前后端同源，真实 AI 生效

## 六、下一步候选（未开发清单，承接 V1 第四节）

V1 列出的边缘功能状态不变，按优先级：

1. **P1**：故障照片上传 + 视觉 AI 诊断（后端已预留 `ai_vision_model` 配置位，可接 GLM-4V）
2. **P1**：AI 动态追问（问诊问题由 LLM 动态生成）
3. **P2**：语音输入 / 朗读（Web Speech API）、报告导出 PDF、后端记录持久化 API
4. **P3**：注册登录用户体系、真实维修对接、通知系统

## 七、待人工补充事项

- [ ] `比赛提交材料/权属与团队分工说明.md` 中团队成员姓名与分工
- [ ] 报名表「体验入口」填入 <https://fixlt-ai.onrender.com>
