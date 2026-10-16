import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

export interface CausalSyncDomain {
  resourceTypes: readonly string[];
  workspace: CausalSyncWorkspace;
}

/** Every resource has exactly one domain owner; application order follows registration. */
export function composeCausalSyncWorkspace(
  domains: readonly CausalSyncDomain[],
): CausalSyncWorkspace {
  const owners = new Map<string, CausalSyncWorkspace>();
  for (const domain of domains)
    for (const type of domain.resourceTypes) {
      if (owners.has(type))
        throw new Error(`Duplicate sync resource owner: ${type}`);
      owners.set(type, domain.workspace);
    }
  return {
    capture() {
      return domains.flatMap(({ workspace }) =>
        workspace.capture().map((resource) => {
          if (owners.get(resource.resourceType) !== workspace)
            throw new Error(
              `Invalid sync resource owner: ${resource.resourceType}`,
            );
          return resource;
        }),
      );
    },
    prepareApplication(resources) {
      const groups = new Map<CausalSyncWorkspace, CausalSyncPayload[]>(
        domains.map(({ workspace }) => [workspace, []]),
      );
      for (const resource of resources) {
        const owner = owners.get(resource.resourceType);
        if (!owner)
          throw new Error(
            `Missing sync resource owner: ${resource.resourceType}`,
          );
        groups.get(owner)!.push(resource);
      }
      const applications = domains.map(({ workspace }) =>
        workspace.prepareApplication(groups.get(workspace)!),
      );
      return {
        entries: applications.flatMap((application) => application.entries),
        apply: () => {
          for (const application of applications) application.apply();
        },
      };
    },
  };
}
