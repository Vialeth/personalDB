#!/bin/bash

echo "🔄 Güncelleme Kontrol Ediliyor..."

# 1. Kodları Çek
git pull

# 2. Yeni Paket Varsa Yükle
echo "📦 Paketler güncelleniyor..."
npm install

# 3. Veritabanı Şemasını Güncelle (Yeni tablolar vs.)
echo "🛠️ Veritabanı yapısı güncelleniyor..."
node setup_db.js

echo "✅ Güncelleme Tamamlandı!"
echo "Server çalışıyorsa durdurup tekrar 'npm start' yapmanız gerekebilir."
