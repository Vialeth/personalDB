# Arkadaşın İçin Kurulum Rehberi

Bu sistem, herkesin kendi kişisel film/kitap arşivini tutması için tasarlanmıştır. Arkadaşın da bu sistemi kullanmak istiyorsa aşağıdaki adımları takip etmesi yeterlidir.

## 1. Ön Hazırlık

Bilgisayarında şunların yüklü olması gerekir:
- **Node.js**: (LTS sürümü önerilir - v20 veya v22) - [İndir](https://nodejs.org/)
  *(Uyarı: v24 veya "Current" sürümünü kurmayın, bazı Windows bilgisayarlarda hata verebilir. "LTS" olanı indirin.)*
- **Git**: (Kodları çekmek için) - [İndir](https://git-scm.com/)

## 2. Projeyi Klonla (İndir)

Arkadaşın terminali (komut satırını) açıp, senin GitHub reposunu kendi bilgisayarına çekmeli:

```bash
git clone https://github.com/SENIN_KULLANICI_ADIN/REPO_ADI.git
cd REPO_ADI
```

*(Not: Senin GitHub reponun linkini buraya yazmalısın)*

## 3. Kurulumu Yap

Proje klasörünün içindeyken şu komutu çalıştırarak gerekli kütüphaneleri yükle ve veritabanını oluştur:

**Mac / Linux / Raspberry Pi:**
```bash
chmod +x install.sh
./install.sh
```

**Windows:**
```bash
npm install
npm run setup
```

Bu işlem bittiğinde `database/` klasörü içinde boş bir veritabanı oluşacaktır.

## 4. Uygulamayı Başlat

```bash
npm start
```
Tarayıcıda `http://localhost:3001` adresine giderek kullanmaya başlayabilir.

---

## 5. Güncellemeleri Almak

Sen yeni özellikler eklediğinde (örneğin "Oyuncu Detayları"), arkadaşının da bu özellikleri alması için sadece şu komutu çalıştırması yeterlidir:

**Mac / Linux / Raspberry Pi:**
```bash
chmod +x update_local.sh
./update_local.sh
```

**Windows:**
```bash
npm run update
```

Bu komut:
1.  Senin yazdığın yeni kodları (`git pull`) çeker.
2.  Gerekli yeni paketleri yükler (`npm install`).
3.  Veritabanı yapısını günceller (`npm run setup`).

**ÖNEMLİ:** Arkadaşının veritabanı (`database/*.db`) ve yüklediği resimler (`public/uploads`) **HİÇBİR ZAMAN SİLİNMEZ** veya senin verilerinle karışmaz. Herkesin verisi kendi bilgisayarında kalır.

---

## 6. Gelişmiş Ayarlar (İsteğe Bağlı)
Eğer TMDB (Film verisi çekme) için kendi özel API anahtarını kullanmak isterse, `apps/films/index.js` dosyasındaki `TMDB_API_KEY` kısmını değiştirebilir. Ancak başlangıç için mevcut anahtarı kullanabilir.
