# 飞书 MCP Server

[English Documentation](README.en.md)

这是一个支持远程连接的[模型上下文协议 (MCP)](https://modelcontextprotocol.io/introduction) 服务器，内置了飞书 OAuth 认证。

本项目修改自 [cloudflare/ai/demos/remote-mcp-github-oauth](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth)，将 GitHub OAuth 替换为飞书 OAuth。

您可以将其部署到自己的 Cloudflare 账户，并通过飞书账号 OAuth 登录使用。当前已经覆盖云文档、普通表格、多维表格、群消息和任务的核心读写能力；具体范围见下方“已实现工具”。

## 📋 目录

- [项目定位](#-项目定位)
- [特性](#-特性)
- [快速开始](#-快速开始)
- [部署方式](#-部署方式)
  - [生产环境部署](#生产环境部署)
  - [本地开发环境](#本地开发环境)
- [客户端集成](#-客户端集成)
  - [使用 Inspector 测试](#使用-inspector-测试)
  - [使用 Cursor](#使用-cursor)
  - [使用 ChatWise](#使用-chatwise)
- [访问控制](#-访问控制)
- [已实现工具](#-已实现工具)
- [技术原理](#-技术原理)
- [开发指南](#-开发指南)

## 🆚 项目定位

- 使用 `user_access_token` 代表当前登录用户访问飞书资源，并自动刷新令牌。
- 以远程 MCP Server 形式部署在 Cloudflare Workers。
- 对常用操作提供参数较小、适合对话调用的工具；它不是飞书全部 OpenAPI 的完整映射。
- 实际可访问范围同时受应用权限、用户权限、文档权限和群成员身份限制。

## ✨ 特性

- 🎯 **登录后使用**：客户端用户无需自行填写飞书令牌，服务自动管理 `user_access_token` 和刷新
- 🔐 **飞书 OAuth 认证**：安全的用户身份验证
- 🌐 **远程 MCP 服务器**：支持多客户端连接
- 🚀 **Cloudflare Workers**：高性能、全球分布式部署，享受业界最前沿的边缘计算基础设施
- 🛠️ **深度优化的工具集**：特别优化文档创建、嵌套块等复杂工具，确保在各种客户端中正常使用
- 🔧 **本地开发支持**：便于开发和测试的本地环境
- 📚 **核心办公能力**：覆盖云文档、普通表格、多维表格、群消息和任务的常用读写操作

## 🚀 快速开始

### 前置要求

- Node.js 18+ 和 pnpm 10
- Cloudflare 账户
- 飞书开放平台账户

### 安装

```bash
# 克隆仓库
git clone https://github.com/Roc-kit/open-feishu-mcp-server.git
cd open-feishu-mcp-server

# 安装依赖
pnpm install --frozen-lockfile
```

## 🚀 部署方式

### 生产环境部署

#### 步骤 1: 创建飞书应用

1. 访问[飞书开放平台](https://open.feishu.cn/)并登录
2. 点击"开发者后台"并创建一个新应用
3. 在“权限管理”中添加以下**用户身份权限**：
   - 身份：`auth:user.id:read`、`offline_access`
   - 云文档与云空间：`docx:document:readonly`、`docx:document`、`docx:document:create`、`docx:document.block:convert`、`drive:drive`、`drive:file:upload`
   - 普通表格：`sheets:spreadsheet`
   - 多维表格：`bitable:app`
   - 消息：`im:chat:readonly`、`im:message`、`im:message:readonly`、`im:message.group_msg:get_as_user`、`im:message.send_as_user`
   - 任务：`task:task:read`、`task:task:write`
   - 日历读取：`calendar:calendar.event:read`
4. 在“添加应用能力”中启用**机器人**。群聊列表、群消息读取和发送依赖此能力。
5. 创建并发布应用版本。新增权限或机器人能力后，需要重新发布，并让已连接用户重新授权。
6. 记下您的**应用 ID** 和**应用密钥**。

> 本项目使用用户身份权限，不应把上述权限改成仅应用身份权限。调用群消息工具时，当前用户还必须在目标群内。

#### 步骤 2: 配置 Cloudflare 环境

```bash
# 设置必要的密钥
wrangler secret put FEISHU_APP_ID
wrangler secret put FEISHU_APP_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY  # 使用 openssl rand -hex 32 生成

# 创建 KV 命名空间
wrangler kv namespace create "OAUTH_KV"
```

#### 步骤 3: 更新配置文件

使用步骤 2 中获得的 KV ID 更新 `wrangler.jsonc` 文件中的 KV 命名空间配置。

#### 步骤 4: 部署服务器

```bash
pnpm deploy
```

部署完成后，记下您的实际 subdomain（会在部署日志中显示）。

#### 步骤 5: 配置重定向 URL

回到飞书应用设置：

1. 进入"安全设置"
2. 添加重定向 URL：`https://feishu-mcp-server.<your-actual-subdomain>.workers.dev/callback`

### 本地开发环境

#### 配置本地环境

1. **配置飞书应用**：
   - 在飞书应用的"安全设置"中添加：`http://localhost:8788/callback`
   - 确保拥有所需的权限（同生产环境）

2. **创建环境变量文件**：
   在项目根目录创建 `.dev.vars` 文件：
   ```
   FEISHU_APP_ID=your_development_feishu_app_id
   FEISHU_APP_SECRET=your_development_feishu_app_secret
   COOKIE_ENCRYPTION_KEY=any_random_string_here
   ```

#### 启动本地服务器

```bash
pnpm dev
```

服务器将在 `http://localhost:8788` 运行。

## 🔌 客户端集成

### 使用 Inspector 测试

使用官方的 MCP Inspector 测试您的服务器：

```bash
npx @modelcontextprotocol/inspector@latest
```

**连接地址**：

- 生产环境：`https://feishu-mcp-server.<your-subdomain>.workers.dev/sse`
- 本地环境：`http://localhost:8788/sse`

### 使用 Cursor

通过一键安装按钮快速配置：

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=feishu&config=eyJ1cmwiOiJodHRwOi8vbG9jYWxob3N0Ojg3ODgvc3NlIn0%3D)

或手动配置：

```json
{
  "mcpServers": {
    "feishu": {
      "url": "http://localhost:8788/sse"
    }
  }
}
```

### 使用 ChatWise

1. **配置步骤**：
   - 打开 ChatWise 设置界面
   - 导航到工具选项
   - 新增命令行输入输出（stdio）
   - 命令：`npx -y mcp-remote ${URL}`

2. **连接地址**：
   - 本地：`http://localhost:8788/sse`
   - 生产：`https://feishu-mcp-server.<your-subdomain>.workers.dev/sse`

3. **首次使用**：
   - 保存配置后会自动打开飞书 OAuth 登录页面
   - 完成授权即可使用飞书相关功能

## 🔐 访问控制

- **身份验证**：使用飞书 OAuth 进行用户身份验证
- **权限范围**：工具是否可用取决于 OAuth 授权范围、当前用户在飞书中的权限、资源本身的共享权限以及群成员身份

## 📋 已实现工具

- **云文档**：创建、读取全文和块、追加 Markdown/HTML、创建/更新/删除常用文档块、评论读取、文件与图片插入。
- **普通表格**：创建表格、查询/新增/复制/删除/重命名工作表、读取和写入单个单元格范围、更新视图与保护设置。
- **多维表格**：创建 Base 和数据表、读取数据表/字段/记录、新增/更新/删除记录。
- **群消息**：列出当前用户所在群聊、读取群历史消息、以当前用户身份发送纯文本群消息。
- **任务**：列出“我负责的”任务、创建并指派给当前用户、更新、完成/恢复和删除任务。

当前未实现的能力包括普通表格公式/图表/筛选排序、多维表格字段与视图管理、自动化规则和批量数据导入导出。README 不再把已经完成的普通表格与多维表格基础能力列为“未来计划”。

## 🛠️ 技术原理

### 架构组件

#### OAuth Provider

完整的 OAuth 2.1 服务器实现，处理：

- MCP 客户端身份验证
- 飞书 OAuth 服务连接管理
- KV 存储中的安全令牌管理

#### Durable MCP

基于 Cloudflare Durable Objects 的 MCP 扩展：

- 持久状态管理
- 身份验证上下文存储
- 通过 `this.props` 访问用户信息
- 基于用户身份的条件工具可用性

#### MCP Remote

支持远程 MCP 客户端连接：

- 定义客户端-服务器通信协议
- 提供结构化工具定义方式
- 处理请求/响应序列化
- 维护 SSE 连接

## 👨‍💻 开发指南

### MCP 服务器（由 [Cloudflare Workers](https://developers.cloudflare.com/workers/) 提供支持）

本项目实现了双重 OAuth 角色：

- 对 MCP 客户端充当 OAuth **服务器**
- 对飞书 OAuth 服务充当 OAuth **客户端**

### 工具开发

当前工具使用用户访问令牌进行身份验证，确保：

- 安全访问飞书 API
- 基于用户权限的功能访问
- 完整的错误处理和日志记录

---

**📝 注意**：确保在部署前正确配置所有环境变量和飞书应用设置。如遇问题，请检查飞书应用权限配置和重定向 URL 设置。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Roc-kit/open-feishu-mcp-server&type=Date)](https://star-history.com/#Roc-kit/open-feishu-mcp-server&Date)
