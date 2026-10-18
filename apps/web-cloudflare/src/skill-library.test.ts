import { expect, it } from "vitest";
import {
  data,
  object,
  register,
  request,
  restartWorker,
  string,
  useRuntime,
} from "./release-acceptance-cross-surface-runtime";

useRuntime();
it("manages Skill metadata, complete versions and deletion through HTTP across a restart", async () => {
  const owner = await register("library-owner");
  expect(await data("/api/runtime", owner.token)).toMatchObject({
    mode: "cloudflare",
    capabilities: {
      agentManagement: false,
      skillSafetyScan: false,
      skillRemoteImport: false,
    },
  });
  const other = await register("library-other");
  const created = object(
    await data(
      "/api/skills",
      owner.token,
      "POST",
      { name: "writer", content: "# First", visibility: "private" },
      201,
    ),
  );
  const id = string(created.id);
  expect(created.versionTrackingEnabled).toBe(true);
  const url = `/api/skills/${id}`;
  expect(
    (
      await request(`${url}/versions`, owner.token, "POST", {
        note: "bad\0note",
      })
    ).status,
  ).toBe(422);
  const files = [
    { relativePath: "SKILL.md", content: "# First" },
    { relativePath: "assets/icon.bin", content: "AP8D", encoding: "base64" },
  ];
  await data(`${url}/files`, owner.token, "PUT", { files });
  const version = object(
    await data(
      `${url}/versions`,
      owner.token,
      "POST",
      { note: "original" },
      201,
    ),
  );
  expect(version).toMatchObject({ version: 1, filesSnapshot: files });
  await data(url, owner.token, "PUT", {
    name: "writer-edited",
    content: "# Second",
    is_favorite: true,
  });
  expect(await data(`${url}/files`, owner.token)).toEqual([
    { relativePath: "SKILL.md", content: "# Second" },
    files[1],
  ]);
  expect(
    (await request(url, other.token, "PUT", { content: "stolen" })).status,
  ).toBe(404);
  expect(
    (await request(url, owner.token, "PUT", { currentVersion: 99 })).status,
  ).toBe(422);
  expect(
    (await request(url, owner.token, "PUT", { content: "bad\0entry" })).status,
  ).toBe(422);
  expect(
    (
      await request("/api/skills", owner.token, "POST", {
        name: "writer-edited",
      })
    ).status,
  ).toBe(409);
  await restartWorker();
  expect(await data(url, owner.token)).toMatchObject({
    name: "writer-edited",
    content: "# Second",
    is_favorite: true,
  });
  await data(`${url}/versions/1/rollback`, owner.token, "POST", {});
  expect(await data(`${url}/files`, owner.token)).toEqual(files);
  await data(`${url}/versions/${string(version.id)}`, owner.token, "DELETE");
  expect(await data(`${url}/versions`, owner.token)).toEqual([]);
  expect(
    object(await data(`${url}/versions`, owner.token, "POST", {}, 201)).version,
  ).toBe(2);
  await data(url, owner.token, "DELETE");
  expect((await request(url, owner.token)).status).toBe(404);
  expect((await request(`${url}/files`, owner.token)).status).toBe(404);
  const exported = object(await data("/api/sync/data", owner.token));
  expect(exported.skills).toEqual([]);
  expect(exported.skillVersions).toEqual([]);
  expect(exported.skillFiles).toEqual({});
}, 60_000);

it("restricts shared writes and validates bulk deletion before changing the tenant library", async () => {
  const user = await register("library-user");
  expect(
    (
      await request("/api/skills", user.token, "POST", {
        name: "shared",
        visibility: "shared",
      })
    ).status,
  ).toBe(403);
  await data(
    "/api/skills",
    user.token,
    "POST",
    { name: "private", visibility: "private" },
    201,
  );
  expect((await request("/api/skills", user.token, "DELETE")).status).toBe(422);
  expect(
    (await request("/api/skills?confirm=true", user.token, "DELETE")).status,
  ).toBe(403);
  expect(await data("/api/skills", user.token)).toHaveLength(1);
});
