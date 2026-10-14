import path from "node:path";
import { getAgentModelConfigPaths } from "./agent-model-config-paths";
import { fileExists, readTextConfig } from "./agent-model-config-io";
import {
  isJsonRecord,
  parseOpenCodeConfig,
  type JsonRecord,
} from "./agent-opencode-native-config";

interface OpenCodeConfigFile {
  relativePath: string;
  raw: string | null;
}

/** Later native files override individual keys, not the whole lower-priority file. */
function mergeConfig(lower: JsonRecord, upper: JsonRecord): JsonRecord {
  const merged = { ...lower };
  for (const [key, value] of Object.entries(upper)) {
    const previous = merged[key];
    const next =
      isJsonRecord(previous) && isJsonRecord(value)
        ? mergeConfig(previous, value)
        : key === "instructions" &&
            Array.isArray(previous) &&
            Array.isArray(value)
          ? [...new Set([...previous, ...value])]
          : value;
    Object.defineProperty(merged, key, {
      value: next,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return merged;
}

export async function readOpenCodeConfigFiles(rootPath: string): Promise<{
  files: OpenCodeConfigFile[];
  selected: OpenCodeConfigFile;
  config: JsonRecord;
  inherited: JsonRecord;
}> {
  const files = await Promise.all(
    getAgentModelConfigPaths("opencode").map(async (relativePath) => {
      const filePath = path.join(rootPath, relativePath);
      return {
        relativePath,
        raw: (await fileExists(filePath))
          ? await readTextConfig(filePath)
          : null,
      };
    }),
  );
  const selected = files.find((file) => file.raw !== null) ?? files[0];
  let config: JsonRecord = {};
  let inherited: JsonRecord = {};
  for (const file of [...files].reverse()) {
    if (file === selected) inherited = config;
    if (file.raw !== null)
      config = mergeConfig(config, parseOpenCodeConfig(file.raw));
  }
  return { files, selected, config, inherited };
}
