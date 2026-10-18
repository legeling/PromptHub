import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.resolve(process.cwd(), "../..", ".github/workflows/release.yml"),
  "utf8",
).replace(/\r\n/g, "\n");
const stepName = "Use TCP for Apple ticket service on Intel runners";

describe("macOS release ticket transport", () => {
  it("limits the network workaround to Intel CI before signing and stapling", () => {
    const stepStart = workflow.indexOf(`      - name: ${stepName}\n`);
    expect(stepStart).toBeGreaterThan(-1);
    const stepEnd = workflow.indexOf("\n      - name:", stepStart + 1);
    const step = workflow.slice(stepStart, stepEnd);

    expect(step).toContain("if: matrix.os == 'macos-15-intel'");
    expect(step).toContain("shell: bash");
    expect(step).toContain("set -euo pipefail");
    expect(step).toContain(
      'echo "block return out quick proto udp from any to any port 443" | sudo pfctl -f -',
    );
    expect(step).toContain("sudo pfctl -E");
    expect(step).not.toContain("|| true");
    expect(step).not.toContain("continue-on-error");
    expect(stepStart).toBeLessThan(workflow.indexOf("      - name: Build for"));
  });

  it("still requires architecture, signature, ticket and Gatekeeper acceptance", () => {
    expect(workflow).toContain('ACTUAL_ARCHS=$(lipo -archs "$APP_BIN")');
    expect(workflow).toContain(
      'codesign --verify --deep --strict --verbose=2 "$app_path"',
    );
    expect(workflow).toContain('xcrun stapler validate "$app_path"');
    expect(workflow).toContain(
      'spctl_out=$(spctl --assess --verbose --type exec "$app_path" 2>&1)',
    );
    expect(workflow).toContain('grep -q "source=Notarized Developer ID"');
    expect(workflow).toContain('validate_macos_app "$APP_PATH"');
    expect(workflow).toContain('validate_macos_app "$DMG_APP_PATH"');
  });
});
