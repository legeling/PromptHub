import { beforeAll, describe, expect, it } from "vitest";

import { createTestI18n } from "../../helpers/i18n";
import {
  getSkillSafetyFindingTitle,
  getSkillSafetyLevelLabel,
  getSkillSafetySummary,
} from "../../../src/renderer/components/skill/safety-i18n";
import type { SkillSafetyReport } from "@prompthub/shared/types";

let t: Awaited<ReturnType<typeof createTestI18n>>["t"];
beforeAll(async () => {
  t = (await createTestI18n("zh")).t;
});

describe("skill safety i18n", () => {
  it("renders safe summary in chinese instead of backend english", () => {
    const report: SkillSafetyReport = {
      level: "safe",
      summary: "No obvious malicious patterns were detected across 1 scanned files.",
      findings: [],
      recommendedAction: "allow",
      scannedAt: Date.now(),
      checkedFileCount: 1,
      scanMethod: "ai",
    };

    expect(getSkillSafetySummary(t, report)).toBe(
      "未发现明显恶意模式，共检查 1 个文件。",
    );
    expect(getSkillSafetyLevelLabel(t, report.level)).toBe("安全");
  });

  it("localizes finding titles from codes", () => {
    expect(
      getSkillSafetyFindingTitle(t, {
        code: "shell-pipe-exec",
        severity: "high",
        title: "Detected pipe-to-shell execution",
        detail: "x",
      }),
    ).toBe("检测到远程下载后直接管道执行");
  });
});
