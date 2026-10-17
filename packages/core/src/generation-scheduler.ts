interface ScheduledRequest {
  batchId: string;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface EndpointQueue {
  running: number;
  lastBatch?: string;
  pending: ScheduledRequest[];
}

/** Bounded provider requests; persistence remains owned by the generation library. */
export class GenerationScheduler {
  private readonly endpoints = new Map<string, EndpointQueue>();

  schedule(
    endpoint: string,
    batchId: string,
    run: () => Promise<void>,
  ): Promise<void> {
    let queue = this.endpoints.get(endpoint);
    if (!queue) {
      queue = { running: 0, pending: [] };
      this.endpoints.set(endpoint, queue);
    }
    const completion = new Promise<void>((resolve, reject) => {
      queue.pending.push({ batchId, run, resolve, reject });
    });
    this.drain(endpoint, queue);
    return completion;
  }

  private drain(endpoint: string, queue: EndpointQueue): void {
    while (queue.running < 4 && queue.pending.length > 0) {
      const otherBatch = queue.pending.findIndex(
        (job) => job.batchId !== queue.lastBatch,
      );
      const [job] = queue.pending.splice(Math.max(0, otherBatch), 1);
      queue.running++;
      queue.lastBatch = job.batchId;
      void Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          queue.running--;
          this.drain(endpoint, queue);
        });
    }
    if (queue.running === 0 && queue.pending.length === 0)
      this.endpoints.delete(endpoint);
  }
}
