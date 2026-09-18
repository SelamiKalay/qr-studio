# QR Studio

Logo, şekil, renk ve çerçeve özelleştirmeli; **PNG / SVG / PDF** çıktı veren, geçmişi
tarayıcıda saklayan QR kod stüdyosu.

> **Sıfır bağımlılık.** Ne npm paketi, ne CDN, ne backend. QR matrisi (Reed-Solomon
> hata düzeltmesi dahil), SVG render motoru, PDF yazıcı ve ZIP yazıcı bu projede
> sıfırdan yazıldı. Dosyaları indirip çift tıklayarak bile çalışır; internet gerekmez.

---

## Çalıştırma

Projeyle birlikte gelen, bağımlılıksız sunucu (yalnızca Node gerekir, npm kurulumu yok):

```bash
node dev-server.js
```

Ardından tarayıcıda `http://localhost:8000` adresini açın. Farklı port için: `node dev-server.js 5500`

Alternatifler:

```bash
npx serve .
```

```bash
python -m http.server 8000
```

> `index.html`'i doğrudan çift tıklayarak da açabilirsiniz. Yalnızca **kamerayla tarama
> testi** özelliği tarayıcı güvenlik kuralları gereği `http://localhost` üzerinden çalışır.

---

## Özellikler

### İçerik tipleri
Web adresi · Düz metin · E-posta · Telefon · SMS · WiFi · Kartvizit (vCard) ·
Konum (geo) · Etkinlik (VEVENT) · Sosyal medya kısayolları

Her tip kendi form şemasını ve standart QR yükünü `js/content-types.js` içinde tanımlar;
WiFi ve vCard için ayraç kaçışları (`\;` `\,` `\:`) doğru uygulanır.

### Görsel özelleştirme
- **Nokta şekli:** kare, yuvarlak, damla, nokta, elmas, classy — komşu modüllere göre
  akıllı köşe yuvarlama (bitişik modüller birleşir, dışa bakan köşeler yuvarlanır)
- **Köşe çerçevesi:** kare, yuvarlak, daire, damla, ters damla
- **Köşe içi:** kare, yuvarlak, daire, elmas, damla
- Üç köşe ayrı ayrı ayarlanabilir
- **Renk:** düz renk veya gradient (doğrusal/dairesel, açı ayarlı), köşeler için ayrı renk
- **Şeffaf arka plan**, arka plan köşe yuvarlaması, sessiz bölge (margin) ayarı
- **Çerçeve:** altta/üstte yazı şeridi, rozet, sade kenarlık + serbest yazı

### Logo
- PNG / JPG / SVG / WEBP yükleme (sürükle-bırak destekli)
- QR alanının **en fazla %30'u** ile sınırlı, otomatik ortalanır
- Logo eklenince hata düzeltme seviyesi otomatik **H (%30)** olur ve seviye kilitlenir
- İsteğe bağlı dolgu zemini + köşe yuvarlama

### Taranabilirlik skoru
Her değişiklikte 0–100 arası bir skor ve gerekçeli uyarılar üretilir:
WCAG kontrast oranı, negatif (açık desen / koyu zemin) kullanımı, dar sessiz bölge,
logo oranı, şeffaf zemin ve içerik yoğunluğu değerlendirilir.

### Dışa aktarma
| Format | Nasıl üretiliyor |
|---|---|
| **PNG** | SVG → `Image` → `canvas` → `toBlob`. 512 / 1024 / 2048 / 4096 veya özel çözünürlük. Şeffaflık korunur. |
| **SVG** | Üretilen SVG doğrudan `Blob` olarak. Vektörel, sınırsız büyütülebilir. |
| **PDF** | **Gerçek vektör.** Çizim yolları PDF içerik akışına birebir çevrilir; gradient PDF shading pattern'ı olarak, çerçeve yazısı Helvetica ile gömülür. A4 ortasına, seçilen mm genişliğinde yerleşir. |

### Toplu üretim
CSV yükleyin (veya satırları yapıştırın) → mevcut tasarımla tüm kodlar üretilir →
tek `.zip` olarak iner. ZIP dosyası (CRC32 dahil) sıfırdan yazılır; PNG zaten
sıkıştırılmış olduğu için STORE yöntemi kullanılır.

CSV biçimi — ilk sütun içerik, ikinci sütun (varsa) dosya adı etiketi:

```csv
icerik;etiket
https://ornek.com/a;Kampanya A
https://ornek.com/b;Kampanya B
```

Ayraç (`,` `;` sekme) otomatik algılanır, tırnaklı alanlar desteklenir.

### Geçmiş
Üretilen her kod ayarları ve küçük önizlemesiyle **IndexedDB**'ye kaydedilir.
Kartına tıklayınca tüm tasarım ve form alanlarıyla birlikte düzenlemeye açılır.
Favorileme, silme, tümünü temizleme ve `.json` olarak yedekleme/geri yükleme mevcuttur.
Son kullanılan ayarlar ayrıca `localStorage`'da tutulur ve açılışta geri yüklenir.

### Diğer
- Karanlık / aydınlık mod (sistem tercihini izler, seçim hatırlanır)
- Hazır şablonlar: Klasik, Yumuşak, Instagram, Kurumsal, Gece, Afiş
- "Şaşırt beni" — rastgele uyumlu tasarım
- Ayarları bağlantı olarak paylaşma (adres çubuğu `#` parçasına kodlanır)
- Kamerayla tarama testi (`BarcodeDetector` destekleyen tarayıcılarda)

### Klavye kısayolları
| Kısayol | İşlev |
|---|---|
| `Ctrl` + `S` | PNG indir |
| `Ctrl` + `Shift` + `S` | SVG indir |
| `Ctrl` + `Z` | Son ayarı geri al |
| `Alt` + `R` | Rastgele tasarım |
| `Esc` | Açık pencereyi kapat |

---

## Android uygulaması (APK)

Aynı kod tabanı, native bir Android kabuğu içinde çalışır. Gradle, Android Studio
veya npm gerekmez — APK doğrudan Android SDK araçlarıyla (`aapt2 → javac → d8 →
zipalign → apksigner`) derlenir.

### Derleme

```bash
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

Çıktı: proje kökünde `QR-Studio.apk` (~120 KB).

Gereksinimler: JDK 17+ (`JAVA_HOME`) ve Android SDK (`ANDROID_HOME`) içinde
`build-tools` + bir `platforms/android-XX`. Derleme, geçici bir ASCII yol altında
yapılır (aapt2 Windows'ta Türkçe karakter içeren yolları açamıyor).

### Telefona kurma

Telefonda bir kez: **Ayarlar → Telefon hakkında → Yapı numarası**na 7 kez dokunun,
sonra **Ayarlar → Geliştirici seçenekleri → USB hata ayıklama**yı açın.
Kabloyu takıp telefondaki izin penceresini onaylayın, ardından:

```bash
powershell -ExecutionPolicy Bypass -File install-apk.ps1 -Launch
```

Betik cihazı bulur, model/Android/WebView sürümünü yazar, APK'yı kurar ve açar.
`-Logs` eklerseniz kurulumdan sonra logcat'i izler.

APK'yı telefona kopyalayıp dosya yöneticisinden de kurabilirsiniz (bu durumda
"bilinmeyen kaynaklardan yükleme" izni istenir).

### Native tarafta neler var

| Konu | Çözüm |
|---|---|
| Sayfaların servisi | Varlıklar `assets/www` içinden, `shouldInterceptRequest` ile sanal bir **https** kaynağı üzerinden sunulur. `file://` kullanılsaydı IndexedDB engellenir, geçmiş çalışmazdı. |
| İnternet izni | **Yok.** Tüm istekler uygulama içinde karşılanır; APK ağ erişimi isteyemez. |
| İndirme | WebView `blob:` indirmelerini desteklemez. Dosyalar JS köprüsü üzerinden 512 KB'lık parçalar hâlinde native tarafa aktarılıp **MediaStore** ile İndirilenler klasörüne yazılır (Android 10+ için izin gerekmez). |
| Logo / CSV seçimi | `onShowFileChooser` ile sistem dosya seçici. |
| Kamera | `onPermissionRequest` + çalışma anı CAMERA izni. Sanal kaynak https olduğu için `getUserMedia` ve `BarcodeDetector` güvenli bağlam şartını sağlar — tarama testi telefonda masaüstünden daha iyi çalışır. |
| Geri tuşu | Önce açık pencereyi kapatır, sonra çift basışla çıkar. |
| Tema | Sistem karanlık moduna göre pencere ve durum çubuğu renklenir. |
| İkon | `tools/make-icons.js`, Node'un zlib'i ile PNG'leri sıfırdan yazar; uyarlanabilir (adaptive) ikon zemini vektör gradienttir. |

### İmzalama

İlk derlemede `android/qrstudio.keystore` üretilir (parola: `qrstudio`).
**Bu dosyayı saklayın** — güncellemelerin aynı anahtarla imzalanması gerekir,
aksi hâlde telefondaki uygulamayı kaldırmadan üzerine kuramazsınız.
Bu yerel bir geliştirme anahtarıdır; Play Store'a yükleme için ayrı bir
yayın anahtarı oluşturun.

---

## Klasör yapısı

```
.
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── qr-encoder.js       # Matris üretimi: mod seçimi, Reed-Solomon, blok interleaving, maskeleme
│   ├── qr-renderer.js      # Matris → çizim komutları → SVG (şekil, gradient, logo, çerçeve)
│   ├── qr-export.js        # PNG / SVG / PDF dışa aktarma
│   ├── content-types.js    # İçerik tipi şemaları ve biçimlendiricileri
│   ├── storage.js          # IndexedDB + localStorage
│   ├── history-ui.js       # Geçmiş listesi arayüzü
│   ├── batch.js            # CSV ayrıştırma + ZIP yazıcı + toplu üretim
│   └── app.js              # Durum yönetimi, form, canlı önizleme, olaylar
├── assets/fonts/           # (opsiyonel) yerel font dosyaları için
├── dev-server.js           # Bağımlılıksız yerel statik sunucu
│
├── android/                # Android uygulaması
│   ├── AndroidManifest.xml
│   ├── java/com/qrstudio/app/MainActivity.java
│   ├── res/                # ikonlar, temalar, metinler
│   └── qrstudio.keystore   # imza anahtarı (ilk derlemede üretilir)
├── tools/
│   └── make-icons.js       # PNG ikon üreteci (Node zlib ile)
├── build-apk.ps1           # APK derleyici (Gradle'sız)
├── install-apk.ps1         # Telefona kurulum
└── README.md
```

---

## Nasıl çalışıyor

### 1. Matris üretimi — `qr-encoder.js`
ISO/IEC 18004'e göre yazılmıştır:

1. **Mod seçimi** — içerik sayısal / alfanümerik / byte (UTF-8) olarak analiz edilir;
   en verimli mod seçilir (`8675309` sayısal modda byte modunun yarısı kadar yer kaplar).
2. **Versiyon seçimi** — içeriğin sığdığı en küçük versiyon (1–40) bulunur.
3. **Bit akışı** — mod göstergesi + karakter sayısı + veri + sonlandırıcı +
   `0xEC / 0x11` dolgu baytları.
4. **Reed-Solomon** — GF(256) üzerinde (primitif polinom `0x11D`) jeneratör polinomuyla
   sentetik bölme ile hata düzeltme kod sözcükleri üretilir.
5. **Blok interleaving** — veri ve EC blokları standart sıraya göre serpiştirilir.
6. **Matris** — bulucu desenleri, ayırıcılar, zamanlama ve hizalama desenleri,
   format (BCH 15,5) ve versiyon (BCH 18,6) bilgileri yerleştirilir; veri zigzag
   düzeninde yazılır.
7. **Maskeleme** — 8 maskenin tümü uygulanıp ISO'daki 4 ceza kuralına göre puanlanır,
   en düşük puanlı maske seçilir.

Doğrulama: 32 değerlik format bilgisi tablosu, bilinen versiyon BCH değerleri,
Reed-Solomon kalanının sıfır olması ve **v1–v40 arası tam kapasiteye kadar
kodla-çöz round-trip'i** ile test edilmiştir.

### 2. Render — `qr-renderer.js`
Matris, `{tip, path, renk}` biçiminde bir çizim komutları listesine dönüştürülür.
Tüm yollar yalnızca **M / L / C / Z** komutları kullanır (yaylar kübik bezier'a çevrilir) —
bu sayede aynı liste hem SVG'ye hem de PDF içerik akışına çevrilebilir.
Köşe (finder) desenleri halka olarak `fill-rule="evenodd"` ile çizilir.

### 3. Export — `qr-export.js`
PDF, sayfa koordinat sistemini `[s 0 0 -s ox oy] cm` matrisiyle çevirip tasarım
koordinatlarını doğrudan kullanır; metin `1 0 0 -1 x y Tm` ile ters çevrilerek düz durur;
gradient, aynı matrisi taşıyan bir `PatternType 2` shading pattern'ı olarak tanımlanır.
xref tablosu byte ofsetleriyle hesaplanır.

---

## Bilinen sınırlar

- **PDF yazı tipi:** Gömülü Helvetica (WinAnsi) kullanıldığı için çerçeve yazısındaki
  `ğ ş İ ı` harfleri PDF'te `g s I i` olarak yazılır. PNG ve SVG çıktılarında böyle bir
  sınır yoktur.
- **Kamerayla tarama testi** `BarcodeDetector` API'sini gerektirir; masaüstü Chrome'un
  Windows sürümünde genelde bulunmaz. Bu durumda arayüz sizi bilgilendirir — en gerçekçi
  test zaten telefon kamerasıdır.
- **Şeffaf arka planlı PDF** desteklenmez; PDF her zaman zemin rengini basar.
- Logo PDF'e JPEG olarak gömülür (şeffaflık, seçtiğiniz dolgu rengiyle doldurulur).
- Yazı tipi olarak sistem fontları kullanılır (CDN'e bağımlı kalmamak için).
  Kendi fontunuzu kullanmak isterseniz `assets/fonts/` içine koyup `css/style.css`
  içinde `@font-face` tanımlayın.

---

## Gizlilik

Hiçbir veri sunucuya gönderilmez. İçerik, logolar ve geçmiş yalnızca kendi
tarayıcınızın IndexedDB ve localStorage alanında saklanır. WiFi QR kodlarındaki şifrenin
QR içinde **açık metin** olarak yer aldığını unutmayın — bu QR standardının gereğidir,
paylaşırken dikkatli olun.
