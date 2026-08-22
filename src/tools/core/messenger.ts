import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { errorResult, feishuRequest, textResult } from './feishu-api';

export function registerMessengerCoreTools(server: McpServer, getAccessToken: () => string) {
  server.registerTool(
    'list_my_chats',
    {
      title: 'List My Feishu Group Chats',
      description: '列出当前登录用户所在的飞书群聊，用于先确认 chat_id，避免发错群。',
      inputSchema: {
        page_size: z.number().int().min(1).max(100).optional().default(50),
        page_token: z.string().min(1).optional(),
      },
    },
    async ({ page_size, page_token }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>('/im/v1/chats', getAccessToken(), {
          query: { user_id_type: 'open_id', page_size, page_token },
        });
        return textResult(data);
      } catch (error) {
        return errorResult('list_my_chats', error);
      }
    },
  );

  server.registerTool(
    'list_chat_messages',
    {
      title: 'List Feishu Group Messages',
      description: '读取指定飞书群聊的历史消息。调用身份必须在群内并有相应权限。',
      inputSchema: {
        chat_id: z.string().min(1),
        page_size: z.number().int().min(1).max(50).optional().default(20),
        page_token: z.string().min(1).optional(),
        start_time: z.string().regex(/^\d+$/).optional().describe('起始 Unix 秒时间戳'),
        end_time: z.string().regex(/^\d+$/).optional().describe('结束 Unix 秒时间戳'),
        sort_type: z.enum(['ByCreateTimeAsc', 'ByCreateTimeDesc']).optional().default('ByCreateTimeDesc'),
      },
    },
    async ({ chat_id, page_size, page_token, start_time, end_time, sort_type }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>('/im/v1/messages', getAccessToken(), {
          query: {
            container_id_type: 'chat',
            container_id: chat_id,
            page_size,
            page_token,
            start_time,
            end_time,
            sort_type,
          },
        });
        return textResult(data);
      } catch (error) {
        return errorResult('list_chat_messages', error);
      }
    },
  );

  server.registerTool(
    'send_group_message',
    {
      title: 'Send Feishu Group Message',
      description: '以当前登录用户身份向指定 chat_id 发送纯文本群消息。发送前必须确认目标群和内容。',
      inputSchema: {
        chat_id: z.string().min(1),
        text: z.string().min(1).max(10_000),
      },
    },
    async ({ chat_id, text }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>('/im/v1/messages', getAccessToken(), {
          method: 'POST',
          query: { receive_id_type: 'chat_id' },
          body: {
            receive_id: chat_id,
            msg_type: 'text',
            content: JSON.stringify({ text }),
            uuid: crypto.randomUUID(),
          },
        });
        return textResult(data);
      } catch (error) {
        return errorResult('send_group_message', error);
      }
    },
  );
}
