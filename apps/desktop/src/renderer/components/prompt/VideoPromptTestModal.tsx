import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { isVideoModelProtocol, type Prompt } from "@prompthub/shared/types";
import type { AIModelConfig } from "../../stores/settings/settings-types";
import { useSettingsStore } from "../../stores/settings.store";
import {
  resolveLocalImageSrc,
  resolveLocalVideoSrc,
} from "../../utils/media-url";
import { Modal } from "../ui/Modal";
import {
  createVideoTask,
  getVideoTask,
  type VideoTaskResult,
  type VideoReferences,
} from "../../services/video-generation";
import {
  arkVideoSource,
  uploadWanVideo,
  videoReferenceImage,
} from "../../services/video-references";

interface Task {
  id: string;
  modelId: string;
}
function readTask(key: string): Task | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "modelId" in value &&
      typeof value.modelId === "string"
    )
      return { id: value.id, modelId: value.modelId };
  } catch {
    sessionStorage.removeItem(key);
  }
  return null;
}

export function VideoPromptTestModal({
  prompt,
  onClose,
}: {
  prompt: Prompt;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const models = useSettingsStore((s) => s.aiModels).filter(
    (m) => m.type === "video",
  );
  const key = "prompthub:video-task:" + prompt.id;
  const [task, setTask] = useState(() => readTask(key));
  const [modelId, setModelId] = useState(
    () =>
      task?.modelId ??
      models.find((m) => m.isDefault)?.id ??
      models[0]?.id ??
      "",
  );
  const model = models.find((m) => m.id === modelId);
  const ready = isVideoModelProtocol(model?.videoProtocol);
  const [text, setText] = useState(
    [prompt.systemPrompt, prompt.userPrompt].filter(Boolean).join("\n\n"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VideoTaskResult | null>(null);
  async function run(
    loadReferences?: () => Promise<VideoReferences>,
  ): Promise<void> {
    if (busy || !model || !ready) return;
    setBusy(true);
    setError("");
    try {
      if (!loadReferences && task) {
        setResult(await getVideoTask(model, task.id));
      } else if (loadReferences) {
        const id = await createVideoTask(
          model,
          text.trim(),
          await loadReferences(),
        );
        const next = { id, modelId: model.id };
        setTask(next);
        sessionStorage.setItem(key, JSON.stringify(next));
        setResult({ state: "pending" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  function reset(): void {
    setTask(null);
    setResult(null);
    setError("");
    sessionStorage.removeItem(key);
  }
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t("videoTest.title")}
      size="lg"
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          {t("settings.videoModel")}
          <select
            className="block w-full rounded-lg border bg-background p-2"
            value={modelId}
            disabled={busy || !!task}
            onChange={(e) => setModelId(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.model}
              </option>
            ))}
          </select>
        </label>
        {!model && <p>{t("videoTest.configure")}</p>}
        {model && !ready && <p>{t("videoTest.chooseProtocol")}</p>}
        {!task && ready && (
          <VideoPromptForm
            prompt={prompt}
            model={model}
            busy={busy}
            text={text}
            setText={setText}
            submit={run}
          />
        )}
        {task && (
          <TaskResult
            task={task}
            result={result}
            busy={busy}
            canRefresh={ready}
            error={error}
            refresh={() => void run()}
            reset={reset}
          />
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function TaskResult({
  task,
  result,
  busy,
  canRefresh,
  error,
  refresh,
  reset,
}: {
  task: Task;
  result: VideoTaskResult | null;
  busy: boolean;
  canRefresh: boolean;
  error: string;
  refresh: () => void;
  reset: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="select-all break-all">{task.id}</p>
      {result?.state === "succeeded" ? (
        <>
          <video className="max-h-80 w-full" controls src={result.url} />
          <a
            className="text-primary underline"
            href={result.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("videoTest.open")}
          </a>
        </>
      ) : (
        <>
          {!error && <p>{t("videoTest.pending")}</p>}
          <button
            type="button"
            disabled={busy || !canRefresh}
            className="rounded border px-3 py-1"
            onClick={refresh}
          >
            {t("common.refresh")}
          </button>
        </>
      )}
      <button
        type="button"
        className="ml-2 rounded border px-3 py-1"
        disabled={busy}
        onClick={reset}
      >
        {t("videoTest.new")}
      </button>
    </div>
  );
}

function VideoPromptForm({
  prompt,
  model,
  text,
  setText,
  busy,
  submit,
}: {
  prompt: Prompt;
  model?: AIModelConfig;
  text: string;
  setText: (value: string) => void;
  busy: boolean;
  submit: (load: () => Promise<VideoReferences>) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const wan = model?.videoProtocol === "dashscope";
  const [images, setImages] = useState(prompt.images ?? []);
  const [videos, setVideos] = useState(prompt.videos ?? []);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [extraSources, setExtraSources] = useState("");
  const canSend =
    text.trim() &&
    (wan
      ? images.length + videos.length > 0
      : videos.every((name) => sources[name]?.trim()));

  async function loadReferences(): Promise<VideoReferences> {
    if (!model) throw new Error("Video model required");
    const refs: VideoReferences = { images: [], videos: [] };
    if (!wan)
      refs.videos = [
        ...videos.map((name) => sources[name]),
        ...extraSources
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      ].map(arkVideoSource);
    for (const name of images)
      refs.images.push(await videoReferenceImage(name));
    if (wan)
      for (const name of videos)
        refs.videos.push(await uploadWanVideo(model, name));

    return refs;
  }
  return (
    <fieldset disabled={busy} className="space-y-2">
      <textarea
        aria-label={t("prompt.userPromptLabel")}
        className="w-full rounded-lg border bg-background p-2"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-muted-foreground">{t("videoTest.references")}</p>
      {(prompt.images ?? []).map((name, i) => (
        <label className="flex items-center gap-2 break-all" key={i}>
          <input
            type="checkbox"
            checked={images.includes(name)}
            onChange={(e) =>
              setImages(
                e.target.checked
                  ? (prompt.images ?? []).filter(
                      (n) => n === name || images.includes(n),
                    )
                  : images.filter((n) => n !== name),
              )
            }
          />{" "}
          <img
            className="h-14 w-20 rounded object-contain"
            alt=""
            src={resolveLocalImageSrc(name)}
          />{" "}
          {name}
        </label>
      ))}
      {(prompt.videos ?? []).map((name, i) => (
        <div key={i}>
          <label className="break-all">
            <input
              type="checkbox"
              checked={videos.includes(name)}
              onChange={(e) =>
                setVideos(
                  e.target.checked
                    ? (prompt.videos ?? []).filter(
                        (n) => n === name || videos.includes(n),
                      )
                    : videos.filter((n) => n !== name),
                )
              }
            />{" "}
            {name}
          </label>
          <video
            className="max-h-32 max-w-full rounded"
            controls
            preload="metadata"
            src={resolveLocalVideoSrc(name)}
          />
          {!wan && videos.includes(name) && (
            <input
              aria-label={name}
              placeholder={t("videoTest.arkSource")}
              className="block w-full rounded-lg border bg-background p-2"
              value={sources[name] ?? ""}
              onChange={(e) =>
                setSources((prev) => ({
                  ...prev,
                  [name]: e.target.value,
                }))
              }
            />
          )}
        </div>
      ))}
      {!wan && (
        <label className="block">
          {t("videoTest.arkSource")}
          <textarea
            className="block w-full rounded-lg border bg-background p-2"
            value={extraSources}
            onChange={(e) => setExtraSources(e.target.value)}
          />
        </label>
      )}
      <button
        type="button"
        disabled={!model || !canSend || busy}
        className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        onClick={() => void submit(loadReferences)}
      >
        {t("videoTest.title")}
      </button>
    </fieldset>
  );
}
