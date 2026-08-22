import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { encodePath, errorResult, feishuRequest, textResult } from './feishu-api';

type TaskItem = {
  guid?: string;
  task_guid?: string;
  summary?: string;
  name?: string;
  description?: string;
  due?: unknown;
  start?: unknown;
  completed_at?: string | number | null;
  completed_time?: string | number | null;
  status?: string;
  members?: unknown[];
  url?: string;
  applink?: string;
};

type TaskListData = {
  items?: TaskItem[];
  tasks?: TaskItem[];
  has_more?: boolean;
  page_token?: string;
};

type CurrentUserData = {
  open_id?: string;
};

export function isTaskCompleted(task: TaskItem): boolean {
  const completedAt = task.completed_at ?? task.completed_time;
  return (completedAt !== undefined && completedAt !== null && String(completedAt) !== '0') || task.status === 'completed';
}

const dueSchema = z.object({
  timestamp: z.string().regex(/^\d+$/).describe('Unix 毫秒时间戳字符串'),
  is_all_day: z.boolean().optional().default(false),
});

function taskPath(taskGuid: string): string {
  return `/task/v2/tasks/${encodePath(taskGuid)}`;
}

export function registerTaskCoreTools(server: McpServer, getAccessToken: () => string) {
  server.registerTool(
    'list_my_tasks',
    {
      title: 'List My Feishu Tasks',
      description: '列出当前登录用户可见的任务。默认仅返回未完成任务；completed_at="0" 会被正确识别为未完成。',
      inputSchema: {
        completed: z.boolean().optional().default(false),
        page_size: z.number().int().min(1).max(50).optional().default(50),
        page_token: z.string().min(1).optional(),
      },
    },
    async ({ completed, page_size, page_token }) => {
      try {
        const data = await feishuRequest<TaskListData>('/task/v2/tasks', getAccessToken(), {
          query: { page_size, page_token, completed, user_id_type: 'open_id' },
        });
        const items = Array.isArray(data.items) ? data.items : Array.isArray(data.tasks) ? data.tasks : [];

        return textResult({
          count: items.length,
          has_more: data.has_more ?? false,
          page_token: data.page_token ?? null,
          tasks: items.map((task) => ({
            guid: task.guid ?? task.task_guid ?? null,
            summary: task.summary ?? task.name ?? '',
            description: task.description ?? '',
            due: task.due ?? null,
            start: task.start ?? null,
            completed_at: task.completed_at ?? task.completed_time ?? null,
            members: task.members ?? [],
            url: task.url ?? task.applink ?? null,
          })),
        });
      } catch (error) {
        return errorResult('list_my_tasks', error);
      }
    },
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create Feishu Task',
      description: '为当前登录用户创建飞书任务。支持标题、描述和截止时间。',
      inputSchema: {
        summary: z.string().min(1).max(3000),
        description: z.string().max(100_000).optional(),
        due: dueSchema.optional(),
      },
    },
    async ({ summary, description, due }) => {
      try {
        const accessToken = getAccessToken();
        const currentUser = await feishuRequest<CurrentUserData>('/authen/v1/user_info', accessToken);
        if (!currentUser.open_id) {
          throw new Error('Feishu user info did not include open_id');
        }

        const data = await feishuRequest<Record<string, unknown>>('/task/v2/tasks', accessToken, {
          method: 'POST',
          query: { user_id_type: 'open_id' },
          body: {
            summary,
            description,
            due,
            members: [
              {
                id: currentUser.open_id,
                type: 'user',
                role: 'assignee',
              },
            ],
            client_token: crypto.randomUUID(),
          },
        });
        return textResult(data);
      } catch (error) {
        return errorResult('create_task', error);
      }
    },
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update Feishu Task',
      description: '更新飞书任务的标题、描述或截止时间。至少传一个待更新字段。',
      inputSchema: {
        task_guid: z.string().min(1),
        summary: z.string().min(1).max(3000).optional(),
        description: z.string().max(100_000).optional(),
        due: dueSchema.nullable().optional(),
      },
    },
    async ({ task_guid, summary, description, due }) => {
      try {
        const task: Record<string, unknown> = {};
        const updateFields: string[] = [];
        if (summary !== undefined) {
          task.summary = summary;
          updateFields.push('summary');
        }
        if (description !== undefined) {
          task.description = description;
          updateFields.push('description');
        }
        if (due !== undefined) {
          if (due !== null) {
            task.due = due;
          }
          updateFields.push('due');
        }
        if (updateFields.length === 0) {
          throw new Error('At least one field must be provided');
        }

        const data = await feishuRequest<Record<string, unknown>>(taskPath(task_guid), getAccessToken(), {
          method: 'PATCH',
          query: { user_id_type: 'open_id' },
          body: { task, update_fields: updateFields },
        });
        return textResult(data);
      } catch (error) {
        return errorResult('update_task', error);
      }
    },
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete or Reopen Feishu Task',
      description: '完成任务，或把任务恢复为未完成。',
      inputSchema: {
        task_guid: z.string().min(1),
        completed: z.boolean().optional().default(true),
      },
    },
    async ({ task_guid, completed }) => {
      try {
        const completedAt = completed ? String(Date.now()) : '0';
        const data = await feishuRequest<Record<string, unknown>>(taskPath(task_guid), getAccessToken(), {
          method: 'PATCH',
          query: { user_id_type: 'open_id' },
          body: { task: { completed_at: completedAt }, update_fields: ['completed_at'] },
        });
        return textResult(data);
      } catch (error) {
        return errorResult('complete_task', error);
      }
    },
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Delete Feishu Task',
      description: '删除一个飞书任务。此操作不可恢复。',
      inputSchema: { task_guid: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ task_guid }) => {
      try {
        const data = await feishuRequest<Record<string, unknown>>(taskPath(task_guid), getAccessToken(), {
          method: 'DELETE',
        });
        return textResult(data);
      } catch (error) {
        return errorResult('delete_task', error);
      }
    },
  );
}
