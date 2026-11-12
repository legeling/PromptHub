import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  createVideoTask,
  getVideoTask,
} from "../../../src/renderer/services/video-generation";

beforeEach(() => vi.stubGlobal("window", { setTimeout, clearTimeout }));
afterEach(() => vi.unstubAllGlobals());

it("submits ordered image and video references and retrieves the finished Ark movie", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: "job-1" }))
    .mockResolvedValueOnce(
      Response.json({
        status: "succeeded",
        content: { video_url: "https://cdn.example/movie.mp4" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const model = {
    apiUrl: "https://gateway.example/api/v3",
    apiKey: "fixture",
    model: "seedance",
    videoProtocol: "ark",
  } as const;
  const refs = {
    images: ["data:image/png;base64,YQ=="],
    videos: ["asset://clip"],
  };
  expect(await createVideoTask(model, "pan", refs)).toBe("job-1");
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://gateway.example/api/v3/contents/generations/tasks",
  );
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
    model: "seedance",
    content: [
      { type: "text", text: "pan" },
      {
        type: "image_url",
        role: "reference_image",
        image_url: { url: refs.images[0] },
      },
      {
        type: "video_url",
        role: "reference_video",
        video_url: { url: refs.videos[0] },
      },
    ],
  });
  expect(await getVideoTask(model, "job-1")).toEqual({
    state: "succeeded",
    url: "https://cdn.example/movie.mp4",
  });
});

it("submits native Wan references and surfaces a failed task without submitting another", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ output: { task_id: "wan-job" } }))
    .mockResolvedValueOnce(
      Response.json({
        output: { task_status: "FAILED", message: "Unsupported reference" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const model = {
    apiUrl: "https://gateway.example/api/v1",
    apiKey: "fixture",
    model: "wan2.7-r2v",
    videoProtocol: "dashscope",
  } as const;
  expect(
    await createVideoTask(model, "pan", {
      images: [],
      videos: ["oss://dashscope-instant/clip.mp4"],
    }),
  ).toBe("wan-job");
  expect(
    JSON.parse(String(fetcher.mock.calls[0][1]?.body)).input.media,
  ).toEqual([
    { type: "reference_video", url: "oss://dashscope-instant/clip.mp4" },
  ]);
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
    "X-DashScope-OssResourceResolve": "enable",
  });
  await expect(getVideoTask(model, "wan-job")).rejects.toThrow(
    "Unsupported reference",
  );
  expect(fetcher.mock.calls[1][0]).toBe(
    "https://gateway.example/api/v1/tasks/wan-job",
  );
});

it("uploads a local Wan clip using the issued OSS fields without forwarding the model key", async () => {
  const { uploadWanVideo } =
    await import("../../../src/renderer/services/video-references");
  const policy = {
    upload_host: "https://fixture.oss-cn-beijing.aliyuncs.com",
    upload_dir: "dashscope-instant/test",
    oss_access_key_id: "temporary",
    policy: "policy",
    signature: "sig",
    x_oss_object_acl: "private",
    x_oss_forbid_overwrite: "true",
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, body: JSON.stringify({ data: policy }) })
    .mockResolvedValueOnce({ ok: true });
  vi.stubGlobal("window", {
    api: { ai: { request } },
    electron: { readVideoBase64: async () => "YWJj" },
  });
  const model = {
    apiUrl: "https://example.com/api/v1",
    apiKey: "private-fixture",
    model: "wan2.7-r2v",
    videoProtocol: "dashscope",
  } as const;
  const source = await uploadWanVideo(model, "clip.mp4");
  expect(source).toMatch(/^oss:\/\/dashscope-instant\/test\/.+\.mp4$/);
  expect(request.mock.calls[1][0]).toMatchObject({
    headers: {},
    multipart: {
      fields: { key: source.slice(6) },
      files: [
        {
          fieldName: "file",
          fileName: "clip.mp4",
          mimeType: "video/mp4",
          base64: "YWJj",
        },
      ],
    },
  });
});

it("never sends a request for an unconfigured video protocol", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const model = { apiUrl: "https://gateway.example", apiKey: "fixture", model: "seedance-custom" };
  await expect(createVideoTask(model, "pan", { images: [], videos: [] })).rejects.toThrow(/protocol/i);
  await expect(getVideoTask(model, "job")).rejects.toThrow(/protocol/i);
  expect(fetcher).not.toHaveBeenCalled();
});
