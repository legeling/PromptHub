import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("windows installer config", () => {
  it("pins a stable NSIS guid and custom include", () => {
    const configPath = path.join(process.cwd(), "electron-builder.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      nsis?: { guid?: string; include?: string };
    };

    expect(config.nsis?.guid).toBe("16181c11-b075-53d6-87cb-f192f9b74217");
    expect(config.nsis?.include).toBe("resources/installer.nsh");
  });

  it("ships the NSIS fallback include script", () => {
    const includePath = path.join(process.cwd(), "resources/installer.nsh");
    const contents = fs.readFileSync(includePath, "utf8");

    expect(contents).toContain("PROMPTHUB_INSTALL_STATE_KEY");
    expect(contents).toContain("customInit");
    expect(contents).toContain("customInstall");
  });
});
