# ComfyGrid Update Script
# Run from the same directory as comfygrid.exe and version.json

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step([string]$msg) {
    Write-Host $msg -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host $msg -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host $msg -ForegroundColor Yellow
}

function Write-Err([string]$msg) {
    Write-Host $msg -ForegroundColor Red
}

# --- Read current version ---
$versionFile = Join-Path $scriptDir "version.json"
$currentVersion = "unknown"
if (Test-Path $versionFile) {
    try {
        $versionData = Get-Content $versionFile -Raw | ConvertFrom-Json
        $currentVersion = $versionData.tag
    } catch {
        Write-Warn "Could not parse version.json"
    }
}

Write-Host "ComfyGrid Updater"
Write-Host "================="
Write-Host "Current version: $currentVersion"

# --- Fetch latest release from GitHub ---
Write-Step "Checking GitHub for latest release..."
try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/nihedon/ComfyGrid/releases/latest" -TimeoutSec 10
    $latestVersion = $release.tag_name
} catch {
    Write-Err "Failed to reach GitHub: $_"
    exit 1
}

Write-Host "Latest version:  $latestVersion"

if ($currentVersion -eq $latestVersion) {
    Write-Success "Already up to date!"
    exit 0
}

# --- Find zip asset ---
$downloadUrl = $null
foreach ($asset in $release.assets) {
    if ($asset.name -like "*.zip") {
        $downloadUrl = $asset.browser_download_url
        break
    }
}

if (-not $downloadUrl) {
    Write-Err "No zip asset found in the release."
    exit 1
}

Write-Host ""
Write-Host "Update available: " -NoNewline
Write-Host "$currentVersion" -ForegroundColor Yellow -NoNewline
Write-Host " -> " -NoNewline
Write-Host "$latestVersion" -ForegroundColor Green
Write-Host ""

$confirm = Read-Host "Do you want to update? (y/n)"
if ($confirm -notin @("y", "Y")) {
    Write-Host "Update cancelled."
    exit 0
}

# --- Check if comfygrid.exe is running ---
$running = Get-Process -Name "comfygrid" -ErrorAction SilentlyContinue
if ($running) {
    Write-Warn ""
    Write-Warn "ComfyGrid is currently running!"
    $kill = Read-Host "Kill comfygrid.exe and continue? (y/n)"
    if ($kill -in @("y", "Y")) {
        Stop-Process -Name "comfygrid" -Force
        Start-Sleep -Seconds 2
        Write-Step "ComfyGrid stopped."
    } else {
        Write-Host "Update cancelled. Please close ComfyGrid first."
        exit 0
    }
}

# --- Download ---
$tempZip = Join-Path $env:TEMP "ComfyGrid-update.zip"
$tempDir = Join-Path $env:TEMP "ComfyGrid-update"

Write-Step "Downloading $latestVersion..."
$originalProgressPreference = $ProgressPreference
$ProgressPreference = 'SilentlyContinue'
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
    Unblock-File -Path $tempZip
} catch {
    $ProgressPreference = $originalProgressPreference
    Write-Err "Download failed: $_"
    exit 1
}
$ProgressPreference = $originalProgressPreference

# --- Extract ---
Write-Step "Extracting..."
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
try {
    Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force
} catch {
    Write-Err "Extraction failed: $_"
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    exit 1
}

# --- Copy files (skip user data) ---
$userDataDirs = @("config", "custom_nodes", "cache", "logs")

Write-Step "Installing update..."
$sourceItems = Get-ChildItem -Path $tempDir
foreach ($item in $sourceItems) {
    $dest = Join-Path $scriptDir $item.Name
    if ($item.Name -in $userDataDirs) {
        if (Test-Path $dest) {
            Write-Host "  [SKIP] $($item.Name) (user data preserved)"
            continue
        } else {
            Write-Host "  [INIT] $($item.Name) (creating default user data)"
        }
    }
    if ($item.PSIsContainer) {
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
        Copy-Item -Path $item.FullName -Destination $dest -Recurse -Force
    } else {
        Copy-Item -Path $item.FullName -Destination $dest -Force
        Unblock-File -Path $dest
    }
    Write-Host "  [OK]   $($item.Name)"
}

# --- Cleanup ---
Write-Step "Cleaning up..."
Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Success "Update complete! ComfyGrid $latestVersion has been installed."
Write-Host "You can now launch ComfyGrid."
