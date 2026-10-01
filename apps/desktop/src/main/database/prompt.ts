/**
 * Re-export PromptDB from @prompthub/db for backward compatibility.
 * Consumers that import from `./database/prompt` will continue to work.
 */
export { PromptDB, buildFtsPhraseQuery } from "@prompthub/db";
