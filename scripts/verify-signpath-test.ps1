param(
    [Parameter(Mandatory)][string]$UnsignedDirectory,
    [Parameter(Mandatory)][string]$SignedDirectory
)

$ErrorActionPreference = 'Stop'
$unsignedFiles = @(Get-ChildItem -LiteralPath $UnsignedDirectory -Filter 'PromptHub-Setup-*-x64.exe' -File)
$signedFiles = @(Get-ChildItem -LiteralPath $SignedDirectory -Filter 'PromptHub-Setup-*-x64.exe' -File)
if ($unsignedFiles.Count -ne 1 -or $signedFiles.Count -ne 1) {
    throw 'Expected exactly one unsigned and one test-signed Windows x64 installer.'
}
$unsigned = $unsignedFiles[0]
$signed = $signedFiles[0]
if ($unsigned.Name -ne $signed.Name) {
    throw 'The signed installer filename does not match the submitted installer.'
}
if ((Get-AuthenticodeSignature -LiteralPath $unsigned.FullName).Status -ne 'NotSigned') {
    throw 'The input installer must be unsigned for this signing test.'
}
if ((Get-FileHash -LiteralPath $unsigned.FullName).Hash -eq (Get-FileHash -LiteralPath $signed.FullName).Hash) {
    throw 'SignPath returned an unchanged installer.'
}
$signature = Get-AuthenticodeSignature -LiteralPath $signed.FullName
$certificate = $signature.SignerCertificate
if ($null -eq $certificate -or $certificate.Subject -ne $certificate.Issuer) {
    throw 'Expected a self-signed SignPath test certificate.'
}

# Test certificates are not publicly trusted. Trust this returned certificate only
# in the disposable runner's current-user store, then require Windows digest validation.
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new('Root', 'CurrentUser')
$added = $false
try {
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $existing = $store.Certificates.Find('FindByThumbprint', $certificate.Thumbprint, $false)
    if ($existing.Count -eq 0) {
        $store.Add($certificate)
        $added = $true
    }
    $verified = Get-AuthenticodeSignature -LiteralPath $signed.FullName
    if ($verified.Status -ne 'Valid') {
        throw "Windows signature verification failed: $($verified.Status): $($verified.StatusMessage)"
    }
    if ($null -eq $verified.TimeStamperCertificate) {
        throw 'The test signature has no timestamp.'
    }
    $hash = (Get-FileHash -LiteralPath $signed.FullName -Algorithm SHA256).Hash
    @"
## Windows test signature
- File: $($signed.Name)
- Windows verification: $($verified.Status) (temporary test trust)
- Certificate subject: $($certificate.Subject)
- Certificate thumbprint: $($certificate.Thumbprint)
- Timestamp signer: $($verified.TimeStamperCertificate.Subject)
- SHA-256: $hash
"@ | Tee-Object -Variable report | Write-Output
    if ($env:GITHUB_STEP_SUMMARY) {
        $report | Out-File -LiteralPath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
}
finally {
    if ($added) { $store.Remove($certificate) }
    $store.Close()
}
