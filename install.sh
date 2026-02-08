#!/bin/bash

echo "🚀 Kişisel Veritabanı Kurulum Scripti Başlatılıyor..."

# 1. Node.js Kontrolü
if ! command -v node &> /dev/null
then
    echo "❌ Node.js bulunamadı! Lütfen önce Node.js yükleyin."
    exit 1
fi

# 2. Bağımlılıkları Yükle
echo "📦 Gerekli paketler yükleniyor..."
npm install

# 3. Veritabanını Hazırla
echo "🛠️ Veritabanı oluşturuluyor/güncelleniyor..."
node setup_db.js

# 4. Klasörleri Oluştur
echo "📂 Klasörler kontrol ediliyor..."
mkdir -p public/uploads
mkdir -p database

echo "✅ Kurulum Tamamlandı!"
echo "Uygulamayı başlatmak için şu komutu çalıştırın:"
echo "npm start"
