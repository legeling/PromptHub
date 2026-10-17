import { describe, expect, it, vi } from "vitest";
import { GenerationScheduler } from "../src/generation-scheduler";

describe("generation endpoint scheduling", () => {
  it("starts four jobs concurrently, shares endpoint limits and rotates waiting batches", async () => {
    const scheduler = new GenerationScheduler();
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const job = (name: string) => async () => {
      started.push(name);
      await new Promise<void>((resolve) => releases.push(resolve));
    };
    const jobs = Array.from({ length: 6 }, (_, i) =>
      scheduler.schedule("endpoint", "a", job(`a${i}`)),
    );
    jobs.push(scheduler.schedule("endpoint", "b", job("b0")));
    jobs.push(scheduler.schedule("other", "c", job("c0")));
    await vi.waitFor(() =>
      expect(started).toEqual(["a0", "a1", "a2", "a3", "c0"]),
    );
    releases[0]();
    await vi.waitFor(() => expect(started.at(-1)).toBe("b0"));
    releases[1]();
    await vi.waitFor(() => expect(started.at(-1)).toBe("a4"));
    releases[2]();
    await vi.waitFor(() => expect(started.at(-1)).toBe("a5"));
    releases.forEach((release) => release());
    await Promise.all(jobs);
  });

  it("releases capacity after failure without blocking queued jobs", async () => {
    const scheduler = new GenerationScheduler();
    const failure = scheduler.schedule("endpoint", "a", async () => {
      throw new Error("failed");
    });
    const results = Promise.allSettled([
      failure,
      ...Array.from({ length: 8 }, () =>
        scheduler.schedule("endpoint", "b", async () => undefined),
      ),
    ]);
    expect(
      (await results).filter((result) => result.status === "fulfilled"),
    ).toHaveLength(8);
  });
});
