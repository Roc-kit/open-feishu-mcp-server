import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { encodePath, errorResult, feishuRequest, textResult } from './feishu-api';

const cellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export function registerSheetCoreTools(server: McpServer, getAccessToken: () => string) {
  server.registerTool(
    'read_sheet_range',
    {
      title: 'Read Feishu Sheet Range',
      description: '读取飞书普通电子表格的单个范围。range 格式为 <sheet_id>!A1:B10。',
      inputSchema: {
        spreadsheet_token: z.string().min(1),
        range: z.string().min(1),
        value_render_option: z.enum(['ToString', 'Formula', 'FormattedValue', 'UnformattedValue']).optional(),
        date_time_render_option: z.enum(['FormattedString']).optional(),
      },
    },
    async ({ spreadsheet_token, range, value_render_option, date_time_render_option }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `/sheets/v2/spreadsheets/${encodePath(spreadsheet_token)}/values/${encodePath(range)}`,
          getAccessToken(),
          {
            query: {
              valueRenderOption: value_render_option,
              dateTimeRenderOption: date_time_render_option,
            },
          },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('read_sheet_range', error);
      }
    },
  );

  server.registerTool(
    'write_sheet_range',
    {
      title: 'Write Feishu Sheet Range',
      description: '向飞书普通电子表格的单个范围写入二维数据。单次最多 5000 行、100 列。',
      inputSchema: {
        spreadsheet_token: z.string().min(1),
        range: z.string().min(1),
        values: z.array(z.array(cellValue).max(100)).min(1).max(5000),
      },
    },
    async ({ spreadsheet_token, range, values }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(
          `/sheets/v2/spreadsheets/${encodePath(spreadsheet_token)}/values`,
          getAccessToken(),
          {
            method: 'PUT',
            body: { valueRange: { range, values } },
          },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('write_sheet_range', error);
      }
    },
  );
}
