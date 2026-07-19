param(
  [string]$PackagePath = 'outputs\Desktop-Sticky-Note_1.0.6.0_x64.msix',
  [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sdkBin = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'
$signTool = Join-Path $sdkBin 'signtool.exe'
$publisher = 'CN=F47FAFC5-B249-47C2-9F9F-3C33FD9E19B4'
$sourcePackage = Join-Path $root $PackagePath
$testPackage = Join-Path $root 'outputs\Desktop-Sticky-Note_1.0.6.0_x64-test-signed.msix'
$certificatePath = Join-Path $root 'outputs\Desktop-Sticky-Note-test-signing.cer'

if (-not (Test-Path $signTool)) {
  throw "Windows SDK signtool.exe was not found: $signTool"
}
if (-not (Test-Path $sourcePackage)) {
  throw "Store submission package was not found: $sourcePackage"
}

$certificate = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Subject -eq $publisher -and $_.HasPrivateKey } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $certificate) {
  $certificate = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $publisher `
    -KeyUsage DigitalSignature `
    -KeyExportPolicy Exportable `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(2) `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')
}

Copy-Item -LiteralPath $sourcePackage -Destination $testPackage -Force
Export-Certificate -Cert $certificate -FilePath $certificatePath -Force | Out-Null
& $signTool sign /fd SHA256 /sha1 $certificate.Thumbprint $testPackage
if ($LASTEXITCODE -ne 0) { throw "signtool sign failed with exit code $LASTEXITCODE" }
if (-not $SkipVerify) {
  & $signTool verify /pa /v $testPackage
  if ($LASTEXITCODE -ne 0) { throw "signtool verify failed with exit code $LASTEXITCODE" }
}

Write-Host "Created local test package: $testPackage"
Write-Host "Created local test certificate: $certificatePath"
