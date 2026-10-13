import type { CoreMcpLibraryService } from "../mcp-library";
import { requirePositional, ensureNoUnknownOptions, takeOption } from "./args";
import { emitSuccess } from "./io";
import { CliError, EXIT_CODES, type CliContext } from "./types";

function number(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new CliError("USAGE_ERROR", `Invalid ${label}`, EXIT_CODES.USAGE);
  return Number(value);
}
export function handleMcpVersionCommand(
  args: string[],
  context: CliContext,
  service: CoreMcpLibraryService,
): void {
  const action = requirePositional(args, 0, "version action"),
    id = requirePositional(args, 1, "server id or name");
  const options = args.slice(2);
  if (action === "list") {
    const offset = takeOption(options, "--offset"),
      limit = takeOption(options, "--limit");
    ensureNoUnknownOptions(options);
    emitSuccess(
      context,
      service.listVersions(id, {
        offset: offset === undefined ? undefined : number(offset, "offset"),
        limit: limit === undefined ? undefined : number(limit, "limit"),
      }),
    );
    return;
  }
  const note = takeOption(options, "--note");
  if (action === "create") {
    ensureNoUnknownOptions(options);
    emitSuccess(context, service.createVersion(id, note));
    return;
  }
  const version = number(
    requirePositional(options, 0, "version number"),
    "version",
  );
  const rest = options.slice(1);
  if (action === "diff") {
    const to = number(requirePositional(rest, 0, "to version"), "to version");
    ensureNoUnknownOptions(rest.slice(1));
    if (note !== undefined)
      throw new CliError(
        "USAGE_ERROR",
        "--note is only supported for create/note",
        EXIT_CODES.USAGE,
      );
    emitSuccess(context, service.compareVersions(id, version, to));
    return;
  }
  ensureNoUnknownOptions(rest);
  if (action === "note") {
    if (note === undefined)
      throw new CliError(
        "USAGE_ERROR",
        "version note requires --note",
        EXIT_CODES.USAGE,
      );
    emitSuccess(context, service.updateVersionNote(id, version, note));
    return;
  }
  if (note !== undefined)
    throw new CliError(
      "USAGE_ERROR",
      "--note is only supported for create/note",
      EXIT_CODES.USAGE,
    );
  if (action === "get") {
    emitSuccess(context, service.getVersion(id, version));
    return;
  }
  if (action === "restore") {
    emitSuccess(context, service.restoreVersion(id, version));
    return;
  }
  if (action === "delete") {
    service.deleteVersion(id, version);
    emitSuccess(context, { deleted: true, version });
    return;
  }
  throw new CliError(
    "USAGE_ERROR",
    "Unknown MCP version action",
    EXIT_CODES.USAGE,
  );
}
