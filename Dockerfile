# anymodel bot：一个镜像同时包含机器人运行时 + 内置 magpie 模型网关
# 发版时由 .github/workflows/docker.yml 发布到 ghcr.io/modelflare-ai/anymodel-bot（x64 + arm64），用户直接 docker run 那个镜像。
# 自己构建前需检出子模块：git submodule update --init --depth 1 vendor/magpie
#   docker build -t anymodel-bot .
#   docker run -d --name amb -p 3600:3600 -v amb-data:/data anymodel-bot
#   docker exec amb cat /data/ui-token   # 首次打开 http://<主机>:3600/?token=<令牌>

# ---- magpie（纯 Go、无 GUI、CGO 关闭）----
FROM golang:1.27-bookworm AS magpie
WORKDIR /src
COPY vendor/magpie/ ./
ARG MAGPIE_VERSION=v0.1.1720
RUN CGO_ENABLED=0 go build -tags nogui -trimpath -ldflags "-s -w -X main.version=${MAGPIE_VERSION}" -o /out/magpie .

# ---- TypeScript 编译 ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY electron ./electron
COPY ui/locales/manifest.json ./ui/locales/manifest.json
COPY bots ./bots
COPY scripts/build-catalog.ts ./scripts/build-catalog.ts
RUN npm run build

# ---- DSH 代理运行时（MIT，npm 固定版本）----
FROM node:22-bookworm-slim AS dsh
WORKDIR /app
COPY dsh-runtime/package.json dsh-runtime/package-lock.json ./dsh-runtime/
COPY scripts/prepare-dsh.mjs ./scripts/
RUN node scripts/prepare-dsh.mjs && npm cache clean --force

# ---- 运行时 ----
FROM node:22-bookworm-slim
# bubblewrap：DSH 的 bash 沙箱。按默认参数 docker run 时它建不了命名空间
# （0.1.43 镜像实测：bwrap: No permissions to create new namespace），这时命令改用 Landlock，
# 由下面的 AMB_ALLOW_LANDLOCK=1 明确放行；不放行的话命令会被拒绝（src/agent/host.ts 的 sandboxPatchLines）。
# Landlock 只限制写文件：数据目录对命令可读，回环管理接口的来源检查也拦不住它，这时容器本身才是边界。
# 容器能创建命名空间时 bwrap 可用，会优先用它；-e AMB_ALLOW_LANDLOCK=0 则在 bwrap 用不了时拒绝执行命令。
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    AMB_DATA_DIR=/data \
    AMB_UI_HOST=0.0.0.0 \
    AMB_UI_PORT=3600 \
    AMB_ALLOW_LANDLOCK=1 \
    AMB_MAGPIE_BIN=/app/bin/magpie
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY ui ./ui
COPY assets ./assets
COPY --from=magpie /out/magpie ./bin/magpie
COPY --from=dsh /app/dsh-runtime/node_modules ./dsh-runtime/node_modules
COPY dsh-runtime/package.json ./dsh-runtime/
COPY dsh-runtime/plugins ./dsh-runtime/plugins
# 语雀官方 MCP 的固定版本（单文件，scripts/vendor-yuque-mcp.mjs 生成）：连接应用 › 语雀 用它
COPY vendor/yuque-mcp ./vendor/yuque-mcp
COPY LICENSE THIRD_PARTY_NOTICES*.md CHANGELOG*.md ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3600
CMD ["node", "dist/src/main.js"]
