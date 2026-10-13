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

it("persists system-only content and versions through authenticated Worker APIs and restart (#225)", async () => {
  const owner = await register("worker-system-content");
  const content = "Return JSON. 中文 🦌";
  const prompt = object(
    await data(
      "/api/prompts",
      owner.token,
      "POST",
      {
        title: "System policy",
        systemPrompt: content,
        userPrompt: "",
      },
      201,
    ),
  );
  const id = string(prompt.id);
  expect(await data(`/api/prompts/${id}`, owner.token)).toMatchObject({
    systemPrompt: content,
    userPrompt: "",
  });
  expect(await data(`/api/prompts/${id}/versions`, owner.token)).toEqual([
    expect.objectContaining({ systemPrompt: content, userPrompt: "" }),
  ]);
  await data(`/api/prompts/${id}`, owner.token, "PUT", {
    title: "Renamed policy",
  });
  const before = await data(`/api/prompts/${id}`, owner.token);
  const history = await data(`/api/prompts/${id}/versions`, owner.token);
  await restartWorker();
  expect(await data(`/api/prompts/${id}`, owner.token)).toEqual(before);
  expect(await data(`/api/prompts/${id}/versions`, owner.token)).toEqual(
    history,
  );
});

it("rejects blank Worker writes without changing snapshots and merges partial content updates (#225)", async () => {
  const owner = await register("worker-content-rejection");
  for (const blank of ["", " \n\t\u3000"]) {
    const rejected = await request("/api/prompts", owner.token, "POST", {
      title: "Blank",
      systemPrompt: blank,
      userPrompt: blank,
    });
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("At least one"),
      },
    });
  }
  expect(await data("/api/prompts", owner.token)).toEqual([]);
  const prompt = object(
    await data(
      "/api/prompts",
      owner.token,
      "POST",
      {
        title: "Policy",
        systemPrompt: "Keep JSON",
        userPrompt: "",
      },
      201,
    ),
  );
  const id = string(prompt.id);
  await data(`/api/prompts/${id}`, owner.token, "PUT", { userPrompt: "" });
  const before = await data(`/api/prompts/${id}`, owner.token);
  const history = await data(`/api/prompts/${id}/versions`, owner.token);
  const rejected = await request(`/api/prompts/${id}`, owner.token, "PUT", {
    title: "Must not save",
    systemPrompt: " \n ",
  });
  expect(rejected.status).toBe(422);
  expect(await data(`/api/prompts/${id}`, owner.token)).toEqual(before);
  expect(await data(`/api/prompts/${id}/versions`, owner.token)).toEqual(
    history,
  );
  await data(`/api/prompts/${id}`, owner.token, "PUT", {
    systemPrompt: "",
    userPrompt: "User content",
  });
  expect(await data(`/api/prompts/${id}`, owner.token)).toMatchObject({
    systemPrompt: "",
    userPrompt: "User content",
  });
});
