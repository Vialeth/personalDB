# 🚀 Raspberry Pi Deployment - LLM Agent Başlangıç Promptu

Yeni bir Node.js/Express tabanlı web projesi geliştiriyorum ve bunu **Raspberry Pi sunucuma** deploy etmek istiyorum. Aşağıdaki altyapıyı ve standartları kullanıyorum:

---

## 🏗️ Altyapı Bilgileri

### Sunucu Ortamı
- **Platform:** Raspberry Pi (ARM64 Linux)
- **Network:** Tailscale VPN üzerinden erişilebilir (`raspberrypi` veya yerel IP)
- **Process Manager:** PM2 (kalıcı hale getirme için)
- **Node.js Version:** v22+
- **Package Manager:** npm

### Deployment Stratejisi
1. **Geliştirme:** Kendi bilgisayarımda (Linux/Ubuntu)
2. **Versiyon Kontrolü:** GitHub üzerinde
3. **Transfer:** `rsync` veya özel deployment scripti ile
4. **Güncellemeler:** Hızlı ve otomatize edilmiş

---

## 📋 Standart Proje Yapısı

```
my-project/
├── server.js              # Ana giriş noktası (Express sunucusu)
├── package.json           # npm bağımlılıkları
├── database/              # SQLite veritabanı (*.db dosyaları)
├── public/                # Statik dosyalar (CSS, JS, uploads)
├── apps/                  # Uygulama modülleri (route'lar)
├── .gitignore             # Git hariç tutma listesi
├── update_pi.sh           # Raspberry Pi güncelleme scripti
├── backup.sh              # Otomatik yedekleme scripti
└── DEPLOYMENT.md          # Deployment talimatları
```

---

## ⚙️ Temel Gereksinimler

### 1. Port Yapılandırması
- **Yerel Geliştirme:** `3000` veya benzeri
- **Production (Pi):** `3001` (veya başka bir boş port)
- Port充突şmalarından kaçınmak için her proje farklı port kullanmalı

### 2. Veritabanı
- **Tercih Edilen:** SQLite (basit, dosya tabanlı)
- **Konum:** `./database/*.db`
- **Önemli:** Deployment sırasında veritabanı dosyaları **üzerine yazılmamalı** (rsync exclude)

### 3. Deployment Scripti (`update_pi.sh`)
Projeye şu özelliklerde bir script eklenmeli:

```bash
#!/bin/bash
# Kullanım: ./update_pi.sh <kullanici> <ip_veya_hostname>
# Örnek: ./update_pi.sh user raspberrypi

# rsync ile dosyaları eşitle (node_modules, database, .git hariç)
rsync -avz --exclude 'node_modules' --exclude '.git' \
  --exclude 'database/*.db' --exclude 'brain' ./ "$PI_USER@$PI_HOST:~/proje-adi/"

# Uzaktan komutları çalıştır
ssh "$PI_USER@$PI_HOST" "cd ~/proje-adi && npm install --production && pm2 restart proje-adi"
```

### 4. PM2 ile Kalıcı Hale Getirme
İlk kurulumda Raspberry Pi'de:
```bash
cd ~/proje-adi
pm2 start server.js --name "proje-adi"
pm2 save
pm2 startup  # (çıkan komutu çalıştır)
```

### 5. Otomatik Yedekleme
`backup.sh` scripti ile:
- Günlük cron job (örn. her gece 03:00)
- Yerel yedeğe ek olarak Google Drive (rclone)
- Son 7 yedek saklanır

---

## 🎯 Beklentilerim

Lütfen şu şekilde ilerle:

1. **Proje Kurulumu:**
   - Express.js tabanlı temel sunucu yapısı
   - SQLite veritabanı entegrasyonu (basit bir tablo)
   - Statik dosya servisi (public klasörü)

2. **Deployment Altyapısı:**
   - `.gitignore` hazırla (node_modules, database, .env, vb.)
   - `update_pi.sh` deployment scripti yaz
   - `backup.sh` yedekleme scripti yaz (rclone desteğiyle)
   - `DEPLOYMENT.md` detaylı kurulum rehberi

3. **Production Best Practices:**
   - Ortam değişkenleri için `.env` desteği
   - Hata yakalama ve logging
   - Güvenli port yönetimi
   - Veritabanı migration/seed sistemi

4. **Dokümantasyon:**
   - README.md (proje tanıtımı)
   - DEPLOYMENT.md (kurulum adımları)
   - İlk kez kuran biri için anlaşılır talimatlar

---

## 🔧 Örnek Komut Akışı

**İlk Kurulum (Raspberry Pi):**
```bash
# 1. Dosyaları gönder
./update_pi.sh user raspberrypi

# 2. Pi'ye bağlan
ssh user@raspberrypi

# 3. Klasöre gir ve başlat
cd ~/proje-adi
npm install
node server.js  # Test için

# 4. PM2 ile kalıcı hale getir
pm2 start server.js --name "proje-adi"
pm2 save
pm2 startup
```

**Güncellemeler:**
```bash
./update_pi.sh user raspberrypi
# (Script otomatik olarak npm install ve pm2 restart yapar)
```

---

## 📌 Önemli Notlar

- **Veritabanı Koruması:** `update_pi.sh` database klasörünü `--exclude` ile korumalı
- **Çevre Değişkenleri:** Hassas bilgiler `.env` dosyasında olmalı (git'e eklenmemeli)
- **Port充突şması:** Mevcut projeler 3001 kullanıyor, yeni proje farklı port almalı
- **Tailscale Bağlantısı:** Bazen paket kaybı olabiliyor, yerel IP tercih edilebilir
- **Rclone Kurulumu:** İlk kullanımda `rclone config` ile `gdrive` remote'u tanımlanmalı

---

Yukarıdaki standartlara uygun, production-ready bir proje yapısı oluşturmanı bekliyorum. Her adımda açıklayıcı ol ve deployment sürecini mümkün olduğunca otomatikleştir.
