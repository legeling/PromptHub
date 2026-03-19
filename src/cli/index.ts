import { runCli } from "./run";

void runCli(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});
