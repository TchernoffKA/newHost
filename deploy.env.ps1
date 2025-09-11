# Конфигурация деплоя FTP/FTPS для deploy.ps1

$FTPHost = "ftp.myfit.h1n.ru"   # замените на точный FTP-хост из раздела «Доступ»
$FTPUser = "myfit_deploy"
$FTPPassword = "xtgHSXEWBuMv8IwL"
$RemoteDir = "."                 # корень текущего FTP пользователя (/www/myfit.h1n.ru)
$FTPSsl = $false                 # FTPS отключен из-за сертификата
$AllowMkdir = $false            # не создавать директории на сервере


