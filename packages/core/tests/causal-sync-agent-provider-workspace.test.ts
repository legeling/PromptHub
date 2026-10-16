import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { AgentProviderProfileDB, DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { AgentProviderCausalSyncWorkspace } from "../src/causal-sync/agent-provider-workspace";
import { syncPayload } from "../src/causal-sync/payload";

const roots: string[] = [];
const databases: DatabaseAdapter[] = [];
function device() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-provider-"));
  roots.push(root);
  const database = new DatabaseAdapter(path.join(root, "db.sqlite"));
  databases.push(database);
  database.exec(SCHEMA);
  database.pragma("foreign_keys = ON");
  return {
    root,
    database,
    repository: new AgentProviderProfileDB(database),
    workspace: new AgentProviderCausalSyncWorkspace(database),
  };
}
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function create(d: ReturnType<typeof device>) {
  return d.repository.createProfileWithMappings(
    {
      name: "Provider",
      platformId: "codex",
      providerKind: "openai",
      protocol: "openai-responses",
      config: {},
      source: "manual",
      secretRef: "device-only-reference",
    },
    [{ routeKey: "primary", modelId: "model", parameters: {} }],
  );
}
function apply(
  d: ReturnType<typeof device>,
  resources: ReturnType<AgentProviderCausalSyncWorkspace["capture"]>,
) {
  const application = d.workspace.prepareApplication(resources);
  expect(application.entries).toEqual([]);
  d.database.transaction(application.apply)();
}

it("preserves mapping identity and metadata through transfer, reopen and deletion without exporting device secrets", () => {
  const a = device(),
    b = device(),
    profile = create(a);
  const resources = a.workspace.capture();
  expect(resources[0].text).not.toContain("device-only-reference");
  apply(b, resources);
  expect(b.repository.getProfileById(profile.id)).toEqual({
    ...profile,
    secretRef: `agent-provider:${profile.id}`,
  });
  expect(b.repository.listModelMappings(profile.id)).toEqual(
    a.repository.listModelMappings(profile.id),
  );
  const reopened = new DatabaseAdapter(path.join(b.root, "db.sqlite"));
  try {
    expect(new AgentProviderCausalSyncWorkspace(reopened).capture()).toEqual(
      resources,
    );
  } finally {
    reopened.close();
  }
  apply(b, []);
  expect(b.repository.listProfiles({ includeArchived: true })).toEqual([]);
});

it("updates the graph without clearing local credentials or detaching local deployment snapshots", () => {
  const a = device(),
    b = device(),
    profile = create(a);
  apply(b, a.workspace.capture());
  b.repository.updateProfile(
    profile.id,
    { secretRef: "destination-secret-reference" },
    profile.updatedAt,
  );
  const snapshot = b.repository.createSnapshot({
    platformId: "codex",
    providerProfileId: profile.id,
    nativeDigest: "digest",
    redactedSnapshot: {},
    operation: "import",
    result: "verified",
  });
  a.repository.updateProfileWithMappings(
    profile.id,
    { name: "Changed" },
    profile.updatedAt,
    [{ routeKey: "secondary", modelId: "next", parameters: {} }],
  );
  apply(b, a.workspace.capture());
  expect(b.repository.getProfileById(profile.id)).toMatchObject({
    name: "Changed",
    secretRef: "destination-secret-reference",
  });
  expect(b.repository.listSnapshots({ platformId: "codex" })).toEqual([
    snapshot,
  ]);
  expect(b.workspace.capture()).toEqual(a.workspace.capture());
});

it("rejects noncanonical metadata and duplicate mapping identities before changing SQL", () => {
  const a = device(),
    b = device();
  create(a);
  create(a);
  const resources = a.workspace.capture();
  const first = JSON.parse(resources[0].text),
    second = JSON.parse(resources[1].text);
  second.modelMappings[0].id = first.modelMappings[0].id;
  expect(() =>
    b.workspace.prepareApplication([
      resources[0],
      syncPayload("agent-provider", second.profile.id, second),
    ]),
  ).toThrow(/duplicate.*mapping/i);
  first.profile.name = "  unnormalized  ";
  expect(() =>
    b.workspace.prepareApplication([
      syncPayload("agent-provider", first.profile.id, first),
    ]),
  ).toThrow(/canonical/i);
  expect(b.repository.listProfiles()).toEqual([]);
});
