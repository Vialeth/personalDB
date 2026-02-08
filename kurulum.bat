@echo off
echo ==========================================
echo   PERSONAL DB - KURULUM BASLIYOR
echo ==========================================
echo.
echo 1. Paketler Yukleniyor...
call npm install
if %errorlevel% neq 0 (
    echo HATA: Paket yuklenemedi. Node.js yuklu mu?
    pause
    exit /b %errorlevel%
)

echo.
echo 2. Veritabani Olusturuluyor...
call npm run setup
if %errorlevel% neq 0 (
    echo HATA: Veritabani olusturulamadi.
    pause
    exit /b %errorlevel%
)

echo.
echo KURULUM TAMAMLANDI!
echo Artik 'baslat.bat' dosyasina tiklayarak uygulamayi acabilirsiniz.
pause
