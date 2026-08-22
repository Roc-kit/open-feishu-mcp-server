import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type FeishuResponse<T = unknown> = {
  code?: number;
  msg?: string;
  data?: T;
};

async function feishuGet<T>(url: URL, userAccessToken: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

  const payload = (await response.json()) as FeishuResponse<T>;

  if (!response.ok || (typeof payload.code === 'number' && payload.code !== 0)) {
    const detail = payload.msg || `HTTP ${response.status}`;
    throw new Error(`Feishu API request failed: ${detail}${payload.code ? ` (code ${payload.code})` : ''}`);
  }

  return payload.data as T;
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: error instanceof Error ? error.message : 'Unknown error',
      },
    ],
  };
}

function shanghaiToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to resolve current date in Asia/Shanghai');
  }

  return `${year}-${month}-${day}`;
}

function shanghaiDayRange(date: string) {
  const startMs = new Date(`${date}T00:00:00+08:00`).getTime();
  if (Number.isNaN(startMs)) {
    throw new Error('Invalid date. Use YYYY-MM-DD.');
  }

  const start = Math.floor(startMs / 1000);
  return {
    start,
    end: start + 24 * 60 * 60 - 1,
  };
}

export function registerPersonalReadTools(
  server: McpServer,
  getUserAccessToken: () => string,
) {
  server.registerTool(
    'list_my_tasks',
    {
      title: 'List My Feishu Tasks',
      description:
        'List tasks visible to the signed-in Feishu user. By default returns incomplete tasks only. Use this for questions such as “我还有哪些待办？”',
      inputSchema: {
        completed: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to return completed tasks. Default false.'),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(50)
          .describe('Maximum number of tasks to fetch, up to 50.'),
      },
    },
    async ({ completed, page_size }) => {
      try {
        const url = new URL('https://open.feishu.cn/open-apis/task/v2/tasks');
        url.searchParams.set('page_size', String(page_size));
        url.searchParams.set('user_id_type', 'open_id');

        const data = await feishuGet<any>(url, getUserAccessToken());
        const items = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.tasks)
            ? data.tasks
            : [];

        const filtered = items.filter((task: any) => {
          const isCompleted = Boolean(task?.completed_at || task?.completed_time || task?.status === 'completed');
          return completed ? isCompleted : !isCompleted;
        });

        return textResult({
          count: filtered.length,
          has_more: data?.has_more ?? false,
          page_token: data?.page_token ?? null,
          tasks: filtered.map((task: any) => ({
            guid: task?.guid ?? task?.task_guid ?? null,
            summary: task?.summary ?? task?.name ?? '',
            description: task?.description ?? '',
            due: task?.due ?? null,
            start: task?.start ?? null,
            completed_at: task?.completed_at ?? task?.completed_time ?? null,
            members: task?.members ?? [],
            url: task?.url ?? task?.applink ?? null,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_today_events',
    {
      title: 'List Feishu Calendar Events',
      description:
        'List events on the signed-in user’s primary Feishu calendar for one date. Defaults to today in Asia/Shanghai. Use this for questions such as “我今天有什么安排？”',
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Date in YYYY-MM-DD. Defaults to today in Asia/Shanghai.'),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(50)
          .describe('Maximum number of calendar events to fetch, up to 50.'),
      },
    },
    async ({ date, page_size }) => {
      try {
        const targetDate = date || shanghaiToday();
        const range = shanghaiDayRange(targetDate);
        const url = new URL(
          'https://open.feishu.cn/open-apis/calendar/v4/calendars/primary/events',
        );
        url.searchParams.set('start_time', String(range.start));
        url.searchParams.set('end_time', String(range.end));
        url.searchParams.set('page_size', String(page_size));
        url.searchParams.set('user_id_type', 'open_id');

        const data = await feishuGet<any>(url, getUserAccessToken());
        const items = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.events)
            ? data.events
            : [];

        return textResult({
          date: targetDate,
          timezone: 'Asia/Shanghai',
          count: items.length,
          has_more: data?.has_more ?? false,
          page_token: data?.page_token ?? null,
          events: items.map((event: any) => ({
            event_id: event?.event_id ?? null,
            summary: event?.summary ?? '',
            description: event?.description ?? '',
            start_time: event?.start_time ?? null,
            end_time: event?.end_time ?? null,
            free_busy_status: event?.free_busy_status ?? null,
            self_rsvp_status: event?.self_rsvp_status ?? null,
            organizer: event?.organizer ?? null,
            status: event?.status ?? null,
            visibility: event?.visibility ?? null,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
