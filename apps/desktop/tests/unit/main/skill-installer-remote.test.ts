/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("dns/promises", () => ({
  lookup: vi.fn(),
}));

import * as dns from "dns/promises";
import { resolvePublicAddress } from "../../../src/main/services/skill-installer-remote";

describe("skill-installer-remote", () => {
  it("allows trusted remote hosts when DNS is mapped to 198.18.x.x compatibility addresses", async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([
      { address: "198.18.0.195", family: 4 },
    ]);

    await expect(resolvePublicAddress("raw.githubusercontent.com")).resolves.toEqual(
      { address: "198.18.0.195", family: 4 },
    );
  });

  it("allows trusted remote hosts when DNS is mapped to translated IPv6 compatibility addresses", async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([
      { address: "::ffff:0:c612:c3", family: 6 },
    ]);

    await expect(resolvePublicAddress("raw.githubusercontent.com")).resolves.toEqual(
      { address: "::ffff:0:c612:c3", family: 6 },
    );
  });

  it("still blocks untrusted hosts that resolve to 198.18.x.x", async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([
      { address: "198.18.0.42", family: 4 },
    ]);

    await expect(resolvePublicAddress("example.com")).rejects.toThrow(
      /Access to internal network addresses is not allowed/,
    );
  });
});
