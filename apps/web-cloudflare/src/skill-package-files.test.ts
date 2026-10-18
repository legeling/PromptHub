import { expect, it } from "vitest";
import { SKILL_SNAPSHOT_CAPABILITY_HEADER } from "@prompthub/shared/utils/skill-file-snapshot";
import {
  data,
  object,
  register,
  request,
  restartWorker,
  useRuntime,
} from "./release-acceptance-cross-surface-runtime";

useRuntime();
it("updates a tenant's synchronized package and preserves binary files after Worker restart", async () => {
  const owner = await register("package-owner");
  const other = await register("package-other");
  const uploadedFiles = [
    { relativePath: "SKILL.md", content: "# Uploaded" },
    { relativePath: "upload.bin", content: "AP8D", encoding: "base64" },
  ];
  const uploaded = object(
    await data(
      "/api/skills/import-package",
      owner.token,
      "POST",
      {
        metadata: { name: "uploaded", visibility: "private" },
        files: uploadedFiles,
      },
      201,
    ),
  );
  expect(await data(`/api/skills/${uploaded.id}/files`, owner.token)).toEqual(
    uploadedFiles,
  );
  expect(
    (await request(`/api/skills/${uploaded.id}/files`, other.token)).status,
  ).toBe(404);
  await data(`/api/skills/${uploaded.id}`, owner.token, "DELETE");
  const snapshot = object(await data("/api/sync/data", owner.token));
  snapshot.skills = [
    {
      id: "writer",
      name: "writer",
      content: "# Initial",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    },
  ];
  const headers = { [SKILL_SNAPSHOT_CAPABILITY_HEADER]: "2" };
  expect(
    (
      await request(
        "/api/sync/data",
        owner.token,
        "PUT",
        { payload: snapshot },
        headers,
      )
    ).status,
  ).toBe(200);
  const files = [
    { relativePath: "SKILL.md", content: "# Saved" },
    { relativePath: "icon.bin", content: "AP8D", encoding: "base64" },
  ];
  await data("/api/skills/writer/files", owner.token, "PUT", { files });
  expect(
    (
      await request("/api/skills/writer/files", owner.token, "PUT", {
        files: [{ relativePath: "SKILL.md", content: "# stale" }],
        revision: "0".repeat(64),
      })
    ).status,
  ).toBe(409);
  await restartWorker();
  expect(await data("/api/skills/writer/files", owner.token)).toEqual(files);
  expect(await data("/api/skills/writer", owner.token)).toMatchObject({
    content: "# Saved",
  });
  expect((await request("/api/skills/writer/files", other.token)).status).toBe(
    404,
  );
  expect(
    (
      await request("/api/skills/writer/files", owner.token, "PUT", {
        files: [...files, { relativePath: "../outside", content: "bad" }],
      })
    ).status,
  ).toBe(422);
  expect(await data("/api/skills/writer/files", owner.token)).toEqual(files);
  const exported = await request(
    "/api/sync/data",
    owner.token,
    "GET",
    undefined,
    headers,
  );
  expect(exported.status).toBe(200);
  expect(object(object(await exported.json()).data).skillFiles).toEqual({
    writer: files,
  });
}, 60_000);
