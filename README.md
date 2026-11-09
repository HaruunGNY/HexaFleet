# HexaFleet

Bir [Hexaforge](https://hexaforge.com.tr/) ürünü. Tır işletmeleri için telefondan kullanılan iş takip uygulaması.

- **Seferler:** güzergâh, müşteri, navlun, km, sefer başı kâr
- **Alacaklar:** fatura, vade ve tahsilat takibi, vadesi geçenlere uyarı
- **Yakıt:** litre, tutar, km; depo-dolu yöntemiyle L/100km ortalaması ve anormal tüketim uyarısı
- **Masraflar:** kategorili (otoyol, bakım, lastik, sigorta, ceza, maaş…), KDV ayrımı
- **Belgeler:** fiş, fatura fotoğrafları ve PDF'ler Google Drive'daki HexaFleet klasörüne, yıl ve ay klasörlerine kaydedilir
- **Hatırlatmalar:** muayene, sigorta, takograf, K belgesi, yağ değişimi (tarih veya km bazlı)
- **Raporlar:** aylık/yıllık gelir-gider-kâr, km başı maliyet, KDV özeti, Excel çıktısı
- **Ortak kullanım:** tüm veriler ortak bir Google E-Tablo'da; her kayıtta kimin eklediği görünür
- **Çevrimdışı:** internet yokken de kayıt girilir, bağlantı gelince gönderilir

Arayüz: GitHub Pages üzerinde PWA (ana ekrana eklenebilir).
Arka uç: Google Apps Script + Sheets + Drive.

Kurulum için **[KURULUM.md](KURULUM.md)** dosyasına bakın.
