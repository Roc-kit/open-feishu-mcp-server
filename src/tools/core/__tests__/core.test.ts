import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { markdownToBlocks } from '../document';
import { registerSheetCoreTools } from '../sheets';
import { isTaskCompleted, registerTaskCoreTools } from '../tasks';

async function createTestClient(register: (server: McpServer) => void) {
  const server = new McpServer({ name: 'test-server', version: '1.0.0' });
  register(server);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

describe('core Feishu tools', () => {
  test('converts basic Markdown into ordered Feishu blocks', () => {
    const converted = markdownToBlocks('# 标题\n\n- 项目\n- [x] 已完成\n```ts\nconst ok = true;\n```');

    expect(converted.blocks.map((block) => block.block_type)).toEqual([3, 12, 17, 14]);
    expect(converted.first_level_block_ids).toHaveLength(converted.blocks.length);
  });

  test('treats completed_at="0" as incomplete', () => {
    expect(isTaskCompleted({ completed_at: '0' })).toBe(false);
    expect(isTaskCompleted({ completed_at: '1720000000000' })).toBe(true);
    expect(isTaskCompleted({ status: 'completed' })).toBe(true);
  });

  test('registers and calls write_sheet_range with the Feishu values endpoint', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { updatedCells: 4 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { client, server } = await createTestClient((mcpServer) => {
      registerSheetCoreTools(mcpServer, () => 'test-token');
    });

    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toContain('write_sheet_range');

      const result = await client.callTool({
        name: 'write_sheet_range',
        arguments: {
          spreadsheet_token: 'spreadsheet-token',
          range: 'sheet-id!A1:B2',
          values: [
            ['a', 'b'],
            ['c', 'd'],
          ],
        },
      });

      expect(result.isError).not.toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl, requestInit] = fetchMock.mock.calls[0];
      expect(String(requestUrl)).toBe('https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/spreadsheet-token/values');
      expect(requestInit?.method).toBe('PUT');
      expect(JSON.parse(String(requestInit?.body))).toEqual({
        valueRange: {
          range: 'sheet-id!A1:B2',
          values: [
            ['a', 'b'],
            ['c', 'd'],
          ],
        },
      });
    } finally {
      await client.close();
      await server.close();
      fetchMock.mockRestore();
    }
  });

  test('passes the completed filter to Feishu when listing tasks', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { items: [], has_more: false } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { client, server } = await createTestClient((mcpServer) => {
      registerTaskCoreTools(mcpServer, () => 'test-token');
    });

    try {
      await client.callTool({
        name: 'list_my_tasks',
        arguments: { completed: false, page_size: 25 },
      });

      const [requestUrl] = fetchMock.mock.calls[0];
      const url = new URL(String(requestUrl));
      expect(url.searchParams.get('completed')).toBe('false');
      expect(url.searchParams.get('page_size')).toBe('25');
    } finally {
      await client.close();
      await server.close();
      fetchMock.mockRestore();
    }
  });

  test('assigns a newly created task to the current user', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { open_id: 'ou_current_user' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { task: { guid: 'task-guid' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const { client, server } = await createTestClient((mcpServer) => {
      registerTaskCoreTools(mcpServer, () => 'test-token');
    });

    try {
      const result = await client.callTool({
        name: 'create_task',
        arguments: { summary: '测试任务' },
      });

      expect(result.isError).not.toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[0][0])).toBe('https://open.feishu.cn/open-apis/authen/v1/user_info');
      const taskBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
      expect(taskBody.members).toEqual([{ id: 'ou_current_user', type: 'user', role: 'assignee' }]);
    } finally {
      await client.close();
      await server.close();
      fetchMock.mockRestore();
    }
  });
});
