# Feishu MCP Server

[中文文档](README.md)

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server that supports remote connections with built-in Feishu OAuth authentication.

This project is modified from [cloudflare/ai/demos/remote-mcp-github-oauth](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth), replacing GitHub OAuth with Feishu OAuth.

You can deploy it to your own Cloudflare account and use it after signing in with Feishu OAuth. The current implementation covers core read/write operations for Docs, Sheets, Bitable, group messages, and Tasks; see “Implemented Tools” below for the exact scope.

## 📋 Table of Contents

- [Project Positioning](#-project-positioning)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Deployment Methods](#-deployment-methods)
  - [Production Deployment](#production-deployment)
  - [Local Development Environment](#local-development-environment)
- [Client Integration](#-client-integration)
  - [Testing with Inspector](#testing-with-inspector)
  - [Using Cursor](#using-cursor)
  - [Using ChatWise](#using-chatwise)
- [Access Control](#-access-control)
- [Implemented Tools](#-implemented-tools)
- [Technical Architecture](#-technical-architecture)
- [Development Guide](#-development-guide)

## 🆚 Project Positioning

- Uses a `user_access_token` to access resources as the signed-in user and refreshes the token automatically.
- Runs as a remote MCP Server on Cloudflare Workers.
- Provides focused, conversation-friendly tools for common operations; it is not a complete mapping of every Feishu OpenAPI.
- Effective access is still limited by app scopes, user permissions, resource sharing, and group membership.

## ✨ Features

- 🎯 **Sign In and Use**: Client users do not paste Feishu tokens; the service manages `user_access_token` values and refreshes them
- 🔐 **Feishu OAuth Authentication**: Secure user identity verification
- 🌐 **Remote MCP Server**: Supports multi-client connections
- 🚀 **Cloudflare Workers**: High-performance, globally distributed deployment with cutting-edge edge computing infrastructure
- 🛠️ **Deeply Optimized Toolset**: Specially optimized for document creation, nested blocks, and other complex tools ensuring proper functionality across various clients
- 🔧 **Local Development Support**: Convenient development and testing environment
- 📚 **Core Office Capabilities**: Common read/write operations for Docs, Sheets, Bitable, group messages, and Tasks

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm 10
- Cloudflare account
- Feishu Open Platform account

### Installation

```bash
# Clone repository
git clone https://github.com/Roc-kit/open-feishu-mcp-server.git
cd open-feishu-mcp-server

# Install dependencies
pnpm install --frozen-lockfile
```

## 🚀 Deployment Methods

### Production Deployment

#### Step 1: Create Feishu Application

1. Visit [Feishu Open Platform](https://open.feishu.cn/) and log in
2. Click "Developer Console" and create a new application
3. Add these **user-identity scopes** in Permission Management:
   - Identity: `auth:user.id:read`, `offline_access`
   - Docs and Drive: `docx:document:readonly`, `docx:document`, `docx:document:create`, `docx:document.block:convert`, `drive:drive`, `drive:file:upload`
   - Sheets: `sheets:spreadsheet`
   - Bitable: `bitable:app`
   - Messaging: `im:chat:readonly`, `im:message`, `im:message:readonly`, `im:message.group_msg:get_as_user`, `im:message.send_as_user`
   - Tasks: `task:task:read`, `task:task:write`
   - Calendar read: `calendar:calendar.event:read`
4. Enable the **Bot** capability under Add Features. Listing chats and reading/sending group messages depend on it.
5. Create and publish an app version. After adding scopes or the Bot capability, publish again and have connected users reauthorize.
6. Note your **App ID** and **App Secret**.

> This project uses user-identity scopes; do not replace the scopes above with app-identity-only scopes. The signed-in user must also be a member of a target group chat.

#### Step 2: Configure Cloudflare Environment

```bash
# Set necessary secrets
wrangler secret put FEISHU_APP_ID
wrangler secret put FEISHU_APP_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY  # Generate with: openssl rand -hex 32

# Create KV namespace
wrangler kv namespace create "OAUTH_KV"
```

#### Step 3: Update Configuration File

Update the KV namespace configuration in `wrangler.jsonc` with the KV ID obtained from Step 2.

#### Step 4: Deploy Server

```bash
pnpm deploy
```

After deployment, note your actual subdomain (displayed in deployment logs).

#### Step 5: Configure Redirect URL

Return to Feishu application settings:

1. Go to "Security Settings"
2. Add redirect URL: `https://feishu-mcp-server.<your-actual-subdomain>.workers.dev/callback`

### Local Development Environment

#### Configure Local Environment

1. **Configure Feishu Application**:
   - Add to "Security Settings" in Feishu app: `http://localhost:8788/callback`
   - Ensure required permissions (same as production environment)

2. **Create Environment Variables File**:
   Create `.dev.vars` file in project root:
   ```
   FEISHU_APP_ID=your_development_feishu_app_id
   FEISHU_APP_SECRET=your_development_feishu_app_secret
   COOKIE_ENCRYPTION_KEY=any_random_string_here
   ```

#### Start Local Server

```bash
pnpm dev
```

Server will run at `http://localhost:8788`.

## 🔌 Client Integration

### Testing with Inspector

Test your server using the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

**Connection URLs**:

- Production: `https://feishu-mcp-server.<your-subdomain>.workers.dev/sse`
- Local: `http://localhost:8788/sse`

### Using Cursor

Quick setup with one-click install button:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=feishu&config=eyJ1cmwiOiJodHRwOi8vbG9jYWxob3N0Ojg3ODgvc3NlIn0%3D)

Or manual configuration:

```json
{
  "mcpServers": {
    "feishu": {
      "url": "http://localhost:8788/sse"
    }
  }
}
```

### Using ChatWise

1. **Configuration Steps**:
   - Open ChatWise settings interface
   - Navigate to tools options
   - Add new command line input/output (stdio)
   - Command: `npx -y mcp-remote ${URL}`

2. **Connection URLs**:
   - Local: `http://localhost:8788/sse`
   - Production: `https://feishu-mcp-server.<your-subdomain>.workers.dev/sse`

3. **First Use**:
   - After saving configuration, Feishu OAuth login page will automatically open
   - Complete authorization to use Feishu-related features

## 🔐 Access Control

- **Authentication**: Uses Feishu OAuth for user identity verification
- **Permission Scope**: Tool availability depends on OAuth scopes, the signed-in user's Feishu permissions, resource sharing, and group membership

## 📋 Implemented Tools

- **Docs**: Create documents, read raw content and blocks, append Markdown/HTML, create/update/delete common blocks, read comments, and insert files/images.
- **Sheets**: Create spreadsheets; query, add, copy, delete, and rename worksheets; read/write a single cell range; update view and protection settings.
- **Bitable**: Create bases and tables; list tables, fields, and records; create, update, and delete records.
- **Group messaging**: List chats that contain the signed-in user, read chat history, and send plain-text group messages as that user.
- **Tasks**: List assigned tasks, create tasks assigned to the signed-in user, update tasks, complete/reopen tasks, and delete tasks.

Not currently implemented: spreadsheet formulas/charts/filtering/sorting, Bitable field/view management, automation rules, and bulk import/export. The README no longer lists completed Sheets and Bitable basics as future work.

## 🛠️ Technical Architecture

### Architecture Components

#### OAuth Provider

Complete OAuth 2.1 server implementation that handles:

- MCP client authentication
- Feishu OAuth service connection management
- Secure token management in KV storage

#### Durable MCP

MCP extension based on Cloudflare Durable Objects:

- Persistent state management
- Authentication context storage
- User information access via `this.props`
- Conditional tool availability based on user identity

#### MCP Remote

Supports remote MCP client connections:

- Defines client-server communication protocol
- Provides structured tool definition approach
- Handles request/response serialization
- Maintains SSE connections

## 👨‍💻 Development Guide

### MCP Server (Powered by [Cloudflare Workers](https://developers.cloudflare.com/workers/))

This project implements dual OAuth roles:

- Acts as OAuth **Server** to MCP clients
- Acts as OAuth **Client** to Feishu OAuth service

### Tool Development

Current tools use user access tokens for authentication, ensuring:

- Secure Feishu API access
- User permission-based feature access
- Complete error handling and logging

---

**📝 Note**: Ensure all environment variables and Feishu application settings are properly configured before deployment. If you encounter issues, please check Feishu application permission configuration and redirect URL settings.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Roc-kit/open-feishu-mcp-server&type=Date)](https://star-history.com/#Roc-kit/open-feishu-mcp-server&Date)
