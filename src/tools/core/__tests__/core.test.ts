import { markdownToBlocks } from '../document';
import { isTaskCompleted } from '../tasks';

describe('core Feishu tools', () => {
  test('converts basic Markdown into ordered Feishu blocks', () => {
    const converted = markdownToBlocks(
      '# 标题\n\n- 项目\n- [x] 已完成\n```ts\nconst ok = true;\n```',
    );

    expect(converted.blocks.map((block) => block.block_type)).toEqual([3, 12, 17, 14]);
    expect(converted.first_level_block_ids).toHaveLength(converted.blocks.length);
  });

  test('treats completed_at="0" as incomplete', () => {
    expect(isTaskCompleted({ completed_at: '0' })).toBe(false);
    expect(isTaskCompleted({ completed_at: '1720000000000' })).toBe(true);
    expect(isTaskCompleted({ status: 'completed' })).toBe(true);
  });
});
