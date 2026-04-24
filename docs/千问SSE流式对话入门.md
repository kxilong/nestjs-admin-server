# 千问 SSE 流式对话入门（小白版）

这份文档对应你提的需求：  
- 模型：`qwen3.5-122b-a10b`  
- 后端：NestJS 提供 SSE 流式接口  
- 前端：流式打字机展示

> 百炼文档入口（你给的链接）：[大模型服务平台百炼控制台](https://bailian.console.aliyun.com/cn-beijing/?spm=5176.29597918.J_SEsSjsNv72yRuRFS2VknO.2.3153133cTNieBg&tab=doc#/doc/?type=model&url=2866125)

---

## 1. 你已经有了哪些代码

已新增：

- 后端接口：`POST /ai/chat/stream`（SSE）
- 权限码：`system:ai:chat`
- 前端页面：`/admin/ai-chat`
- 菜单项：`AI 对话`（有权限才显示）

---

## 2. 先配环境变量（最重要）

编辑项目根目录 `.env`：

```env
DASHSCOPE_API_KEY=你的百炼APIKey
AI_MODEL=qwen3.5-122b-a10b
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
```

### 注意

- `DASHSCOPE_API_KEY` 不能为空。
- 如果你刚改 `.env`，**必须重启后端进程**。
- 不要把 key 提交到 Git 仓库。

---

## 3. 给当前账号加 AI 权限

后端是权限控制的，你账号必须有 `system:ai:chat`。

你可以：

1. 超管账号登录；
2. 打开“角色管理”；
3. 给角色勾选 `AI 对话` 权限（对应 `system:ai:chat`）；
4. 重新登录一次。

---

## 4. 怎么启动

根目录执行（按你的习惯）：

```bash
pnpm run start:dev
```

或

```bash
npm run start:dev
```

---

## 5. 如何验证功能成功

### A. 页面是否有入口

登录后台后，左侧看到 `AI 对话` 菜单，说明权限与路由生效。

### B. 流式是否生效

进入 `AI 对话` 页面，输入问题后点击发送：

- 回答会逐字增长（打字机效果），不是一次性整段返回；
- 页面上方显示当前模型（默认 `qwen3.5-122b-a10b`）。

### C. Network 验证（浏览器）

在开发者工具看 `/ai/chat/stream`：

- 请求状态 200；
- `Content-Type` 为 `text/event-stream`；
- 响应是持续追加的数据块（`event: delta`）。

---

## 6. 常见错误与解决

### 1）提示“未配置 DASHSCOPE_API_KEY”
- 原因：`.env` 没填 key 或填错；
- 解决：填正确 key 并重启后端。

### 2）接口 401
- 原因：未登录或 token 过期；
- 解决：重新登录后再试。

### 3）看不到 AI 菜单
- 原因：无 `system:ai:chat` 权限；
- 解决：给当前角色加权限。

### 4）返回模型请求失败(4xx/5xx)
- 原因：key 无效、模型名错误、百炼配额问题等；
- 解决：到百炼控制台检查 key 权限、模型开通状态、余额/限额。

---

## 7. 关键代码位置

- 后端控制器：`src/ai/ai.controller.ts`
- 后端服务：`src/ai/ai.service.ts`
- 请求 DTO：`src/ai/dto/chat-stream.dto.ts`
- 权限定义：`src/constants/permission.definitions.ts`
- 前端 API：`frontend/src/api/ai.ts`
- 前端页面：`frontend/src/views/AiChatView.vue`
- 路由：`frontend/src/router/index.ts`

---

如果你下一步想做“多轮上下文记忆（会话历史）”和“中断生成（停止按钮）”，我可以继续在这套代码上直接加。
