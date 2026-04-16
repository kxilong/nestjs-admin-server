# --------------------------
# 阶段1：构建项目（用Node镜像编译你的NestJS代码）
# --------------------------
# 用官方Node.js镜像（Prisma要求Node >= 20.19）
FROM node:20.19-alpine AS builder

# 设置工作目录（容器里的路径）
WORKDIR /app

# 复制package.json和package-lock.json（先复制依赖文件，利用Docker缓存加速构建）
COPY package*.json ./

# 安装依赖（--force避免版本冲突）
RUN npm install --force

# 复制项目所有代码到容器里
COPY . .

# 生成Prisma Client，避免TS构建时缺少Prisma类型
RUN npx prisma generate

# 执行构建命令（编译NestJS项目）
RUN npm run build

# --------------------------
# 阶段2：生产运行镜像（只保留运行必须的文件，镜像更小）
# --------------------------
FROM node:20.19-alpine AS production

# 设置工作目录
WORKDIR /app

# 复制构建好的代码和依赖
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# 安装生产依赖（只装dependencies，不装devDependencies）
RUN npm install --production --force

# 生产镜像同样需要Prisma Client
RUN npx prisma generate

# 暴露端口（和你的NestJS项目端口一致，默认3000）
EXPOSE 3000

# 启动命令：先同步数据库结构（无migration时也能建表），再启动NestJS项目
CMD ["sh", "-c", "npx prisma db push && node dist/main"]