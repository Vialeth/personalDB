#!/bin/bash

# Proje klasöründeki gereksiz dosyaları hariç tutarak bir arşiv oluşturur
echo "📦 Proje paketleniyor..."

# Dosya ismine tarih ekleyelim
FILENAME="personalDb_deploy_$(date +%F).tar.gz"

tar -czvf $FILENAME \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='*.tar.gz' \
    .

echo ""
echo "✅ Paket oluşturuldu: $FILENAME"
echo "---------------------------------------------------"
echo "Raspberry Pi'ye göndermek için şu komutu kullanabilirsiniz:"
echo "scp $FILENAME kullanici_adi@raspberry_pi_ip_adresi:~/"
echo "---------------------------------------------------"
