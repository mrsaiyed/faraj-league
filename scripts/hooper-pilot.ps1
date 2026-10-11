# Hooper pilot, in one command on Windows: Raad vs Noor 10/10, first half.
#
#   $env:HOOPER_API_KEY='hk_prod_...'; irm https://raw.githubusercontent.com/mrsaiyed/faraj-league/claude/charming-dirac-7vtb3f/scripts/hooper-pilot.ps1 | iex
#
# Installs what is missing (Node, ffmpeg, yt-dlp, and Deno, which yt-dlp needs
# to read YouTube), downloads this repo's code into ~\faraj-hooper-pilot, and
# runs scripts/hooper-trial.js on the game: download from YouTube, cut to the
# first half, upload to Hooper with both rosters, wait, and open the report.
#
# It runs on your own computer because YouTube refuses downloads to cloud
# servers. Running it again is safe: the download, the cut, the upload and the
# Hooper session are all reused rather than repeated or paid for twice.
#
# No key lives in this file (it is public). It comes from $env:HOOPER_API_KEY,
# or a .env already in the folder, or it is asked for.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is far slower drawing its progress bar

$Branch = 'claude/charming-dirac-7vtb3f'
$Video = 'https://www.youtube.com/watch?v=nply48ZxIzc'   # Raad vs Noor 10/10
$Keep = '7:20-30:22'                                     # the first half, as YouTube shows it
$Dir = Join-Path $HOME 'faraj-hooper-pilot'

function Update-PathFromRegistry {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Install-IfMissing($command, $wingetId) {
  if (Get-Command $command -ErrorAction SilentlyContinue) { return }
  Write-Host "Installing $wingetId..." -ForegroundColor Cyan
  winget install --id $wingetId --exact --silent --accept-source-agreements --accept-package-agreements | Out-Host
  Update-PathFromRegistry
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is still not found after installing $wingetId. Close this window, open a new PowerShell and run the command again."
  }
}

Install-IfMissing 'node' 'OpenJS.NodeJS.LTS'
Install-IfMissing 'ffmpeg' 'Gyan.FFmpeg'
Install-IfMissing 'yt-dlp' 'yt-dlp.yt-dlp'
Install-IfMissing 'deno' 'DenoLand.Deno'

Write-Host 'Fetching the code...' -ForegroundColor Cyan
New-Item -ItemType Directory -Force $Dir | Out-Null
$zip = Join-Path $Dir '.code.zip'
$unpacked = Join-Path $Dir '.code'
Invoke-WebRequest "https://codeload.github.com/mrsaiyed/faraj-league/zip/refs/heads/$Branch" -OutFile $zip -UseBasicParsing
if (Test-Path $unpacked) { Remove-Item $unpacked -Recurse -Force }
Expand-Archive $zip $unpacked
$source = Get-ChildItem $unpacked -Directory | Select-Object -First 1
# Swap the old code for the new, keeping the key, the packages and earlier
# runs (whose download, cut and Hooper session a re-run picks up). Moved
# rather than copied over the top, which nests folders that already exist.
$keep = @('.env', 'hooper-runs', 'node_modules', '.code', '.code.zip')
Get-ChildItem $Dir -Force | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
Get-ChildItem $source.FullName -Force | Move-Item -Destination $Dir
Remove-Item $unpacked -Recurse -Force
Remove-Item $zip -Force

$envFile = Join-Path $Dir '.env'
$hasKey = (Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^HOOPER_API_KEY=hk_' -Quiet)
if (-not $hasKey) {
  $key = $env:HOOPER_API_KEY
  if (-not $key) {
    $secure = Read-Host 'Paste your Hooper API key (hk_prod_...)' -AsSecureString
    $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  }
  Add-Content -Path $envFile -Value "HOOPER_API_KEY=$($key.Trim())" -Encoding ASCII
}

Push-Location $Dir
try {
  Write-Host 'Installing the script''s packages...' -ForegroundColor Cyan
  # npm.cmd, not npm: PowerShell would otherwise pick npm.ps1, which a locked-down execution policy blocks.
  npm.cmd ci --omit=dev --no-audit --no-fund --loglevel=error | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'npm could not install the packages.' }

  node scripts/hooper-trial.js $Video --keep $Keep --yes
  $exit = $LASTEXITCODE
} finally {
  Pop-Location
}

$report = Get-ChildItem (Join-Path $Dir 'hooper-runs') -Recurse -Filter 'report.html' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($exit -eq 0 -and $report) {
  Write-Host "Opening $($report.FullName)" -ForegroundColor Green
  Start-Process $report.FullName
} elseif ($exit -ne 0) {
  Write-Host 'Stopped before the end (see the message above). Fix that and run the same command again; it picks up where it left off.' -ForegroundColor Yellow
}
