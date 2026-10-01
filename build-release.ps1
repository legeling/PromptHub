# PromptHub 发布版构建脚本
# 用法：直接双击 build-release.cmd（推荐），或终端执行：
#   powershell -ExecutionPolicy Bypass -File .\build-release.ps1
#   pwsh -File .\build-release.ps1
# 流程：vite 构建 -> electron-builder 打 Windows x64 包 -> 复制到 .\发布版\<实际版本号>\
# 注意：本文件必须保存为 UTF-8 with BOM，否则 Windows PowerShell 5.1 会对中文乱码解析崩溃

$ErrorActionPreference = 'Stop'

function Pause-IfInteractive {
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        Read-Host '按回车键退出' | Out-Null
    }
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

    # 4) 构建与打包
    Push-Location apps/desktop
    try {
        npx vite build
        if ($LASTEXITCODE -ne 0) { throw "vite build 失败（退出码 $LASTEXITCODE）" }

        # 本机无签名证书，跳过 exe 资源编辑（见项目排障记录）
        npx electron-builder --config electron-builder.config.cjs --config.win.signAndEditExecutable=false --win --x64 --publish never
        if ($LASTEXITCODE -ne 0) { throw "electron-builder 打包失败（退出码 $LASTEXITCODE）" }
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
    if ($_.InvocationInfo.PositionMessage) {
        Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkGray
    }
    exit 1
}
finally {
    Pause-IfInteractive
}
