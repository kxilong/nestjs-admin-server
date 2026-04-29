# NestJS 框架介绍

## 什么是 NestJS

NestJS 是一个用于构建高效、可扩展的 Node.js 服务器端应用程序的框架。它使用现代 JavaScript 或 TypeScript 构建，结合了 OOP（面向对象编程）、FP（函数式编程）和 FRP（函数响应式编程）的元素。

## NestJS 的核心特性

1. **模块化架构**：NestJS 使用模块系统组织代码，每个模块可以包含控制器、服务、提供者等。
2. **依赖注入**：内置依赖注入系统，使代码更易于测试和维护。
3. **装饰器**：使用装饰器定义路由、中间件、管道等，代码更加简洁。
4. **中间件**：支持全局和路由级中间件。
5. **异常过滤器**：统一处理应用程序中的异常。
6. **管道**：用于数据验证和转换。
7. **守卫**：用于授权和权限控制。
8. **拦截器**：用于请求/响应处理和日志记录。

## NestJS 的优势

- **TypeScript 支持**：完全支持 TypeScript，提供类型安全。
- **可扩展性**：模块化设计使得应用程序易于扩展。
- **测试友好**：依赖注入系统使得测试更加容易。
- **生态系统**：丰富的生态系统，包括众多模块和工具。
- **企业级**：适合构建企业级应用程序。

## 与其他框架的比较

### NestJS vs Express
- NestJS 提供了更结构化的架构，而 Express 更加灵活。
- NestJS 内置了更多功能，如依赖注入、异常处理等。
- Express 更加轻量级，适合简单的应用程序。

### NestJS vs Fastify
- Fastify 性能更高，但 NestJS 提供了更完整的功能集。
- NestJS 可以使用 Fastify 作为底层 HTTP 服务器。

## 开始使用 NestJS

### 安装
```bash
npm i -g @nestjs/cli
nest new project-name
```

### 基本结构
- `src/`：源代码目录
  - `app.module.ts`：应用程序的根模块
  - `app.controller.ts`：处理 HTTP 请求
  - `app.service.ts`：业务逻辑
  - `main.ts`：应用程序入口

### 创建控制器
```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  findAll() {
    return 'This action returns all users';
  }
}
```

### 创建服务
```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  findAll() {
    return ['user1', 'user2', 'user3'];
  }
}
```

## 数据库集成

NestJS 支持多种数据库，包括：
- PostgreSQL
- MySQL
- MongoDB
- SQLite

### 使用 Prisma

1. 安装 Prisma：
```bash
npm install prisma --save-dev
npx prisma init
```

2. 配置数据库连接：
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int     @id @default(autoincrement())
  name  String
  email String  @unique
  posts Post[]
}

model Post {
  id     Int    @id @default(autoincrement())
  title  String
  content String
  userId Int
  user   User   @relation(fields: [userId], references: [id])
}
```

3. 生成 Prisma 客户端：
```bash
npx prisma generate
```

## 部署 NestJS 应用

### 构建生产版本
```bash
npm run build
```

### 运行生产版本
```bash
npm run start:prod
```

### 容器化部署
```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY dist/ ./dist/

CMD ["npm", "run", "start:prod"]
```

## 总结

NestJS 是一个功能强大、结构清晰的 Node.js 框架，适合构建各种规模的服务器端应用程序。它结合了现代 JavaScript/TypeScript 的最佳实践，提供了一套完整的工具和模式，使得开发过程更加高效和可维护。

通过使用 NestJS，开发者可以专注于业务逻辑的实现，而不必担心底层的技术细节。它的模块化设计和依赖注入系统使得代码更加可测试、可维护，同时也为大型应用程序的开发提供了良好的基础。
