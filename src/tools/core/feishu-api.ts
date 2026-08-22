const FEISHU_API_ROOT = 'https://open.feishu.cn/open-apis';

type QueryValue = string | number | boolean | undefined;

type FeishuEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
};

export async function feishuRequest<T>(
  path: string,
  accessToken: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${FEISHU_API_ROOT}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const raw = await response.text();
  let payload: FeishuEnvelope<T> = {};

  if (raw) {
    try {
      payload = JSON.parse(raw) as FeishuEnvelope<T>;
    } catch {
      throw new Error(`Feishu API returned invalid JSON (HTTP ${response.status})`);
    }
  }

  if (!response.ok || (typeof payload.code === 'number' && payload.code !== 0)) {
    const code = typeof payload.code === 'number' ? `, code ${payload.code}` : '';
    throw new Error(
      `Feishu API request failed (HTTP ${response.status}${code}): ${payload.msg || raw || 'Unknown error'}`,
    );
  }

  return (payload.data ?? {}) as T;
}

export function textResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function errorResult(toolName: string, error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: `${toolName} failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
  };
}

export function encodePath(value: string): string {
  return encodeURIComponent(value);
}
