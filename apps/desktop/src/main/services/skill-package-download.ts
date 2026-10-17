import { initDatabase } from "../database";
import { readGithubTokenSetting } from "../settings/settings-readers";
import { fetchRemoteBytes } from "./skill-installer-remote";

/** Package downloads share the credential owner used by catalog requests. */
export async function fetchSkillPackageBytes(
  url: string,
  fetchBytes: typeof fetchRemoteBytes = fetchRemoteBytes,
): Promise<Uint8Array> {
  const database = initDatabase();
  const githubToken =
    database && typeof database.prepare === "function"
      ? readGithubTokenSetting(database)
      : null;
  if (!githubToken) return fetchBytes(url);
  const target = new URL(url);
  const archive = target.pathname.match(/^\/([^/]+)\/([^/]+)\/zip\/(.+)$/);
  if (
    target.protocol === "https:" &&
    target.hostname === "codeload.github.com" &&
    !target.port &&
    archive
  ) {
    // Authenticate at the API. Its signed redirect is fetched without the PAT.
    url = `https://api.github.com/repos/${archive[1]}/${archive[2]}/zipball/${archive[3]}`;
  }
  return fetchBytes(url, 0, { githubToken });
}
