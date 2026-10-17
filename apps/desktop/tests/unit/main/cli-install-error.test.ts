import { expect, it } from "vitest";
import {
  CliCommandError,
  describeCliInstallFailure,
} from "../../../src/main/services/cli-install-error";

it.each([
  ["EACCES: permission denied", "permission"],
  ["ERR_PNPM_FETCH_404: package not found", "network"],
  ["ETIMEDOUT", "timeout"],
  ["Unexpected install script failure", "failed"],
])("classifies stderr %s and retains diagnostic output", (stderr, code) => {
  expect(
    describeCliInstallFailure(
      new CliCommandError(
        new Error("Command failed"),
        "install output",
        stderr,
      ),
    ),
  ).toMatchObject({ errorCode: code, stdout: "install output", stderr });
});

it("reports killed timeout processes and bounds long diagnostic output", () => {
  const error = Object.assign(new Error("Command failed"), { killed: true });
  const result = describeCliInstallFailure(
    new CliCommandError(error, "x".repeat(10000), "y".repeat(10000)),
  );
  expect(result.errorCode).toBe("timeout");
  expect(result.stdout).toHaveLength(8000);
  expect(result.stderr).toHaveLength(8000);
});
