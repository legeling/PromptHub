export const CLI_TEST_ENTRY_ENV = "PROMPTHUB_CLI_TEST_ENTRY";

export function getCliProcessEntry(): string {
  const entry = process.env[CLI_TEST_ENTRY_ENV];
  if (!entry) throw new Error("CLI process test bundle is unavailable");
  return entry;
}
