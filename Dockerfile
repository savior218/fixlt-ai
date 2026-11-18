# 修必达 FixIt AI · 单容器部署镜像（适用于 Render / Hugging Face Spaces / 任意支持 Docker 的平台）
# 前端构建产物由 FastAPI 统一托管，前后端同源，无跨域问题。

# ---- 阶段一：构建前端 ----
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 阶段二：运行后端 + 托管前端 ----
FROM python:3.11-slim
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV FIXITAI_FRONTEND_DIST_DIR=/app/backend/frontend/dist
# SQLite 数据文件落在容器可写目录
ENV FIXITAI_DATABASE_URL=sqlite:////app/backend/fixitai.db

EXPOSE 10000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
