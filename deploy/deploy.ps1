<#
  PowerShell FTP/FTPS деплой статического сайта (пасивный режим)
#>

param(
  [string]$ConfigPath = "./deploy.env.ps1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  Write-Error "Config file not found: $ConfigPath. Create from deploy.env.example.ps1"
}

. $ConfigPath

if (-not ($FTPHost) -or -not ($FTPUser) -or -not ($FTPPassword) -or -not ($RemoteDir)) {
  Write-Error "Missing required vars: FTPHost/FTPUser/FTPPassword/RemoteDir"
}
if (-not (Get-Variable -Name FTPSsl -ErrorAction SilentlyContinue)) { $script:FTPSsl = $false }
if (-not (Get-Variable -Name AllowMkdir -ErrorAction SilentlyContinue)) { $script:AllowMkdir = $true }

function Join-FtpUri {
  param([string]$server,[string]$path)
  $cleanHost = $server.TrimEnd('/')
  $cleanPath = ($path -replace '\\','/').Trim('/')
  return "ftp://$cleanHost/$cleanPath"
}

function Invoke-FtpRequest {
  param(
    [string]$Uri,
    [string]$Method,
    [byte[]]$Content
  )
  $req = [System.Net.FtpWebRequest]::Create($Uri)
  $req.Credentials = New-Object System.Net.NetworkCredential($FTPUser, $FTPPassword)
  $req.Method = $Method
  $req.UseBinary = $true
  $req.UsePassive = $true
  $req.KeepAlive = $false
  if ($FTPSsl) { $req.EnableSsl = $true }

  if ($Content) {
    $req.ContentLength = $Content.Length
    $stream = $req.GetRequestStream()
    try { $stream.Write($Content,0,$Content.Length) }
    finally { $stream.Dispose() }
  }

  try {
    $resp = $req.GetResponse()
    try { return $resp } finally { $resp.Dispose() }
  } catch [System.Net.WebException] {
    throw $_.Exception
  }
}

function New-FtpDirectory {
  param([string]$RemotePath)
  $uri = Join-FtpUri -server $FTPHost -path $RemotePath
  try { Invoke-FtpRequest -Uri $uri -Method ([System.Net.WebRequestMethods+Ftp]::MakeDirectory) | Out-Null } catch {}
}

function Ensure-FtpPath {
  param([string]$RemoteDirPath)
  $parts = ($RemoteDirPath -replace '\\','/').Trim('/').Split('/') | Where-Object { $_ -ne '' }
  $accum = ''
  foreach ($p in $parts) {
    $accum = ($accum + '/' + $p).Trim('/')
    New-FtpDirectory -RemotePath $accum
  }
}

function Send-FtpFile {
  param(
    [string]$LocalPath,
    [string]$RemotePath
  )
  $bytes = [System.IO.File]::ReadAllBytes($LocalPath)
  $uri = Join-FtpUri -server $FTPHost -path $RemotePath
  $null = Invoke-FtpRequest -Uri $uri -Method ([System.Net.WebRequestMethods+Ftp]::UploadFile) -Content $bytes
}

function Get-FilesToUpload {
  param([string]$Root = '.')
  $patterns = @('*.html','*.css','*.js','*.json','*.webp','*.png','*.jpg','*.jpeg','*.svg','*.ico')
  $files = @()
  foreach ($pat in $patterns) { $files += Get-ChildItem -Path $Root -File -Recurse -Filter $pat }
  $files | Where-Object { $_.FullName -notmatch "\\(node_modules|.git)\\" }
}

$workspace = (Resolve-Path '.').Path
Write-Host ('Deploy from: {0}' -f $workspace)

if ($AllowMkdir) { Ensure-FtpPath -RemoteDirPath $RemoteDir }

$files = Get-FilesToUpload -Root $workspace
if (-not $files -or $files.Count -eq 0) { Write-Error 'No files to upload' }

$uploaded = 0
foreach ($f in $files) {
  $baseUri = New-Object System.Uri(($workspace.TrimEnd([IO.Path]::DirectorySeparatorChar)) + [IO.Path]::DirectorySeparatorChar)
  $fileUri = New-Object System.Uri($f.FullName)
  $rel = [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString()) -replace '\\','/'
  $remote = ("$RemoteDir/" + $rel).Trim('/')
  $remoteDir = [System.IO.Path]::GetDirectoryName($remote) -replace '\\','/'
  if ($AllowMkdir -and $remoteDir -and $remoteDir -ne '.') { Ensure-FtpPath -RemoteDirPath $remoteDir }
  Write-Host ("-> " + $rel)
  Send-FtpFile -LocalPath $f.FullName -RemotePath $remote
  $uploaded++
}

Write-Host ('Done. Uploaded files: {0}' -f $uploaded) -ForegroundColor Green


