import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerBitableCoreTools } from './bitable';
import { registerDocumentCoreTools } from './document';
import { registerMessengerCoreTools } from './messenger';
import { registerSheetCoreTools } from './sheets';
import { registerTaskCoreTools } from './tasks';

export function registerCoreTools(server: McpServer, getAccessToken: () => string) {
  registerDocumentCoreTools(server, getAccessToken);
  registerSheetCoreTools(server, getAccessToken);
  registerBitableCoreTools(server, getAccessToken);
  registerMessengerCoreTools(server, getAccessToken);
  registerTaskCoreTools(server, getAccessToken);
}
