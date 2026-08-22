import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type FeishuResponse<T = unknown> = {
  code?: number;
  msg?: string;
  data?: T;
};

const CALLOUT_EMOJIS = [
  { emoji_id: 'check_mark', keywords: '成功 完成 确认 正确 check success done' },
  { emoji_id: 'warning', keywords: '警告 注意 风险 warning alert caution' },
  { emoji_id: 'pushpin', keywords: '重点 固定 提醒 图钉 pin important reminder' },
  { emoji_id: 'bulb', keywords: '想法 灵感 建议 灯泡 idea tip suggestion' },
  { emoji_id: 'rocket', keywords: '启动 发布 增长 火箭 launch release growth' },
  { emoji_id: 'fire', keywords: '热门 紧急 火 fire hot urgent' },
  { emoji_id: 'star', keywords: '收藏 推荐 星 star favorite recommended' },
  { emoji_id: 'heart', keywords: '喜欢 关爱 心 heart love care' },
  { emoji_id: 'thumbsup', keywords: '赞 同意 支持 thumbs up approve support' },
  { emoji_id: 'question_mark', keywords: '问题 疑问 帮助 question help' },
];

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

export function registerCompatibilityTools(
  server: McpServer,
  getUserAccessToken: () => string,
) {
  server.registerTool(
    'get_document_raw_content',
    {
      title: 'Get Feishu Document Raw Content',
      description:
        '获取飞书文档的纯文本全文。lang 默认为 0，避免飞书接口因缺失该参数而返回错误。',
      inputSchema: {
        document_id: z.string().min(1).describe('飞书文档 document_id'),
        lang: z
          .number()
          .int()
          .min(0)
          .max(2)
          .optional()
          .default(0)
          .describe('0=默认名称，1=英文名称，2=默认名称；默认 0'),
      },
    },
    async ({ document_id, lang }) => {
      try {
        const url = new URL(
          `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(document_id)}/raw_content`,
        );
        url.searchParams.set('lang', String(lang ?? 0));

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${getUserAccessToken()}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        });
        const payload = (await response.json()) as FeishuResponse<{ content?: string }>;

        if (!response.ok || (typeof payload.code === 'number' && payload.code !== 0)) {
          throw new Error(
            `Feishu API request failed: ${payload.msg || `HTTP ${response.status}`}${payload.code ? ` (code ${payload.code})` : ''}`,
          );
        }

        return textResult({ content: payload.data?.content ?? '' });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'search_feishu_callout_emoji',
    {
      title: 'Search Feishu Callout Emoji',
      description:
        '本地搜索适用于飞书 Callout 块的常用 emoji_id，不依赖外部搜索服务。',
      inputSchema: {
        query: z.string().min(1).describe('中文或英文搜索关键词'),
        limit: z.number().int().min(1).max(20).optional().default(5),
      },
    },
    async ({ query, limit }) => {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const ranked = CALLOUT_EMOJIS.map((item) => {
        const haystack = `${item.emoji_id} ${item.keywords}`.toLowerCase();
        const matches = terms.filter((term) => haystack.includes(term)).length;
        return {
          emoji_id: item.emoji_id,
          score: matches > 0 ? Math.min(1, 0.6 + matches * 0.2) : 0.1,
        };
      })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit ?? 5);

      return textResult({ results: ranked });
    },
  );
}
