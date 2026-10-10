# QR Kod Oluşturucu — Proje Planı

> Lokalde çalışan, profesyonel görünümlü, logo/şekil özelleştirmeli, PNG+SVG export ve geçmiş kaydı destekleyen QR kod üretici site.

---

## 1. Genel Bakış

**Amaç:** Kullanıcının girdiği metin/URL'den, tamamen özelleştirilebilir (renk, şekil, logo, çerçeve) bir QR kod üreten; bunu PNG ve SVG olarak indirebilen; ürettiği kodları lokalde (tarayıcıda) geçmiş olarak saklayan bir web sitesi.

**Referans alınan siteler (araştırma):** QRCode Monkey, QR Code AI, QRKIT, ME-QR, QRCodeChimp. Bu sitelerden çıkan ortak profesyonel kalıp:
- Sol panelde canlı ayar formu, sağda/ortada büyük canlı önizleme
- Nokta (dot) şekli + köşe (eye) şekli ayrı ayrı özelleştirilebiliyor
- Logo, QR alanının **%30'unu geçmeyecek** şekilde ortaya yerleştiriliyor ve bu durumda hata düzeltme seviyesi otomatik **H (%30)** yapılıyor
- PNG / SVG / PDF üçlüsü standart export seçenekleri
- Şeffaf arka plan, gradient renk, çerçeve (frame) + "Scan Me" yazısı popüler ekstra

Bu planı bu kalıba göre kurguluyoruz ama backend/hesap/analytics gibi kısımları çıkarıp **tamamen lokal, sunucusuz** bir yapı hedefliyoruz.

---

## 2. Teknoloji Stack (Minimal Dependency)

| Katman | Seçim | Neden |
|---|---|---|
| Yapı | Saf HTML + CSS + Vanilla JS | Framework yükü yok, lokalde `python -m http.server` ile anında çalışır |
| QR matris üretimi | Küçük, bağımsız bir QR encoder (ör. `qrcode-generator` — tek dosya, ~15KB, sıfır bağımlılık) | Kendi Reed-Solomon hata düzeltme algoritmasını yazmak yerine hazır, test edilmiş matris üretimini kullanıp; **görselleştirmeyi (rendering), şekilleri, logoyu, export'u tamamen kendimiz kodluyoruz** → "from-scratch" ruhu korunuyor, sadece matematik motoru hazır |
| Render | SVG (native) | Şekiller, gradient, logo overlay SVG ile çok daha temiz; PNG'e çevirmek SVG'den kolay (Canvas ile), tersi zor |
| PNG export | `Canvas` (SVG → `Image` → `canvas.drawImage` → `toDataURL`) | Ekstra kütüphane gerekmez |
| SVG export | Doğrudan oluşturduğumuz SVG string'i `Blob` ile indirilir | Vektörel, sınırsız büyütülebilir, baskı kalitesi |
| Depolama | `localStorage` (ayarlar + son 5-10 kayıt) + `IndexedDB` (tam geçmiş, üretilen görseller) | localStorage basit veri için, IndexedDB görsel/blob saklamak için daha uygun ve boyut limiti çok daha yüksek |
| Sunucu | Yok — statik dosya. `python -m http.server` veya `npx serve` | "Localde çalışacak" isteğiyle birebir uyumlu |

> **Not:** İstersen `qrcode-generator` kütüphanesini de dahil etmeden, QR matrisini (Reed-Solomon dahil) tamamen sıfırdan senin yazmanı sağlayacak şekilde ilerleyebiliriz — bu daha öğretici ama önemli ölçüde daha uzun sürer. Plan bunun için de esnek bırakıldı (bkz. Bölüm 8).

---

## 3. Özellik Listesi (Kapsamlı)

### 3.1 QR İçerik Tipleri
- [ ] Düz metin
- [ ] URL
- [ ] E-posta (mailto:)
- [ ] Telefon (tel:)
- [ ] SMS
- [ ] WiFi (SSID + şifre + şifreleme tipi — otomatik `WIFI:` formatı)
- [ ] vCard (kartvizit — isim, telefon, mail, şirket → taratınca rehbere eklenebilir)
- [ ] Konum (geo:)
- [ ] Sosyal medya linkleri (kısayol şablonları)

### 3.2 Görsel Özelleştirme
- [ ] **Nokta (dot) şekli:** kare, yuvarlak, damla (extra-rounded), elmas, klasik nokta, "classy" (kesik köşe)
- [ ] **Köşe çerçevesi (eye frame) şekli:** kare, yuvarlak, damla — 3 köşe için ayrı ayrı seçilebilir
- [ ] **Köşe içi (eye ball) şekli:** kare, yuvarlak, elmas
- [ ] **Renk:** düz renk (ön plan / arka plan), **gradient** (linear/radial, 2 renk, açı ayarlı)
- [ ] **Şeffaf arka plan** (PNG için alfa kanalı)
- [ ] **Çerçeve (frame):** üstte/altta "Scan Me" yazılı kutu, birkaç hazır frame stili
- [ ] **Boyut, margin (quiet zone), köşe yuvarlama** ince ayarları

### 3.3 Logo Ekleme
- [ ] Dosya yükleme (PNG/JPG/SVG)
- [ ] Otomatik ortalama + boyut sınırlama (QR alanının **max %30'u** — okunabilirlik için)
- [ ] Logo eklenince hata düzeltme seviyesi otomatik **H**'ye yükseltilir (kullanıcı bilgilendirilir)
- [ ] Logo arka planına opsiyonel beyaz/renkli dolgu + köşe yuvarlama
- [ ] Canlı "scan test" uyarısı: kontrast düşükse veya logo çok büyükse kullanıcı uyarılır

### 3.4 Export
- [ ] **PNG** (özel çözünürlük seçimi: 512px / 1024px / 2048px / özel)
- [ ] **SVG** (vektörel, baskı için ideal)
- [ ] (İleri seviye, opsiyonel) **PDF** — SVG'yi PDF'e gömme (basit bir PDF şablonu ile, ekstra kütüphanesiz de yapılabilir)
- [ ] Dosya adı otomatik: içerik özeti + tarih

### 3.5 Depolama / Geçmiş (Lokal)
- [ ] Her üretilen QR, ayarlarıyla birlikte **IndexedDB**'ye kaydedilir (içerik, renkler, şekil, logo, tarih)
- [ ] "Geçmiş" sekmesi: küçük önizlemelerle liste, tıklayınca tekrar düzenlemeye aç
- [ ] Geçmişten silme / tümünü temizleme
- [ ] Favorilere ekleme (opsiyonel etiketleme)
- [ ] Dışa aktarma: geçmişi `.json` olarak yedekleme / geri yükleme

### 3.6 Ekstra "Daha Fazla Eklenecek Varsa" Önerileri
- [ ] **Şablonlar (Presets):** "Instagram", "Kartvizit", "WiFi", "Etkinlik Afişi" gibi hazır renk+şekil kombinasyonları
- [ ] **Toplu üretim (Batch):** `.csv` yükle (satır satır URL/metin) → tek tuşla hepsini üret, `.zip` olarak indir
- [ ] **Anlık tarama testi:** Oluşturulan QR'ı sayfa içinde kamera ile (tarayıcı `getUserMedia`) test etme
- [ ] **Karanlık/Aydınlık mod**
- [ ] **Klavye kısayolları** (Ctrl+S indir, Ctrl+Z son ayarı geri al)
- [ ] **URL ile paylaşım:** Ayarları URL query string'e kodlayıp link paylaşma (aynı cihazda/lokalde kalsa da kullanışlı)
- [ ] **"Rastgele tasarım" butonu:** Şaşırt beni — rastgele şık kombinasyon üretir
- [ ] **Kontrast/okunabilirlik skoru:** Seçilen renklerin taranabilirliğini basit bir algoritmayla puanlama

---

## 4. Site Yapısı (Sayfa/Bölüm)

```
┌─────────────────────────────────────────────────────┐
│  Header: Logo + Başlık + Karanlık Mod Toggle          │
├───────────────┬───────────────────────┬─────────────┤
│  SOL PANEL     │   ORTA — CANLI ÖNİZLEME│  SAĞ PANEL  │
│                │                        │             │
│ • İçerik Tipi  │   [ Büyük QR Preview ] │ • Export    │
│   Sekmeleri    │                        │   (PNG/SVG) │
│ • İçerik Formu │   Anlık güncellenir    │ • Boyut     │
│ • Şekil Ayarı  │                        │   seçimi    │
│ • Renk/Gradient│                        │ • İndir     │
│ • Logo Yükleme │                        │   Butonu    │
│ • Çerçeve      │                        │             │
├───────────────┴───────────────────────┴─────────────┤
│  ALT: Geçmiş (Yatay kaydırılabilir kart listesi)      │
└─────────────────────────────────────────────────────┘
```

- **Tasarım dili:** Modern SaaS görünümü — yumuşak gölgeler, yuvarlak köşeler (12-16px), gradient vurgu rengi, bol boşluk (whitespace), sade sans-serif font (ör. Inter/Poppins — Google Fonts lokal indirilip kullanılabilir, CDN'e bağımlı kalmamak için).
- **Responsive:** Mobilde panel düzeni alt alta sıralanır, önizleme üstte sabit kalır.

---

## 5. Veri Modeli (Geçmiş Kaydı için)

```json
{
  "id": "uuid-v4",
  "createdAt": "2026-09-08T12:30:00Z",
  "contentType": "url",
  "content": "https://example.com",
  "style": {
    "dotShape": "rounded",
    "cornerFrameShape": "extra-rounded",
    "cornerBallShape": "dot",
    "foreground": "#1E293B",
    "background": "#FFFFFF",
    "gradient": { "enabled": false, "type": "linear", "angle": 45, "colors": ["#667eea", "#764ba2"] },
    "transparentBackground": false,
    "margin": 4,
    "errorCorrection": "H"
  },
  "logo": {
    "enabled": true,
    "dataUrl": "base64...",
    "sizeRatio": 0.22,
    "backgroundFill": "#FFFFFF",
    "rounded": true
  },
  "frame": { "enabled": true, "style": "scan-me-bottom", "text": "Beni Tara" },
  "thumbnail": "base64-küçük-önizleme"
}
```

Bu obje IndexedDB'de `qrHistory` adlı bir object store'da tutulur; `localStorage`'da ise sadece "son kullanılan ayarlar" (uygulama açılışında formu doldurmak için) tutulur.

---

## 6. QR Render Pipeline (Nasıl Çalışacak)

1. **Matris üretimi:** İçerik + hata düzeltme seviyesi → QR encoder → 0/1'lerden oluşan kare matris (ör. 25x25, 33x33...)
2. **SVG çizimi:** Matris hücre hücre gezilir:
   - Köşelerdeki 3 tane 7x7 "eye" bloğu ayrı algılanır → seçilen köşe şekli (kare/yuvarlak/damla) ile çizilir
   - Geri kalan veri noktaları seçilen dot shape fonksiyonuna göre `<rect>`, `<circle>` veya özel `<path>` olarak eklenir
   - Renk: düz renk ise `fill="#..."`, gradient ise `<defs><linearGradient>` tanımlanıp referans verilir
3. **Logo overlay:** SVG'nin tam ortasına `<image>` (base64 logo) + altına opsiyonel beyaz `<rect>`/`<circle>` dolgu eklenir; bu alan matristen "boşaltılmaz", sadece üstüne bindirilir (çünkü H seviyesi veri kaybını tolere eder)
4. **Çerçeve:** SVG'nin `viewBox`'ı büyütülüp etrafına metin + şekil eklenir
5. **Önizleme:** Bu SVG doğrudan `innerHTML` ile sayfada gösterilir (anlık, canlı)
6. **PNG export:** SVG string → `Blob` → `Image` nesnesine yükle → `canvas`'a çiz (istenen çözünürlükte) → `canvas.toBlob('image/png')` → indir
7. **SVG export:** SVG string doğrudan `Blob(type: 'image/svg+xml')` olarak indirilir

Bu pipeline'ın tamamı **framework'süz, saf JS** ile yazılabilir; en karmaşık kısım yalnızca matris → şekil dönüşüm fonksiyonlarıdır.

---

## 7. Klasör Yapısı (Öneri)

```
qr-generator/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── qr-encoder.js       # Matris üretimi (Reed-Solomon dahil)
│   ├── qr-renderer.js      # Matris → SVG (şekiller, gradient, logo, frame)
│   ├── qr-export.js        # SVG → PNG/SVG indirme
│   ├── storage.js          # IndexedDB + localStorage yönetimi
│   ├── history-ui.js       # Geçmiş listesi render
│   ├── batch.js            # Toplu üretim (csv → zip)
│   └── app.js              # Form kontrolleri, state yönetimi, olay dinleyiciler
├── assets/
│   └── fonts/              # Lokal font dosyaları (CDN bağımsız)
└── README.md
```

---

## 8. Geliştirme Fazları (Roadmap)

| Faz | Kapsam | Tahmini Süre |
|---|---|---|
| **Faz 1 — Çekirdek** | Metin/URL girişi, temel QR üretimi, düz renk, PNG indirme | 1 gün |
| **Faz 2 — Şekiller & SVG** | Dot/eye şekilleri, SVG export, gradient renk | 1-2 gün |
| **Faz 3 — Logo** | Logo yükleme, otomatik boyutlandırma, H seviyesine geçiş, uyarılar | 1 gün |
| **Faz 4 — Profesyonel Arayüz** | Tam responsive tasarım, karanlık mod, çerçeve/"Scan Me" | 1-2 gün |
| **Faz 5 — Depolama & Geçmiş** | IndexedDB entegrasyonu, geçmiş listesi, silme/favorileme | 1 gün |
| **Faz 6 — İçerik Tipleri** | WiFi, vCard, e-posta, telefon, konum formatları | 1 gün |
| **Faz 7 — Ekstralar** | Toplu üretim, kamera ile test, presetler, URL paylaşımı | 2+ gün |

> İstersen sıfırdan (Reed-Solomon dahil) kendi QR encoder'ını yazmak için ayrı bir **"Faz 0 — Kendi Encoder'ın"** ekleyip, önce QR standardının nasıl çalıştığını (versiyon, mod göstergesi, hata düzeltme, maskeleme) adım adım kodlayabiliriz. Bu, projeye "tamamen sıfırdan" bir boyut katar ama en az 2-3 gün ekler.

---

## 9. Sonraki Adım

Bu plan onaylandıktan sonra **Faz 1**'den başlayarak kodlamaya geçebiliriz. Hangi fazdan başlamak istediğini veya Faz 0'ı (kendi QR encoder'ını sıfırdan yazma) dahil edip etmemeyi söylersen, ona göre ilk kod dosyalarını hazırlarım.
