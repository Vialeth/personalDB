@echo off
echo ==========================================
echo   PERSONAL DB - GUNCELLEME BASLATILIYOR
echo ==========================================
echo.

echo 1. Kodlar Cekiliyor (git pull)...
git pull
if %errorlevel% neq 0 (
    echo HATA: Kodlar cekilemedi. Internet baglantinizi kontrol edin veya degisiklikleri geri alin.
    pause
    exit /b %errorlevel%
)

echo.
echo 2. Paketler Yukleniyor (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo HATA: Paket yuklemesinde sorun olustu.
    pause
    exit /b %errorlevel%
)

echo.
echo 3. Veritabani Guncelleniyor...
call npm run setup
if %errorlevel% neq 0 (
    echo HATA: Veritabani guncellenemedi.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo   GUNCELLEME BASARIYLA TAMAMLANDI! 🚀
echo ==========================================
echo.
echo Pencereyi kapatabilirsiniz.
pause
