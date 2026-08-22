import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { encodePath, errorResult, feishuRequest, textResult } from './feishu-api';

const fieldsSchema = z.record(z.string(), z.unknown());

function tablePath(appToken: string, tableId: string): string {
  return `/bitable/v1/apps/${encodePath(appToken)}/tables/${encodePath(tableId)}`;
}

export function registerBitableCoreTools(server: McpServer, getAccessToken: () => string) {
  server.registerTool(
    'create_bitable',
    {
      title: 'Create Feishu Bitable',
      description: '创建一个飞书多维表格，并返回 app_token、默认数据表 ID 和链接。',
      inputSchema: {
        name: z.string().min(1).max(100),
        folder_token: z.string().min(1).optional(),
        time_zone: z.string().min(1).optional().default('Asia/Shanghai'),
      },
    },
    async ({ name, folder_token, time_zone }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>('/bitable/v1/apps', getAccessToken(), {
          method: 'POST',
          body: { name, folder_token, time_zone },
        });
        return textResult(data);
      } catch (error) {
        return errorResult('create_bitable', error);
      }
    },
  );

  server.registerTool(
    'list_bitable_tables',
    {
      title: 'List Bitable Tables',
      description: '列出一个多维表格中的数据表。',
      inputSchema: {
        app_token: z.string().min(1),
        page_size: z.number().int().min(1).max(100).optional().default(100),
        page_token: z.string().min(1).optional(),
      },
    },
    async ({ app_token, page_size, page_token }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `/bitable/v1/apps/${encodePath(app_token)}/tables`,
          getAccessToken(),
          { query: { page_size, page_token } },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('list_bitable_tables', error);
      }
    },
  );

  server.registerTool(
    'create_bitable_table',
    {
      title: 'Create Bitable Table',
      description: '在多维表格中创建数据表。未传 fields 时由飞书创建默认主字段。',
      inputSchema: {
        app_token: z.string().min(1),
        name: z.string().min(1).max(100),
        default_view_name: z.string().min(1).max(100).optional(),
        fields: z.array(z.record(z.string(), z.unknown())).optional(),
      },
    },
    async ({ app_token, name, default_view_name, fields }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `/bitable/v1/apps/${encodePath(app_token)}/tables`,
          getAccessToken(),
          {
            method: 'POST',
            body: { table: { name, default_view_name, fields } },
          },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('create_bitable_table', error);
      }
    },
  );

  server.registerTool(
    'list_bitable_fields',
    {
      title: 'List Bitable Fields',
      description: '列出多维表格数据表的字段定义；写入记录前建议先调用。',
      inputSchema: {
        app_token: z.string().min(1),
        table_id: z.string().min(1),
        page_size: z.number().int().min(1).max(100).optional().default(100),
        page_token: z.string().min(1).optional(),
      },
    },
    async ({ app_token, table_id, page_size, page_token }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `${tablePath(app_token, table_id)}/fields`,
          getAccessToken(),
          { query: { page_size, page_token } },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('list_bitable_fields', error);
      }
    },
  );

  server.registerTool(
    'list_bitable_records',
    {
      title: 'List Bitable Records',
      description: '分页读取多维表格数据表中的记录。',
      inputSchema: {
        app_token: z.string().min(1),
        table_id: z.string().min(1),
        page_size: z.number().int().min(1).max(500).optional().default(100),
        page_token: z.string().min(1).optional(),
        view_id: z.string().min(1).optional(),
      },
    },
    async ({ app_token, table_id, page_size, page_token, view_id }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `${tablePath(app_token, table_id)}/records`,
          getAccessToken(),
          { query: { page_size, page_token, view_id, automatic_fields: true } },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('list_bitable_records', error);
      }
    },
  );

  server.registerTool(
    'create_bitable_record',
    {
      title: 'Create Bitable Record',
      description: '向多维表格数据表新增一条记录。fields 的键应为字段名。',
      inputSchema: {
        app_token: z.string().min(1),
        table_id: z.string().min(1),
        fields: fieldsSchema,
      },
    },
    async ({ app_token, table_id, fields }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `${tablePath(app_token, table_id)}/records`,
          getAccessToken(),
          { method: 'POST', body: { fields } },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('create_bitable_record', error);
      }
    },
  );

  server.registerTool(
    'update_bitable_record',
    {
      title: 'Update Bitable Record',
      description: '增量更新多维表格中的一条记录；字段值传 null 可清空。',
      inputSchema: {
        app_token: z.string().min(1),
        table_id: z.string().min(1),
        record_id: z.string().min(1),
        fields: fieldsSchema,
      },
    },
    async ({ app_token, table_id, record_id, fields }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `${tablePath(app_token, table_id)}/records/${encodePath(record_id)}`,
          getAccessToken(),
          { method: 'PUT', body: { fields } },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('update_bitable_record', error);
      }
    },
  );

  server.registerTool(
    'delete_bitable_record',
    {
      title: 'Delete Bitable Record',
      description: '删除多维表格中的一条记录。此操作不可恢复。',
      inputSchema: {
        app_token: z.string().min(1),
        table_id: z.string().min(1),
        record_id: z.string().min(1),
      },
      annotations: { destructiveHint: true },
    },
    async ({ app_token, table_id, record_id }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `${tablePath(app_token, table_id)}/records/${encodePath(record_id)}`,
          getAccessToken(),
          { method: 'DELETE' },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('delete_bitable_record', error);
      }
    },
  );
}
