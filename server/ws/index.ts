// ABOUTME: WS 端点编排入口；server 启动时调用 setupWsEndpoints 注册全部端点

import { setupChatEndpoint } from './chat';

export { handleUpgrade, type WsMessage } from './registry';

export function setupWsEndpoints(): void {
  setupChatEndpoint();
}
