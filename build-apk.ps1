<#
  build-apk.ps1 - QR Studio Android APK derleyicisi

  Gradle, Android Studio veya npm kullanmaz; dogrudan Android SDK
  build-tools araclarini (aapt2 / d8 / zipalign / apksigner) cagirir.

  Kullanim:
      powershell -ExecutionPolicy Bypass -File build-apk.ps1
      powershell -ExecutionPolicy Bypass -File build-apk.ps1 -Install

  Not: aapt2 Windows'ta ASCII disi yollari acamadigi icin derleme
  gecici bir ASCII calisma klasorunde yapilir; APK proje koklerine kopyalanir.
#>

param(
    [switch]$Install,
    [string]$Sdk = $env:ANDROID_HOME,
    [string]$Jdk = $env:JAVA_HOME,
    [int]$MinSdk = 24,
    [int]$TargetSdk = 34,
    [string]$VersionName = '1.0',
    [int]$VersionCode = 1
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$android = Join-Path $root 'android'

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "HATA: $msg" -ForegroundColor Red; exit 1 }

<#
  Native arac calistirici.
  PowerShell 5.1'de bir exe stderr'e yazdiginda $ErrorActionPreference='Stop'
  altinda NativeCommandError firlatilir - araclarin cogu uyarilari stderr'e
  yazdigi icin cikis kodunu kendimiz kontrol ediyoruz.
#>
function Run {
    param(
        [Parameter(Mandatory)][string]$Exe,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$ErrorMessage,
        [switch]$Quiet
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    if ($Quiet) { & $Exe @Arguments | Out-Null } else { & $Exe @Arguments }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { Fail "$ErrorMessage (cikis kodu $code)" }
}

# ---------------------------------------------------------------- ortam
if (-not $Sdk) { Fail 'ANDROID_HOME tanimli degil.' }
if (-not $Jdk) { Fail 'JAVA_HOME tanimli degil.' }

$btDir = Join-Path $Sdk 'build-tools'
if (-not (Test-Path $btDir)) { Fail "build-tools bulunamadi: $btDir" }
$bt = (Get-ChildItem $btDir -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName

$platform = Join-Path $Sdk "platforms\android-$TargetSdk\android.jar"
if (-not (Test-Path $platform)) {
    $newest = Get-ChildItem (Join-Path $Sdk 'platforms') -Directory | Sort-Object Name -Descending | Select-Object -First 1
    $platform = Join-Path $newest.FullName 'android.jar'
}
if (-not (Test-Path $platform)) { Fail 'android.jar bulunamadi.' }

$aapt2     = Join-Path $bt 'aapt2.exe'
$aapt      = Join-Path $bt 'aapt.exe'
$d8        = Join-Path $bt 'd8.bat'
$zipalign  = Join-Path $bt 'zipalign.exe'
$apksigner = Join-Path $bt 'apksigner.bat'
$javac     = Join-Path $Jdk 'bin\javac.exe'
$keytool   = Join-Path $Jdk 'bin\keytool.exe'

foreach ($t in @($aapt2, $aapt, $d8, $zipalign, $apksigner, $javac, $keytool)) {
    if (-not (Test-Path $t)) { Fail "Arac bulunamadi: $t" }
}

$env:JAVA_HOME = $Jdk
$env:PATH = "$Jdk\bin;$env:PATH"

Write-Host ''
Write-Host "build-tools : $(Split-Path $bt -Leaf)"
Write-Host "platform    : $(Split-Path (Split-Path $platform -Parent) -Leaf)"
Write-Host "JDK         : $Jdk"
Write-Host "surum       : $VersionName ($VersionCode), minSdk $MinSdk / targetSdk $TargetSdk"
Write-Host ''

# ---------------------------------------------------------------- calisma klasoru
$work = Join-Path $env:TEMP 'qr-studio-apk'
Step "Calisma klasoru: $work"
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Path $work -Force | Out-Null
New-Item -ItemType Directory -Path "$work\gen" -Force | Out-Null
New-Item -ItemType Directory -Path "$work\classes" -Force | Out-Null
New-Item -ItemType Directory -Path "$work\assets\www" -Force | Out-Null

# ---------------------------------------------------------------- ikonlar
Step 'Ikonlar kontrol ediliyor'
if (-not (Test-Path (Join-Path $android 'res\mipmap-xxxhdpi\ic_launcher.png'))) {
    Write-Host '    eksik, uretiliyor...'
    Run 'node' @((Join-Path $root 'tools\make-icons.js')) 'Ikon uretimi basarisiz.'
} else {
    Write-Host '    mevcut'
}

# ---------------------------------------------------------------- kopyalama
Step 'Proje dosyalari calisma klasorune kopyalaniyor'
Copy-Item (Join-Path $android 'AndroidManifest.xml') "$work\AndroidManifest.xml"
Copy-Item (Join-Path $android 'res')  "$work\res"  -Recurse
Copy-Item (Join-Path $android 'java') "$work\java" -Recurse

$www = "$work\assets\www"
Copy-Item (Join-Path $root 'index.html') $www
Copy-Item (Join-Path $root 'css') "$www\css" -Recurse
Copy-Item (Join-Path $root 'js')  "$www\js"  -Recurse

$files = Get-ChildItem $www -Recurse -File
Write-Host ("    web varliklari: {0} dosya, {1:N0} KB" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1KB))

# ---------------------------------------------------------------- kaynaklar
Step 'Kaynaklar derleniyor (aapt2 compile)'
Run $aapt2 @('compile', '--dir', "$work\res", '-o', "$work\res.zip") 'aapt2 compile basarisiz.'

Step 'Kaynaklar baglaniyor (aapt2 link)'
Run $aapt2 @(
    'link',
    '-o', "$work\unsigned.apk",
    '-I', $platform,
    '--manifest', "$work\AndroidManifest.xml",
    '--java', "$work\gen",
    '--min-sdk-version', "$MinSdk",
    '--target-sdk-version', "$TargetSdk",
    '--version-code', "$VersionCode",
    '--version-name', $VersionName,
    "$work\res.zip"
) 'aapt2 link basarisiz.'

# ---------------------------------------------------------------- java -> dex
Step 'Java kaynaklari derleniyor (javac)'
$sources = @()
$sources += (Get-ChildItem "$work\java" -Recurse -Filter *.java).FullName
$sources += (Get-ChildItem "$work\gen"  -Recurse -Filter *.java).FullName
$sources | Set-Content -Path "$work\sources.txt" -Encoding ASCII

Run $javac @(
    '-source', '8', '-target', '8', '-nowarn', '-encoding', 'UTF-8',
    '-classpath', $platform, '-d', "$work\classes", "@$work\sources.txt"
) 'javac basarisiz.'

Step 'DEX uretiliyor (d8)'
(Get-ChildItem "$work\classes" -Recurse -Filter *.class).FullName |
    Set-Content -Path "$work\classes.txt" -Encoding ASCII

Run $d8 @(
    '--release', '--min-api', "$MinSdk", '--lib', $platform,
    '--output', $work, "@$work\classes.txt"
) 'd8 basarisiz.'

# ---------------------------------------------------------------- paketleme
# Not: aapt2'nin -A secenegi Windows'ta varlik yollarini ters boluyle yazar
# (assets/www\css\style.css) ve AssetManager bunlari bulamaz. Bu yuzden
# varliklari ileri boluyle aapt add ile ekliyoruz.
Step 'classes.dex ve web varliklari APK icine ekleniyor'
Push-Location $work
Run $aapt @('add', '-f', 'unsigned.apk', 'classes.dex') 'aapt add (dex) basarisiz.' -Quiet

$assetEntries = Get-ChildItem "$work\assets" -Recurse -File | ForEach-Object {
    $_.FullName.Substring($work.Length + 1).Replace('\', '/')
}
for ($i = 0; $i -lt $assetEntries.Count; $i += 50) {
    $batch = $assetEntries[$i..([Math]::Min($i + 49, $assetEntries.Count - 1))]
    Run $aapt (@('add', '-f', 'unsigned.apk') + $batch) 'aapt add (varliklar) basarisiz.' -Quiet
}
Pop-Location
Write-Host "    $($assetEntries.Count) varlik eklendi"

Step 'Hizalaniyor (zipalign)'
Run $zipalign @('-f', '-p', '4', "$work\unsigned.apk", "$work\aligned.apk") 'zipalign basarisiz.'

# ---------------------------------------------------------------- imzalama
$keystore = "$work\qrstudio.keystore"
$projectKeystore = Join-Path $android 'qrstudio.keystore'
if (Test-Path $projectKeystore) {
    Copy-Item $projectKeystore $keystore
} else {
    Step 'Imza anahtari olusturuluyor (bir kez)'
    Run $keytool @(
        '-genkeypair',
        '-keystore', $keystore, '-alias', 'qrstudio',
        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
        '-storepass', 'qrstudio', '-keypass', 'qrstudio',
        '-dname', 'CN=QR Studio, OU=Local, O=QR Studio, C=TR'
    ) 'keytool basarisiz.' -Quiet
    if (-not (Test-Path $keystore)) { Fail 'Imza anahtari olusturulamadi.' }
    Copy-Item $keystore $projectKeystore
    Write-Host '    kaydedildi: android\qrstudio.keystore (guncellemeler icin saklayin)'
}

Step 'APK imzalaniyor (apksigner)'
Run $apksigner @(
    'sign',
    '--ks', $keystore, '--ks-key-alias', 'qrstudio',
    '--ks-pass', 'pass:qrstudio', '--key-pass', 'pass:qrstudio',
    '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
    '--out', "$work\QR-Studio.apk", "$work\aligned.apk"
) 'apksigner basarisiz.'

Run $apksigner @('verify', "$work\QR-Studio.apk") 'Imza dogrulamasi basarisiz.' -Quiet

$outApk = Join-Path $root 'QR-Studio.apk'
Copy-Item "$work\QR-Studio.apk" $outApk -Force

$size = '{0:N2} MB' -f ((Get-Item $outApk).Length / 1MB)
Write-Host ''
Write-Host "APK HAZIR: $outApk  ($size)" -ForegroundColor Green
Write-Host ''

# ---------------------------------------------------------------- kurulum
if ($Install) {
    $adb = Join-Path $Sdk 'platform-tools\adb.exe'
    Step 'Telefona kuruluyor (adb install)'
    Run $adb @('install', '-r', $outApk) 'Kurulum basarisiz - telefon bagli ve USB hata ayiklama acik mi?'
    Write-Host 'Kuruldu.' -ForegroundColor Green
}
