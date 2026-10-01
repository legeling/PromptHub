# PromptHub 发布版构建脚本
# 用法：直接双击 build-release.cmd（推荐），或终端执行：
#   powershell -ExecutionPolicy Bypass -File .\build-release.ps1
#   pwsh -File .\build-release.ps1
# 流程：自检 NSIS 工具缓存 -> vite 构建 -> electron-builder 打 Windows x64 包
#       -> 瞬断自动重试 -> 复制到 .\发布版\<实际版本号>\
# 注意：本文件必须保存为 UTF-8 with BOM，否则 Windows PowerShell 5.1 无法解析中文

$ErrorActionPreference = 'Stop'

function Pause-IfInteractive {
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        Read-Host '按回车键退出' | Out-Null
    }
}

function Invoke-NsisCacheSelfHeal {
    # NSIS 工具缓存缺关键文件（典型：elevate.exe 被杀毒软件移走）时，
    # electron-builder 不会自动重建缓存、构建必然 ENOENT。
    # 处置：把残破版本目录改名移走（不删除，可回滚），触发下次构建重新下载。
    $cacheRoot = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\nsis'
    if (-not (Test-Path $cacheRoot)) { return $false }

    $badDirs = @(
        Get-ChildItem $cacheRoot -Directory |
            Where-Object { $_.Name -like 'nsis-*' -and $_.Name -notlike 'nsis-resources-*' -and $_.Name -notlike '*.broken-*' } |
            Where-Object { -not (Test-Path (Join-Path $_.FullName 'elevate.exe')) }
    )
    foreach ($dir in $badDirs) {
        $stamp = Get-Date -Format 'yyyyMMddHHmmss'
        $movedName = $dir.FullName + ".broken-$stamp"
        Move-Item $dir.FullName $movedName -Force
        Write-Host ("==> 自检：NSIS 缓存 " + $dir.Name + " 缺少 elevate.exe，已移走待重建（备份名 " + $movedName + '）') -ForegroundColor Yellow
    }
    return ($badDirs.Count -gt 0)
}

try {
    Set-Location $PSScriptRoot

    # 1) 读取实际版本号（以 package.json 为准）
    $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
    Write-Host "==> 构建发布版 v$version" -ForegroundColor Cyan

    # 2) 前置工具检查
    foreach ($cmd in 'node', 'npx', 'pnpm') {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            throw "缺少命令 $cmd ，请确认已安装 Node.js / pnpm 并加入 PATH"
        }
    }

    # 3) 国内镜像源（Electron 与 builder 二进制）
    $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

    # 4) NSIS 缓存自检 + 构建 + 打包（瞬断自动重试一次）
    Invoke-NsisCacheSelfHeal | Out-Null

    $builderArgs = @(
        'electron-builder',
        '--config', 'electron-builder.config.cjs',
        '--config.win.signAndEditExecutable=false',
        '--win', '--x64', '--publish', 'never'
    )

    Push-Location apps/desktop
    try {
        npx vite build
        if ($LASTEXITCODE -ne 0) { throw "vite build 失败（退出码 $LASTEXITCODE）" }

        npx $builderArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Host '==> 首次打包失败，执行缓存自检后重试一次...' -ForegroundColor Yellow
            Invoke-NsisCacheSelfHeal | Out-Null
            npx $builderArgs
            if ($LASTEXITCODE -ne 0) {
                throw "electron-builder 打包失败（退出码 $LASTEXITCODE，已自动重试一次）"
            }
        }
    }
    finally {
        Pop-Location
    }

    # 5) 交付到 .\发布版\<版本号>\
    $outDir = Join-Path $PSScriptRoot "发布版\$version"
    New-Item -ItemType Directory -Force $outDir | Out-Null
    Get-ChildItem apps/desktop/dist -File |
        Where-Object { $_.Name -like "PromptHub-Setup-$version*" } |
        ForEach-Object { Copy-Item $_.FullName -Destination $outDir -Force }

    Write-Host "==> 完成，产物已放入：$outDir" -ForegroundColor Green
    Get-ChildItem $outDir | ForEach-Object { "    {0,8:N1} MB  {1}" -f ($_.Length / 1MB), $_.Name }
}
catch {
    Write-Host ('==> 构建失败：' + $_.Exception.Message) -ForegroundColor Red
    if ($_.Exception.Message -match 'elevate\.exe|electron-builder\\Cache') {
        Write-Host '   本脚本已自带 NSIS 缓存自愈仍未恢复时，请手动清理缓存目录后重跑：' -ForegroundColor Yellow
        Write-Host ("   rd /s /q `"$env:LOCALAPPDATA\electron-builder\Cache\nsis`"") -ForegroundColor Yellow
        Write-Host '   并把 %LOCALAPPDATA%\electron-builder 加入 Windows 安全中心排除项（根治隔离问题）。' -ForegroundColor Yellow
    }
    if ($_.InvocationInfo.PositionMessage) {
        Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkGray
    }
    exit 1
}
finally {
    Pause-IfInteractive
}
