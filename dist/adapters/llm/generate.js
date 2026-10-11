import { createChatCompletion } from './chat-completions.js';
import { createResponse } from './responses.js';
import { createMessage } from './anthropic-messages.js';
export async function generateText(req, send = fetch) {
    switch (req.protocol) {
        case 'openai-responses': return createResponse(req, send);
        case 'openai-chat-completions': return createChatCompletion(req, send);
        case 'anthropic-messages': return createMessage(req, send);
        default: return { ok: false, code: 'UNSUPPORTED_PROTOCOL', message: '未知 API 协议' };
    }
}
//# sourceMappingURL=generate.js.map