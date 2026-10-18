/** Bound serialized requests equally in both hosted runtimes and before upload. */
export const HOSTED_RESOURCE_REQUEST_MAX_BYTES = 1024 * 1024;

export function serializeHostedResourceRequest(value: unknown): string {
  const body = JSON.stringify(value);
  if (
    new TextEncoder().encode(body).byteLength >
    HOSTED_RESOURCE_REQUEST_MAX_BYTES
  ) {
    throw new Error(
      "Resource request exceeds the hosted 1 MiB limit; no data was saved",
    );
  }
  return body;
}
