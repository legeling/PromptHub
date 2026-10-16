/** ETags are opaque concurrency tokens, never content digests. */
export type RemoteWriteCondition = { ifMatch: string } | { ifNoneMatch: "*" };

export interface RemoteUploadResult {
  success: boolean;
  etag?: string;
  conflict?: boolean;
  error?: string;
}

export interface RemoteDownloadResult {
  success: boolean;
  data?: string;
  etag?: string;
  notFound?: boolean;
  error?: string;
}

export type RemoteDeleteResult = Pick<
  RemoteUploadResult,
  "success" | "conflict" | "error"
>;

export interface RemoteTextStorage {
  uploadText(
    path: string,
    content: string,
    condition?: RemoteWriteCondition,
  ): Promise<RemoteUploadResult>;
  downloadText(path: string): Promise<RemoteDownloadResult>;
  deleteText(path: string): Promise<RemoteDeleteResult>;
}
