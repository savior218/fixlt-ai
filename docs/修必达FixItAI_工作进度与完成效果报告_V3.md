# 修必达 FixIt AI · 项目进度总结（V3）

> 汇报日期：2026-11-20
> 本报告承接《修必达FixItAI_工作进度与完成效果报告_V2.md》（2026-11-18），覆盖 V2 之后的全部开发工作，并对项目全貌做一次总结
> 结论：**核心业务闭环 + 五大补全模块 + 账号体系 + 法务合规文档已全部完成；当前有一批未提交改动（法务文档与页脚规范化）待收尾提交**

---

## 一、一句话进度

产品已完成从「本地可演示」到「线上可公开访问」再到「功能补全 + 合规化」的三级跳，当前处于**比赛提交前的合规精修与收尾阶段**。

- 线上体验地址：<https://fixlt-ai.onrender.com>
- 代码仓库：Gitee <https://gitee.com/savior218/fix-ai>（主仓库）+ GitHub <https://github.com/savior218/fixlt-ai>（Render 部署镜像）
- PRD 全部 15 个 DEV 开发项（DEV-01 ~ DEV-15）已完成

## 二、开发时间线（自 V2 报告以来）

| 时间 | 里程碑 | 关键提交 |
|---|---|---|
| 2026-11-18 前 | V1：任务书 9 阶段 + PRD DEV-01~15 完成，本地可演示 | `f2f05d0` |
| 2026-11-18 | V2：产品更名修必达、比赛合规四件套、单容器部署上线 Render | `69fed61`、`95e4baa` |
| 阶段十 | 诊断可信性专项：来源标识（真实 AI / 模板演示）、AI 失败不伪装、完整问答上下文 | `ee1b55c` |
| 功能补全 | 报修工单闭环、AI 看图诊断（glm-4v-flash）、语音播报、通知中心（登录除外） | `de65de0` |
| 设计改版 | 全站切换 Claude 暖纸风（陶土主色 #C96442 / 暖纸底 / 衬线标题），三阶段精修 | `89b0621`、`c7ece0a` |
| 阶段十一 | 账号注册登录、资料修改、设备按账号隔离 | `a801a2f` |
| 阶段十二 | 登录用户云端保存诊断报告与维修记录，支持本机历史导入 | `8a47c22` |
| 阶段十三 | 长辈友好语音朗读（全站单段播放、克制自动朗读、真实试听）+ 阶段整合 | `8815469`、`9fdc344` |
| 登录体系升级 | 合并队友的数据库版登录：会话 Cookie + CSRF + 限流，替换 X-User-id 方案 | `a5b9481` |
| 体验精修 | 头像上传、新消息弹窗 + 免打扰开关、语音音色优选、登录页/顶栏文案精简、docker-compose 云部署编排 | `2eaf1c2`、`1f29a8f`、`05d4008` 等 |
| 2026-11-20（进行中，未提交） | 法务合规文档四件套 + 规范化页脚 + 业务页合规提示 + 部署配置健壮性 | 见第五节 |

## 三、当前能力快照

### 3.1 前端（React 18 + TS + Vite + Tailwind + Zustand）

- **17 个业务页面**：首页、AI 诊断（四步问诊 + 照片上传）、诊断结果、诊断报告、设备列表/详情/维修历史、智能报修（工单）、维修档案、登录/注册、个人中心设置、隐私政策、用户协议、版权说明、关于修必达、UI Kit、404
- **30 个公共组件**：TopBar、SidebarNav、MobileNavDrawer、ModalDialog、SourceBadge、NotificationPopup、SafetyBanner（规范化页脚）、LegalPage（法务文档共用渲染器）等
- **已落地的关键能力**：
  - 真实登录注册（调后端 `/api/auth/*`，非本地模拟）+ 游客演示模式保留
  - 图片上传：JPG/PNG 校验、10MB 限制、canvas 压缩后上传
  - 语音播报：Web Speech API、中文音色优选、语速实时联动、自动朗读、听写输入
  - 通知中心：未读红点 + 右下角弹窗 + 免打扰开关，localStorage 持久化按账号隔离
  - 安全关键词拦截：前端 `risk.ts` 本地词表判定，LLM 不参与风险判断
  - 来源可追溯：每条诊断标注「真实 AI / 模板演示 / 来源未记录」与模型名
  - 长辈模式：仅改文案表达，结论/原因排序/风险判定不变
- **单元测试**：Vitest 27 个用例（auth / records / speech / stage10）
- **E2E**：playwright-core，stage10~13 四套验收脚本（注册登录、设备隔离、三端视口）

### 3.2 后端（FastAPI + SQLAlchemy + SQLite/PostgreSQL）

- **接口清单**：
  - 认证：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`、`POST /auth/logout`、`PATCH /auth/profile`
  - 诊断：`POST /diagnose/complete`（文本）、`POST /diagnose/photo`（看图）
  - 设备 CRUD：`GET/POST /devices`、`GET/PUT/DELETE /devices/{id}`
  - 工单闭环：`POST /repair-tickets`、`GET /repair-tickets`、`POST /repair-tickets/{id}/status`（状态只允许正向流转）
  - 健康检查：`GET /api/health`
- **数据表**：auth_sessions、users、devices、diagnoses、repair_records、repair_tickets
- **AI 客户端**：智谱 GLM（OpenAI 兼容协议），文本 glm-4-flash + 视觉 glm-4v-flash，超时/鉴权/限流/上游错误分类处理，默认 60s 超时
- **安全规则引擎**：规则版本 `SAFETY-2026-11-18-A`，高风险请求直接 409 且不调用模型，与前端规则由 `test_safety_parity.py` 保证一致
- **鉴权**：HttpOnly Cookie 会话 + 可撤销服务端会话 + CSRF Token + 限流；密码 bcrypt 哈希；public 模式强制配置 `FIXITAI_SESSION_SECRET`
- **测试**：pytest 45 个用例（auth / diagnose_trust / health / records / safety_parity）

### 3.3 部署

- **Render 单容器**：Dockerfile 两阶段构建，FastAPI 托管前端 dist（SPA 回退），线上真实 AI 生效
- **docker-compose 云服务器方案**（`05d4008` 新增）：数据卷持久化 + AI Key 配置 + 端口可调，配套《部署-云服务器.md》指南
- Render 免费档限制：15 分钟无访问休眠（演示前需预热）、SQLite 重启清空（线上需配 PostgreSQL）

## 四、法务合规（本次总结时点的新增工作，未提交）

围绕「像成熟产品一样规范」补齐了整套法务文档与入口：

| 交付物 | 说明 |
|---|---|
| 《隐私政策》 `/privacy` | 十余章节完整政策：收集范围、存储、AI 处理、用户控制权，与产品实际实现逐条对应 |
| 《用户协议》 `/terms` | 十章协议：适用范围、账号管理、用户行为规范、AI 诊断提示、免责声明等 |
| 《版权说明》 `/copyright` | 版权声明、开源组件致谢、用户内容授权、侵权投诉渠道 |
| 「关于修必达」 `/about` | 产品定位、核心能力四卡片、安全承诺、客服联系方式 |
| 规范化页脚 | 参考主流官网三行式页脚：法务链接行 + 版权行（备案号暂缺，已留注释占位） |
| 业务页合规嵌入 | 诊断/报修照片隐私说明、注册页「注册即同意协议」提示 |
| 部署配置健壮性 | `FIXITAI_DATABASE_URL` 粘贴清洗与明确报错（防控制台复制带空格/引号/换行） |

客服邮箱已确定为 `savior200618@qq.com`（关于页已生效，法务文档内三处 `support@fixitai.cn` 待确认是否统一）。

## 五、未提交改动清单（收尾待办）

```
M  backend/app/core/config.py            # DATABASE_URL 清洗校验
M  frontend/src/App.tsx                  # 注册 /about 等新路由
M  frontend/src/components/SafetyBanner.tsx  # 规范化页脚
M  frontend/src/pages/Diagnose.tsx       # 照片隐私提示
M  frontend/src/pages/Login.tsx          # 注册协议提示
M  frontend/src/pages/RepairAssistant.tsx # 报修照片隐私提示
M  frontend/src/pages/Settings.tsx       # 隐私与数据模块改版（150 行级改动）
?? frontend/src/components/LegalPage.tsx
?? frontend/src/pages/About.tsx / PrivacyPolicy.tsx / TermsOfService.tsx / CopyrightInfo.tsx
```

## 六、测试与质量现状

| 层 | 工具 | 数量 | 覆盖重点 |
|---|---|---|---|
| 前端单元 | Vitest | 27 用例 | 账号、维修记录、语音、诊断可信性 |
| 后端 | pytest | 45 用例 | 鉴权、诊断信任链、健康检查、记录、安全一致性 |
| E2E | playwright-core | 4 套脚本 | 注册/登录、设备隔离、三端视口、阶段验收 |
| 构建 | tsc + vite build | — | 生产构建零错误（今日复验通过） |

## 七、遗留事项与下一步

**合规收尾（提交前必办）**

- [ ] ICP 备案号：尚未取得，页脚已留注释占位，取得后补入 `SafetyBanner.tsx`
- [ ] 法务文档内反馈邮箱三处 `support@fixitai.cn` 是否统一改为 QQ 邮箱
- [ ] 《权属与团队分工说明》成员姓名与分工填写（V2 遗留）
- [ ] 报名表体验入口填入线上地址（V2 遗留）
- [ ] 本节第四节改动提交 + 双远程推送（触发 Render 重新部署）

**功能候选（承接 V1/V2 未开发清单）**

- P1：AI 动态追问（问诊问题由 LLM 动态生成）
- P2：报告导出 PDF、通知后端表（当前通知为纯前端方案）
- P3：真实维修平台对接、知识库扩充（当前仅 1 条空调故障条目）

**已知风险**

- Render 免费档休眠与存储清空：演示前预热；正式持久化需付费或走云服务器 docker-compose 方案
- knowledge_base 目前仅 1 条知识条目，AI 诊断质量依赖模型本身

---

*本报告基于 2026-11-20 的仓库实际代码状态（git log 30 条提交 + 前后端代码核实）撰写，数据（页面/组件/测试数量、接口清单）均为实查结果。*
