import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { encodePath, errorResult, feishuRequest, textResult } from './feishu-api';

type TextStyle = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
  link?: { url: string };
};

type TextElement = {
  text_run: {
    content: string;
    text_element_style?: TextStyle;
  };
};

type DocumentBlock = Record<string, unknown> & {
  block_id: string;
  block_type: number;
};

type ConvertedBlocks = {
  first_level_block_ids: string[];
  blocks: DocumentBlock[];
};

const BLOCK_TYPES = {
  text: 2,
  heading1: 3,
  heading2: 4,
  heading3: 5,
  heading4: 6,
  heading5: 7,
  heading6: 8,
  bullet: 12,
  ordered: 13,
  code: 14,
  quote: 15,
  todo: 17,
} as const;

function textElements(content: string): TextElement[] {
  const elements: TextElement[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let cursor = 0;

  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      elements.push({ text_run: { content: content.slice(cursor, index) } });
    }

    const token = match[0];
    if (token.startsWith('**')) {
      elements.push({
        text_run: {
          content: token.slice(2, -2),
          text_element_style: { bold: true },
        },
      });
    } else if (token.startsWith('`')) {
      elements.push({
        text_run: {
          content: token.slice(1, -1),
          text_element_style: { inline_code: true },
        },
      });
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      elements.push({
        text_run: {
          content: link?.[1] ?? token,
          text_element_style: link ? { link: { url: link[2] } } : undefined,
        },
      });
    }
    cursor = index + token.length;
  }

  if (cursor < content.length || elements.length === 0) {
    elements.push({ text_run: { content: content.slice(cursor) } });
  }
  return elements;
}

function makeTextBlock(kind: keyof typeof BLOCK_TYPES, content: string, style?: Record<string, unknown>): DocumentBlock {
  const blockId = crypto.randomUUID();
  return {
    block_id: blockId,
    block_type: BLOCK_TYPES[kind],
    [kind]: {
      elements: textElements(content),
      ...(style ? { style } : {}),
    },
  };
}

export function markdownToBlocks(markdown: string): ConvertedBlocks {
  const blocks: DocumentBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let codeFence: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (codeFence === null) {
        codeFence = [];
      } else {
        blocks.push(makeTextBlock('code', codeFence.join('\n')));
        codeFence = null;
      }
      continue;
    }

    if (codeFence !== null) {
      codeFence.push(line);
      continue;
    }

    if (!line.trim()) {continue;}

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push(makeTextBlock(`heading${heading[1].length}` as keyof typeof BLOCK_TYPES, heading[2]));
      continue;
    }

    const todo = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (todo) {
      blocks.push(makeTextBlock('todo', todo[2], { done: todo[1].toLowerCase() === 'x' }));
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      blocks.push(makeTextBlock('bullet', bullet[1]));
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      blocks.push(makeTextBlock('ordered', ordered[1]));
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push(makeTextBlock('quote', quote[1]));
      continue;
    }

    blocks.push(makeTextBlock('text', line));
  }

  if (codeFence !== null) {
    blocks.push(makeTextBlock('code', codeFence.join('\n')));
  }

  if (blocks.length === 0) {
    throw new Error('Content must contain at least one non-empty block');
  }
  if (blocks.length > 1000) {
    throw new Error('A single conversion can contain at most 1000 blocks');
  }

  return {
    first_level_block_ids: blocks.map((block) => block.block_id),
    blocks,
  };
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gis, (_match, level: string, text: string) => `${'#'.repeat(Number(level))} ${text}\n`)
    .replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function registerDocumentCoreTools(server: McpServer, getAccessToken: () => string) {
  const conversionSchema = {
    content_type: z.enum(['markdown', 'html']).default('markdown'),
    content: z.string().min(1).max(1_048_576),
  };

  server.registerTool(
    'convert_content_to_blocks',
    {
      title: 'Convert Content to Feishu Blocks',
      description: '在本地将基础 Markdown/HTML 转为飞书文档块，支持标题、段落、列表、待办、引用、代码块、粗体、行内代码和链接。',
      inputSchema: conversionSchema,
    },
    async ({ content_type, content }) => {
      try {
        return textResult(markdownToBlocks(content_type === 'html' ? htmlToMarkdown(content) : content));
      } catch (error) {
        return errorResult('convert_content_to_blocks', error);
      }
    },
  );

  server.registerTool(
    'append_document_content',
    {
      title: 'Append Content to Feishu Document',
      description: '把基础 Markdown/HTML 直接追加到飞书云文档末尾。',
      inputSchema: {
        document_id: z.string().min(1),
        ...conversionSchema,
        index: z.number().int().min(0).optional(),
      },
    },
    async ({ document_id, content_type, content, index }) => {
      try {
        const converted = markdownToBlocks(content_type === 'html' ? htmlToMarkdown(content) : content);
        const data = await feishuRequest<Record<string, unknown>>(
          `/docx/v1/documents/${encodePath(document_id)}/blocks/${encodePath(document_id)}/descendant`,
          getAccessToken(),
          {
            method: 'POST',
            body: {
              children_id: converted.first_level_block_ids,
              descendants: converted.blocks,
              ...(index === undefined ? {} : { index }),
            },
          },
        );
        return textResult(data);
      } catch (error) {
        return errorResult('append_document_content', error);
      }
    },
  );
}
