# HexaFleet — Kurulum Rehberi

Kurulum 3 bölümden oluşuyor, toplam 15-20 dakika sürer. Hepsi **ücretsiz**.

1. **Google tarafı:** kayıtların tutulacağı e-tablo ve fotoğrafların kaydedileceği Drive klasörü
2. **GitHub tarafı:** uygulamanın internette yayınlanması
3. **Telefonlar:** sen, baban ve kardeşin

> Google tarafını **tek bir kişi** kendi hesabında kurar, sonra diğerleriyle paylaşır.
> ⚠️ Kurulumu Drive'ında **HexaFleet** klasörü olan Google hesabıyla yap. Kod bu klasörü kullanacak şekilde ayarlı.

**Her şey Drive'daki HexaFleet klasöründe toplanır:**
```
HexaFleet/
├── HexaFleet                     ← ana kayıt tablosu (uygulama buradan çalışır, elle düzenlemeyin)
├── 2026-01 Ocak/
│   ├── 2026-01 Ocak - Rapor      ← o ayın raporu: Seferler / Giderler / Özet
│   ├── Faturalar/                ← "Ege Lojistik - 05.01.2026.pdf"
│   └── Masraf Fişleri/           ← "Yakıt - Shell - 03.01.2026.jpg", "Lastik - 2 ön lastik - 04.01.2026.jpg"
└── 2026-02 Şubat/ ...
```
- Ay klasörü o ay ilk kayıt girildiğinde kendiliğinden açılır. İş yapılmayan ay için klasör açılmaz.
- **Rapor** her kayıt eklendiğinde, değiştiğinde ya da silindiğinde kendiliğinden güncellenir. Seferler sayfasında ödemesi alınan seferler **yeşil**, alınmayanlar **kırmızı** görünür.
- Faturanın adı **müşteri firma + fatura tarihi** olur. Fatura tarihi girilmemişse sefer tarihi kullanılır. Sefer tarihi ya da müşteri değişirse dosya kendiliğinden doğru aya taşınır ve yeniden adlandırılır.
- Kayıt silinince belgesi Drive'da **çöp kutusuna** gider (30 gün içinde geri alınabilir).

---

## 1) Google tarafı (Sheets + Drive + Apps Script)

### 1.1 E-tabloyu oluştur
1. Bilgisayardan https://sheets.google.com adresine git ve **Boş e-tablo** oluştur.
2. Sol üstten adını **HexaFleet** yap.

### 1.2 Kodu yapıştır
1. Üst menüden **Uzantılar → Apps Script**'e tıkla. Yeni bir sekme açılır.
2. Soldaki `Kod.gs` (veya `Code.gs`) dosyasının içindeki her şeyi sil.
3. Bu klasördeki **`apps-script/Code.gs`** dosyasının tamamını kopyalayıp oraya yapıştır.
4. Yukarıdaki 💾 **Kaydet** simgesine bas.

### 1.3 Şifre belirle
1. Apps Script'te soldaki ⚙️ **Proje Ayarları**'na tıkla.
2. En altta **Komut dosyası özellikleri → Komut dosyası özelliği ekle**'ye bas.
3. **Özellik:** `SIFRE`, **Değer:** üçünüzün kullanacağı ortak bir şifre (ör. `Tir2026!aile`).
4. **Komut dosyası özelliklerini kaydet**'e bas.

> Bu şifre olmadan kimse kayıtlarınızı göremez ve değiştiremez. Uygulamanın linkini bulan biri bile şifreyi bilmeden hiçbir şey yapamaz.

### 1.4 Kurulumu çalıştır (izin ver)
1. Soldan **< > Düzenleyici**'ye geri dön.
2. Üstteki fonksiyon seçicisinde **`kurulum`** seçili olsun, ▶ **Çalıştır**'a bas.
3. "Yetkilendirme gerekli" penceresi çıkar → **İzinleri incele** → hesabını seç.
4. "Google bu uygulamayı doğrulamadı" uyarısı çıkarsa: **Gelişmiş → projenin adına git (güvenli değil)** → **İzin ver**.
   (Bu uyarı normal, kodu sen yazdığın için Google doğrulamadı. Kod sadece kendi e-tablona ve Drive'ına erişir.)
5. Alttaki günlükte *"E-tablo ve belgeler bu klasörde: https://drive.google.com/..."* yazısını görürsün. E-tablo kendiliğinden **HexaFleet** klasörüne taşınır. Bundan sonra yüklenen bütün faturalar da bu klasörün altındaki yıl/ay klasörlerine gider.

### 1.5 Web uygulaması olarak yayınla
1. Sağ üstten **Dağıt → Yeni dağıtım**.
2. ⚙️ simgesinden türü **Web uygulaması** seç.
3. Ayarlar:
   - **Açıklama:** HexaFleet
   - **Şu kullanıcı olarak yürüt:** **Ben**
   - **Erişimi olanlar:** **Herkes** ⚠️ (bu şart; güvenliği şifre sağlıyor)
4. **Dağıt**'a bas, çıkan **Web uygulaması URL'sini** kopyala.
   `https://script.google.com/macros/s/AKfy..../exec` şeklinde olur. Bu linki bir yere not et.

### 1.6 Babanla ve kardeşinle paylaş (isteğe bağlı ama tavsiye edilir)
- Drive'da **HexaFleet** klasörüne sağ tıkla → **Paylaş** → ikisinin Gmail adresini **Görüntüleyen** olarak ekle.
- Bu tek paylaşım hem e-tabloyu hem de bütün faturaları kapsar. Uygulamadaki "📎" linkleri onlarda da açılır.
- Kayıtları uygulamadan girecekleri için e-tabloda düzenleme yetkisine gerek yok.

### Kodu sonradan güncellersen
**Dağıt → Dağıtımları yönet → ✏️ (düzenle) → Sürüm: Yeni sürüm → Dağıt**.
Böyle yaparsan link **değişmez**. "Yeni dağıtım" dersen link değişir ve telefonlardan tekrar girmen gerekir.

Kodu güncelledikten sonra üstteki fonksiyon kutusundan **`herSeyiDuzenle`**'yi seçip bir kez **▶ Çalıştır**. Bu fonksiyon:
- eski belgeleri ay klasörlerine taşır ve adlarını düzeltir,
- her ayın raporunu baştan oluşturur,
- eski düzenden kalan boş klasörleri çöpe atar.

Yeni izin isterse (ör. "e-tablolarınızı oluşturma") **İzin ver** de.

---

## 2) GitHub Pages ile yayınlama

1. https://github.com adresinden giriş yap, sağ üstteki **+ → New repository**'ye tıkla.
2. **Repository name:** `HexaFleet`. **Public** seçili kalsın (GitHub Pages ücretsiz planda public repo ister).
   *Kodun herkese açık olması sorun değil: kayıtlarınız GitHub'da değil, senin Google hesabında duruyor.*
3. **Create repository**'ye bas.
4. Açılan sayfada **uploading an existing file** linkine tıkla.
5. Bu klasördeki şu dosyaları sürükleyip bırak:
   `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` ve **`icons` klasörü** (içindeki `hexaforge-logo.png` sadece kaynak dosya, yüklemesen de olur)
   (`apps-script` klasörünü ve bu `.md` dosyalarını yüklemek zorunda değilsin, istersen yükle.)
6. **Commit changes**'e bas.
7. Repo'da **Settings → Pages**'e git:
   - **Source:** Deploy from a branch
   - **Branch:** `main`, klasör `/ (root)` → **Save**
8. 1-2 dakika bekle. Sayfayı yenileyince üstte link çıkar:
   `https://haruungny.github.io/HexaFleet/`

### Uygulamayı güncellerken
Değişen dosyayı GitHub'da aynı yere tekrar yükle. Telefonlar uygulamayı bir sonraki açılışta kendiliğinden günceller.

---

## 3) Telefonlara kurulum

### İlk telefon (sen)
1. Telefonda `https://haruungny.github.io/HexaFleet/` adresini aç.
2. **Adın**, **Apps Script linki** (1.5'te kopyaladığın) ve **şifre**yi gir → **Başla**.
3. Ana ekrana ekle:
   - **Android (Chrome):** sağ üstteki ⋮ menüsü → **Ana ekrana ekle** / **Uygulamayı yükle**
   - **iPhone (Safari):** alttaki Paylaş ⬆️ simgesi → **Ana Ekrana Ekle**

### Baban ve kardeşin
1. Uygulamada **Daha → Ayarlar → "Kurulum linkini paylaş"**'e bas, WhatsApp'tan gönder.
   (Bu link Apps Script adresini içerir, onların uzun linki yazması gerekmez. Şifre linkte **yok**, şifreyi ayrıca söyle.)
2. Linki açınca sadece **adlarını** ve **şifreyi** yazıp **Başla**'ya basarlar.
3. Onlar da ana ekrana eklesin.

---

## Kullanım ipuçları

- **Yakıt:** Her alımda **km**'yi gir, depoyu tamamen doldurduğunda "Depo tamamen dolduruldu" kutusunu işaretle. Ortalama tüketim iki dolu depo arasındaki litre ve km'den hesaplanır. Ortalamanın %15 üstüne çıkan alımlar kırmızı görünür (kaçak, arıza veya yakıt hırsızlığı olabilir).
- **Sefer:** Yükleme yapınca seferi aç. Sefer sırasında girilen yakıt ve masraflar o sefere otomatik bağlanır. Sefer bitince **Bitiş km**'yi gir; seferin kârı ve gidilen km hesaplanır.
- **Alacaklar:** Fatura kesince "Fatura kesildi" kutusunu işaretleyip **vade** gir. Vadesi geçen alacaklar Özet ekranında kırmızı çıkar. Para gelince "Ödemesi alındı"yı işaretle.
- **Hatırlatmalar:** Hazır şablonlardan muayene, sigorta, takograf, yağ değişimi gibi kayıtları ekle. İş yapılınca **✓ Yapıldı**'ya bas, bir sonraki tarih veya km kendiliğinden hesaplanır.
- **İnternet yoksa:** Kayıt girmeye devam et. Üstte "Çevrimdışı · 3" gibi bir yazı görürsün. İnternet gelince kayıtlar ve fotoğraflar kendiliğinden gönderilir.
- **Muhasebeci:** Daha → Raporlar'dan aylık veya yıllık Excel indirip gönderebilirsin. Belgelerin Drive linkleri de dosyada olur.

## Sorun giderme

| Sorun | Çözüm |
|---|---|
| "Şifre yanlış" | Apps Script → Proje Ayarları'ndaki `SIFRE` ile uygulamaya yazılan şifre aynı mı? Büyük/küçük harf önemli. |
| "Sunucudan geçersiz yanıt" | Dağıtımda **Erişimi olanlar: Herkes** seçili mi? Link `/exec` ile mi bitiyor? |
| "Sunucuda SIFRE tanımlı değil" | 1.3 adımını yap. |
| Fotoğraflar yüklenmiyor | 1.4 adımında Drive izni verildi mi? `kurulum` fonksiyonunu tekrar çalıştır. |
| "HexaFleet Drive klasörüne erişilemedi" | Apps Script'i HexaFleet klasörünün sahibi olan hesapla kurmadın. Doğru hesapla aç, ya da Proje Ayarları'na `KLASOR_ID` özelliği ekleyip kendi klasörünün kimliğini yaz (klasör linkinde `/folders/` sonrasındaki kısım). |
| Kod değişikliği etkisiz | 1.5'in altındaki "Kodu sonradan güncellersen" adımını uygula. |
