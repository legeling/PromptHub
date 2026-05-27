param(
  [string]$BaseUrl = "",
  [string]$Username = "admin"
)

$ErrorActionPreference = "Stop"

function Resolve-CaptchaAnswer {
  param(
    [string]$Prompt,
    [string]$ImageData
  )

  if ($Prompt -and $Prompt -match '^\s*(\d+)\s*([+-])\s*(\d+)\s*=\s*\?\s*$') {
    $left = [int]$Matches[1]
    $op = $Matches[2]
    $right = [int]$Matches[3]
    if ($op -eq "+") {
      return [string]($left + $right)
    }
    return [string]($left - $right)
  }

  if ($ImageData -and $ImageData.StartsWith("data:image/svg+xml;base64,")) {
    $encoded = $ImageData.Substring("data:image/svg+xml;base64,".Length)
    $captchaPath = Join-Path ([System.IO.Path]::GetTempPath()) "prompthub-admin-captcha.svg"
    [System.IO.File]::WriteAllBytes($captchaPath, [Convert]::FromBase64String($encoded))
    Write-Host "Open this captcha image and type the characters shown: $captchaPath" -ForegroundColor Yellow
    return (Read-Host "Captcha answer").Trim()
  }

  throw "Captcha response did not include a supported prompt or SVG image."
}

function ConvertFrom-SecureStringToPlainText {
  param([securestring]$SecureString)

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

$normalizedBaseUrl = $BaseUrl.TrimEnd("/")
$passwordSecure = Read-Host "Password for $Username" -AsSecureString
$password = ConvertFrom-SecureStringToPlainText $passwordSecure

if ($password.Length -lt 8) {
  throw "Password must be at least 8 characters."
}

$captcha = Invoke-RestMethod -Method Get -Uri "$normalizedBaseUrl/api/auth/captcha"
$answer = Resolve-CaptchaAnswer -Prompt $captcha.data.prompt -ImageData $captcha.data.imageData

$body = @{
  username = $Username
  password = $password
  captchaId = $captcha.data.captchaId
  captchaAnswer = $answer
} | ConvertTo-Json

$result = Invoke-RestMethod `
  -Method Post `
  -Uri "$normalizedBaseUrl/api/auth/register" `
  -ContentType "application/json" `
  -Body $body

Write-Host "Created PromptHub Cloudflare admin user '$($result.data.user.username)'." -ForegroundColor Green
