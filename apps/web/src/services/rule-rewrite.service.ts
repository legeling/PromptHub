import type { AITransportRequest, AITransportResponse, RuleRewriteRequest, RuleRewriteResult } from '@prompthub/shared';
import { rewriteRuleWithAi } from '@prompthub/core/rules-rewrite';
import { requestRemoteBuffered } from '../utils/remote-http.js';

async function requestRewrite(request: AITransportRequest): Promise<AITransportResponse> {
  const response = await requestRemoteBuffered({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
    timeoutMs: request.timeoutMs,
    allowedProtocols: ['https:'],
  });
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body: response.body.toString('utf8'),
  };
}

export function rewriteRuleDraft(payload: RuleRewriteRequest): Promise<RuleRewriteResult> {
  return rewriteRuleWithAi(payload, requestRewrite);
}
