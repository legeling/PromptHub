$ErrorActionPreference = 'Stop'
if ($env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Native fixture installation requires a disposable GitHub-hosted Windows runner'
}
$nativeRoot = Join-Path $env:RUNNER_TEMP 'prompthub-release-native-codex'
New-Item -ItemType Directory -Path $nativeRoot -ErrorAction Stop | Out-Null
try {
  pnpm --dir $nativeRoot add @openai/codex@0.163.0
  if ($LASTEXITCODE -ne 0) { throw 'Native Codex fixture installation failed' }
  $env:PATH = "$(Join-Path $nativeRoot 'node_modules/.bin');$env:PATH"
  codex --version
  if ($LASTEXITCODE -ne 0) { throw 'Native Codex fixture could not start' }
  $env:PROMPTHUB_NATIVE_AGENT_TESTS = '1'
  pnpm --filter @prompthub/core exec vitest run tests/native-command-process.test.ts tests/codex-plugin-runtime.test.ts tests/codex-plugin-config-path.test.ts tests/codex-plugin-native.test.ts --minWorkers=1 --maxWorkers=1
  if ($LASTEXITCODE -ne 0) { throw 'Native Windows Codex plugin acceptance failed' }
} finally {
  Remove-Item Env:PROMPTHUB_NATIVE_AGENT_TESTS -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $nativeRoot -Recurse -Force -ErrorAction Continue
}
