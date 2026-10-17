import { describe, expect, it, vi } from "vitest";
import { resolveCliInstallSource } from "../../../src/main/services/cli-install-source";

function release(version: string, cli = true, prerelease = false) {
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease,
    assets: cli
      ? [
          {
            name: `prompthub-cli-${version}.tgz`,
            browser_download_url: `https://github.com/legeling/PromptHub/releases/download/v${version}/prompthub-cli-${version}.tgz`,
          },
        ]
      : [],
  };
}

describe("latest published CLI source", () => {
  it("uses the latest stable release containing a CLI asset", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            release("0.8.0-beta.1", true, true),
            release("0.7.0", false),
            release("0.6.1"),
            release("0.5.9"),
          ]),
        ),
      );
    expect(await resolveCliInstallSource(fetcher)).toEqual({
      releaseTag: "v0.6.1",
      location:
        "https://github.com/legeling/PromptHub/releases/download/v0.6.1/prompthub-cli-0.6.1.tgz",
    });
  });

  it("continues to older releases when the first page has no CLI package", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([release("0.7.0", false)]), {
          headers: {
            link: '<https://api.github.com/repos/legeling/PromptHub/releases?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([release("0.5.9")])));
    expect((await resolveCliInstallSource(fetcher)).releaseTag).toBe("v0.5.9");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable releases instead of inventing a package URL", async () => {
    await expect(
      resolveCliInstallSource(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(JSON.stringify([release("0.7.0", false)])),
          ),
      ),
    ).rejects.toThrow("No published CLI package");
  });

  it.each([403, 404, 500])(
    "propagates release lookup HTTP %s without falling back",
    async (status) => {
      await expect(
        resolveCliInstallSource(
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response("unavailable", { status })),
        ),
      ).rejects.toThrow(`HTTP ${status}`);
    },
  );

  it("rejects unexpected asset hosts or shell syntax", async () => {
    const invalid = release("0.6.1");
    invalid.assets[0].browser_download_url =
      "https://untrusted.example/cli.tgz&echo";
    await expect(
      resolveCliInstallSource(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(JSON.stringify([invalid]))),
      ),
    ).rejects.toThrow("Invalid CLI release asset URL");
  });
});
