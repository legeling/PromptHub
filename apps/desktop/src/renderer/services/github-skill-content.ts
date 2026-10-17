type FetchContent = (url: string) => Promise<string>;
interface SkillContentLocation {
  rawUrl: string;
  apiUrl: string;
}

async function fetchFileApi(url: string, fetch: FetchContent): Promise<string> {
  const data: unknown = JSON.parse(await fetch(url));
  if (
    typeof data !== "object" ||
    data === null ||
    !("encoding" in data) ||
    data.encoding !== "base64" ||
    !("content" in data) ||
    typeof data.content !== "string"
  ) {
    throw new Error("Invalid GitHub file content response");
  }
  const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, "")), (char) =>
    char.charCodeAt(0),
  );
  const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!content.trim()) throw new Error("Empty GitHub file content response");
  return content;
}

async function fetchLocation(
  location: SkillContentLocation,
  fetch: FetchContent,
): Promise<string> {
  try {
    return await fetchContent(location.rawUrl, fetch);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/rate limit|403|401/i.test(message)) throw error;
    return fetchFileApi(location.apiUrl, fetch);
  }
}

async function fetchContent(url: string, fetch: FetchContent): Promise<string> {
  try {
    const content = await fetch(url);
    if (!content.trim()) throw new Error("Empty Skill response");
    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/404|not found|rate limit|403|401/i.test(message)) throw error;
    const content = await fetch(url);
    if (!content.trim()) throw new Error("Empty Skill response");
    return content;
  }
}

/** Publish a catalog only after every discovered entrypoint has been fetched. */
export async function loadGitHubSkillContents(
  locations: SkillContentLocation[],
  fetch: FetchContent,
  incompleteMessage: (loaded: number, total: number) => string,
): Promise<string[]> {
  const contents: string[] = new Array(locations.length);
  let next = 0;
  let loaded = 0;
  let firstFailure: unknown;
  const worker = async (): Promise<void> => {
    while (next < locations.length) {
      const index = next++;
      try {
        contents[index] = await fetchLocation(locations[index], fetch);
        loaded += 1;
      } catch (error) {
        firstFailure ??= error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, locations.length) }, worker),
  );
  if (loaded !== locations.length) {
    throw new Error(incompleteMessage(loaded, locations.length), {
      cause: firstFailure,
    });
  }
  return contents;
}
