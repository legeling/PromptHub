import { z } from "zod";

/** Only capabilities implemented by the web bridge belong in this contract. */
export const webRuntimeSchema = z.object({
  mode: z.enum(["self-hosted", "cloudflare"]),
  capabilities: z.object({
    agentManagement: z.boolean(),
    skillSafetyScan: z.boolean(),
    skillRemoteImport: z.boolean(),
    skillFileEditing: z.boolean().default(false),
    skillPackageImport: z.boolean().default(false),
  }),
});

export type WebRuntime = z.infer<typeof webRuntimeSchema>;

export function getWebRuntime(mode: WebRuntime["mode"]): WebRuntime {
  return {
    mode,
    capabilities: {
      agentManagement: mode === "self-hosted",
      skillSafetyScan: mode === "self-hosted",
      // Full repository import is not yet available through the browser bridge.
      skillRemoteImport: false,
      skillFileEditing: true,
      skillPackageImport: true,
    },
  };
}
