import { expect, it } from "vitest";
import { AIHttpError, AIResponseError, analysisFailureKey } from "../../src/renderer/services/ai-failure";

it.each([[401,"credentials"],[403,"credentials"],[404,"endpoint"],[429,"limited"],[504,"timeout"],[502,"request"]] as const)("classifies HTTP %s without reflecting upstream text", (status, key) => {
  expect(analysisFailureKey(new AIHttpError(status,"private response"))).toBe(key);
});
it("distinguishes timeout and invalid answers", () => {
  expect(analysisFailureKey(new Error("Request timeout"))).toBe("timeout");
  expect(analysisFailureKey(new AIResponseError())).toBe("answer");
});
