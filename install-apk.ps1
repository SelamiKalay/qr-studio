<#
  install-apk.ps1 - QR-Studio.apk dosyasini USB ile bagli telefona kurar.

  Kullanim:
      powershell -ExecutionPolicy Bypass -File install-apk.ps1
      powershell -ExecutionPolicy Bypass -File install-apk.ps1 -Launch   # kur ve ac
      powershell -ExecutionPolicy Bypass -File install-apk.ps1 -Logs     # kur, ac ve loglari izle

  Telefonda once:
    Ayarlar > Telefon hakkinda > Yapi numarasina 7 kez dokun (Gelistirici secenekleri acilir)
    Ayarlar > Gelistirici secenekleri > USB hata ayiklama = ACIK
    Kabloyu takin, telefonda cikan "USB hata ayiklamaya izin ver" uyarisini onaylayin.
#>

param(
    [switch]$Launch,
    [switch]$Logs,
    [string]$Sdk = $env:ANDROID_HOME
)

$root = $PSScriptRoot
$apk = Join-Path $root 'QR-Studio.apk'
$adb = Join-Path $Sdk 'platform-tools\adb.exe'
$pkg = 'com.qrstudio.app'

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "HATA: $m" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $apk)) { Fail "QR-Studio.apk bulunamadi. Once build-apk.ps1 calistirin." }
if (-not (Test-Path $adb)) { Fail "adb bulunamadi: $adb" }

function Adb {
    param([string[]]$Arguments, [switch]$Quiet)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    if ($Quiet) { $out = & $adb @Arguments 2>&1 | Out-String } else { $out = & $adb @Arguments 2>&1 | Out-String; Write-Host $out.Trim() }
    $script:AdbExit = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return $out
}

# ---------------------------------------------------------------- cihaz
Step 'Cihaz araniyor'
Adb @('start-server') -Quiet | Out-Null
$devices = (Adb @('devices') -Quiet) -split "`r?`n" |
    Where-Object { $_ -match "`t" } |
    ForEach-Object { $_.Trim() }

if (-not $devices) {
    Write-Host ''
    Write-Host 'Bagli cihaz yok.' -ForegroundColor Yellow
    Write-Host 'Kontrol listesi:'
    Write-Host '  1) USB kablosu takili mi (sadece sarj kablosu degil, veri kablosu olmali)'
    Write-Host '  2) Ayarlar > Gelistirici secenekleri > USB hata ayiklama ACIK mi'
    Write-Host '  3) Telefon ekranindaki "USB hata ayiklamaya izin ver" uyarisini onayladiniz mi'
    Write-Host '  4) USB baglanti modu "Dosya aktarimi (MTP)" olarak secili mi'
    exit 1
}

$unauthorized = $devices | Where-Object { $_ -match 'unauthorized' }
if ($unauthorized) {
    Fail 'Cihaz yetkilendirilmemis. Telefon ekranindaki "USB hata ayiklamaya izin ver" penceresini onaylayin.'
}

Step 'Cihaz bilgileri'
$model   = (Adb @('shell', 'getprop', 'ro.product.model') -Quiet).Trim()
$brand   = (Adb @('shell', 'getprop', 'ro.product.brand') -Quiet).Trim()
$release = (Adb @('shell', 'getprop', 'ro.build.version.release') -Quiet).Trim()
$api     = (Adb @('shell', 'getprop', 'ro.build.version.sdk') -Quiet).Trim()
$abi     = (Adb @('shell', 'getprop', 'ro.product.cpu.abi') -Quiet).Trim()

Write-Host "    cihaz    : $brand $model"
Write-Host "    Android  : $release (API $api)"
Write-Host "    mimari   : $abi"

if ([int]$api -lt 24) {
    Fail "Uygulama Android 7.0 (API 24) ve uzerini gerektiriyor; cihaz API $api."
}

# WebView surumu - arayuzun modern CSS ozellikleri buna bagli
$wv = (Adb @('shell', 'dumpsys', 'package', 'com.google.android.webview') -Quiet) |
    Select-String -Pattern 'versionName=([\d.]+)' | Select-Object -First 1
if (-not $wv) {
    $wv = (Adb @('shell', 'dumpsys', 'package', 'com.android.webview') -Quiet) |
        Select-String -Pattern 'versionName=([\d.]+)' | Select-Object -First 1
}
if (-not $wv) {
    $wv = (Adb @('shell', 'dumpsys', 'package', 'com.google.android.trichromelibrary') -Quiet) |
        Select-String -Pattern 'versionName=([\d.]+)' | Select-Object -First 1
}
if ($wv) {
    $wvVer = $wv.Matches[0].Groups[1].Value
    Write-Host "    WebView  : $wvVer"
    $major = [int]($wvVer -split '\.')[0]
    if ($major -lt 111) {
        Write-Host "    NOT: WebView $major surumu color-mix() desteklemiyor olabilir;" -ForegroundColor Yellow
        Write-Host "         arayuz calisir ama bazi renk tonlari duz gorunur." -ForegroundColor Yellow
    }
} else {
    Write-Host "    WebView  : surum okunamadi"
}

# ---------------------------------------------------------------- kurulum
Step 'APK kuruluyor'
$result = Adb @('install', '-r', $apk) -Quiet
Write-Host $result.Trim()

if ($result -notmatch 'Success') {
    if ($result -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') {
        Write-Host ''
        Write-Host 'Ayni paket adiyla farkli imzali bir surum kurulu.' -ForegroundColor Yellow
        Write-Host 'Kaldirip tekrar denemek icin:' -ForegroundColor Yellow
        Write-Host "  adb uninstall $pkg"
    }
    Fail 'Kurulum basarisiz.'
}

Write-Host 'Kuruldu.' -ForegroundColor Green

if ($Launch -or $Logs) {
    Step 'Uygulama aciliyor'
    Adb @('shell', 'monkey', '-p', $pkg, '-c', 'android.intent.category.LAUNCHER', '1') -Quiet | Out-Null
}

if ($Logs) {
    Step 'Loglar izleniyor (Ctrl+C ile cikin)'
    Adb @('logcat', '-c') -Quiet | Out-Null
    & $adb logcat -v brief chromium:* AndroidRuntime:E QRStudio:* *:S
}
