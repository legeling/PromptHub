param(
  [string]$SourceBranch = "cf-workers-selfhost-sync",
  [string]$TargetBranch = "cloudflare-workers-upstream-contribution",
  [string]$BaseRef = "origin/main",
  [string]$ForkRemote = "fork",
  [string]$CommitMessage = "chore: sync cloudflare upstream contribution",
  [string]$PrivateTermFile = "apps/web-cloudflare/scripts/private-scan-terms.local.txt",
  [string[]]$PrivateTerm = @(),
  [string[]]$AllowedPath = @(
    "apps/web-cloudflare",
    "docs/cloudflare-workers.md",
    "docs/imgs",
    "README.md",
    ".gitignore",
    "packages/shared"
  ),
  [switch]$Apply,
  [switch]$Push,
  [switch]$RunBuild,
  [switch]$SkipTypecheck,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)

  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed."
  }
}

function Get-GitText {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)

  $output = & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed."
  }
  return ($output -join "`n").Trim()
}

function Confirm-Step {
  param(
    [string]$Message,
    [string]$Prompt = "Type SYNC to continue"
  )

  if ($Yes) {
    return
  }

  Write-Host $Message -ForegroundColor Yellow
  $answer = Read-Host $Prompt
  if ($answer -ne "SYNC") {
    throw "Cancelled."
  }
}

function Assert-CleanWorktree {
  $status = Get-GitText "status" "--porcelain"
  if ($status) {
    Write-Host $status
    throw "Working tree is not clean. Commit or stash current work before running this workflow."
  }
}

function Assert-RefExists {
  param([string]$Ref)

  & git rev-parse --verify $Ref *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Git ref '$Ref' does not exist."
  }
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Text
  )

  $resolved = Resolve-Path $Path
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($resolved, $Text, $encoding)
}

function Set-JsoncStringValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $text = Get-Content $Path -Raw
  $pattern = '("' + [regex]::Escape($Key) + '"\s*:\s*")[^"]*(")'
  $escapedValue = $Value.Replace('\', '\\').Replace('"', '\"')
  $replacement = '${1}' + $escapedValue + '${2}'
  $next = [regex]::Replace($text, $pattern, $replacement, 1)

  if ($next -eq $text) {
    throw "Could not update '$Key' in $Path."
  }

  Write-Utf8NoBom -Path $Path -Text $next
}

function Set-PublicCloudflareTemplates {
  Set-JsoncStringValue "apps/web-cloudflare/wrangler.jsonc" "name" "prompthub-worker"
  Set-JsoncStringValue "apps/web-cloudflare/wrangler.jsonc" "database_name" "prompthub_d1"
  Set-JsoncStringValue "apps/web-cloudflare/wrangler.jsonc" "database_id" "replace-with-your-d1-database-id"
  Set-JsoncStringValue "apps/web-cloudflare/wrangler.jsonc" "bucket_name" "prompthub-media"
  Set-JsoncStringValue "apps/web-cloudflare/wrangler.jsonc" "preview_bucket_name" "prompthub-media-preview"

  $adminScript = "apps/web-cloudflare/scripts/register-admin.ps1"
  $adminText = Get-Content $adminScript -Raw
  $adminText = [regex]::Replace($adminText, '\[string\]\$BaseUrl\s*=\s*"[^"]*"', '[string]$BaseUrl = ""', 1)
  $adminText = [regex]::Replace($adminText, '\[string\]\$Username\s*=\s*"[^"]*"', '[string]$Username = "admin"', 1)
  Write-Utf8NoBom -Path $adminScript -Text $adminText
}

function Get-TextFilesForScan {
  $roots = @("README.md", "docs", "apps/web-cloudflare", ".gitignore")
  $textExtensions = @(".css", ".html", ".js", ".json", ".jsonc", ".md", ".mjs", ".ps1", ".ts", ".tsx", ".txt", ".yaml", ".yml")

  foreach ($root in $roots) {
    if (-not (Test-Path $root)) {
      continue
    }

    $item = Get-Item $root
    if (-not $item.PSIsContainer) {
      $item
      continue
    }

    Get-ChildItem $item.FullName -File -Recurse | Where-Object {
      $path = $_.FullName
      if ($path -match '\\node_modules\\|\\dist\\|\\build\\|\\.cache\\|\\.wrangler\\') {
        return $false
      }
      return $textExtensions -contains $_.Extension.ToLowerInvariant()
    }
  }
}

function Get-PrivateScanTerms {
  $terms = New-Object System.Collections.Generic.List[string]

  foreach ($term in $PrivateTerm) {
    if ($term.Trim()) {
      $terms.Add($term.Trim())
    }
  }

  if (Test-Path $PrivateTermFile) {
    Get-Content $PrivateTermFile | ForEach-Object {
      $line = $_.Trim()
      if ($line -and -not $line.StartsWith("#")) {
        $terms.Add($line)
      }
    }
  }

  return $terms | Sort-Object -Unique
}

function Test-NoPrivateCloudflareValues {
  $findings = New-Object System.Collections.Generic.List[string]
  $privateTerms = Get-PrivateScanTerms

  foreach ($file in Get-TextFilesForScan) {
    $relative = Resolve-Path $file.FullName -Relative
    $text = Get-Content $file.FullName -Raw

    foreach ($term in $privateTerms) {
      if ([regex]::IsMatch($text, [regex]::Escape($term), [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        $findings.Add("$relative contains private scan term '$term'")
      }
    }

    if ([regex]::IsMatch($text, 'https://[^<\s"'')]+\.workers\.dev', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      $findings.Add("$relative contains a concrete workers.dev URL")
    }

    if ([regex]::IsMatch($text, '"database_id"\s*:\s*"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      $findings.Add("$relative contains a real-looking D1 database_id")
    }

    if ([regex]::IsMatch($text, '\baccount_id\b\s*[:=]', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      $findings.Add("$relative contains account_id")
    }

    if ([regex]::IsMatch($text, '\b[A-Z]:\\[^`r`n"''<>]+', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      $findings.Add("$relative contains a local absolute Windows path")
    }
  }

  if ($findings.Count -gt 0) {
    $findings | Sort-Object -Unique | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Private Cloudflare values were found. Remove them before pushing or opening an upstream PR."
  }
}

function Invoke-Typecheck {
  if ($SkipTypecheck) {
    Write-Host "Skipping web-cloudflare typecheck." -ForegroundColor Yellow
    return
  }

  & pnpm --filter "@prompthub/web-cloudflare" typecheck
  if ($LASTEXITCODE -ne 0) {
    throw "web-cloudflare typecheck failed."
  }
}

function Invoke-Build {
  if (-not $RunBuild) {
    return
  }

  & pnpm build:web:cf
  if ($LASTEXITCODE -ne 0) {
    throw "Cloudflare web build failed."
  }
}

function Get-AllowedPathArgs {
  $args = @()
  foreach ($path in $AllowedPath) {
    if ($path.Trim()) {
      $args += $path.Trim()
    }
  }
  return $args
}

function Show-SyncPlan {
  $paths = Get-AllowedPathArgs
  $changes = & git diff --name-status "$BaseRef..$SourceBranch" -- @paths
  if ($LASTEXITCODE -ne 0) {
    throw "Could not compute source diff."
  }

  Write-Host "Source branch: $SourceBranch" -ForegroundColor Cyan
  Write-Host "Target branch: $TargetBranch" -ForegroundColor Cyan
  Write-Host "Clean base:    $BaseRef" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Allowed path changes:" -ForegroundColor Cyan
  if ($changes) {
    $changes | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host "(no allowed path changes)"
  }

  $blocked = $changes | Where-Object { $_ -match '^(D|R|C)\s' }
  if ($blocked) {
    Write-Host ""
    $blocked | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Diff contains deletes, renames, or copies. Review these manually before syncing."
  }
}

function Apply-SourceDiffToCleanTarget {
  $paths = Get-AllowedPathArgs
  Confirm-Step "This will recreate '$TargetBranch' from '$BaseRef', apply allowed changes from '$SourceBranch', then reapply public Cloudflare templates. The personal deploy branch will not be modified."

  Invoke-Git "switch" "-C" $TargetBranch $BaseRef

  & git diff --quiet "$BaseRef..$SourceBranch" -- @paths
  $diffExitCode = $LASTEXITCODE
  if ($diffExitCode -eq 1) {
    $patchFile = Join-Path ([System.IO.Path]::GetTempPath()) "prompthub-contribution-$([guid]::NewGuid().ToString('N')).patch"
    try {
      & git diff --binary "--output=$patchFile" "$BaseRef..$SourceBranch" -- @paths
      if ($LASTEXITCODE -ne 0) {
        throw "Could not write source patch."
      }

      Invoke-Git "apply" "--index" "--whitespace=nowarn" $patchFile
    } finally {
      if (Test-Path $patchFile) {
        Remove-Item $patchFile
      }
    }
  } elseif ($diffExitCode -ne 0) {
    throw "Could not check source diff."
  }

  Set-PublicCloudflareTemplates
  Test-NoPrivateCloudflareValues
  Invoke-Typecheck
  Invoke-Build

  $pending = Get-GitText "status" "--porcelain"
  if ($pending) {
    Invoke-Git "add" "README.md" "docs" "apps/web-cloudflare" ".gitignore" "packages/shared"
    Invoke-Git "commit" "-m" $CommitMessage
  } else {
    Write-Host "No contribution-branch changes to commit." -ForegroundColor Yellow
  }
}

$repoRoot = Get-GitText "rev-parse" "--show-toplevel"
Set-Location $repoRoot

Assert-RefExists $BaseRef
Assert-RefExists $SourceBranch
Assert-CleanWorktree

Show-SyncPlan

if (-not $Apply) {
  Write-Host ""
  Write-Host "Plan only. To create the clean contribution branch, run:" -ForegroundColor Cyan
  Write-Host ".\apps\web-cloudflare\scripts\prepare-upstream-contribution.ps1 -Apply"
  exit 0
}

Apply-SourceDiffToCleanTarget

if ($Push) {
  Confirm-Step "Ready to push '$TargetBranch' to remote '$ForkRemote'."
  Invoke-Git "push" "--force-with-lease" $ForkRemote $TargetBranch
} else {
  Write-Host "Next push command:" -ForegroundColor Cyan
  Write-Host "git push --force-with-lease $ForkRemote $TargetBranch"
}

Write-Host "Suggested upstream PR command:" -ForegroundColor Cyan
Write-Host "gh pr create --repo legeling/PromptHub --base main --head <your-github-user>:$TargetBranch --title `"Add Cloudflare Workers self-hosted backend`" --body-file docs/cloudflare-workers.md --draft"
