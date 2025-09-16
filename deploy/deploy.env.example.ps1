# Example configuration for FTP/FTPS deploy. Copy to deploy.env.ps1 and fill values.

$FTPHost = "<your-ftp-host>"    # e.g. ftp.example.com
$FTPUser = "<your-ftp-user>"
$FTPPassword = "<your-ftp-password>"
$RemoteDir = "/www/your-site"   # remote root folder
$FTPSsl = $false                  # set $true if your host requires FTPS
$AllowMkdir = $true               # allow creating directories during upload
