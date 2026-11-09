/**
 * HexaFleet — Google Apps Script arka ucu
 *
 * Her şey Google Drive'daki "HexaFleet" klasöründe toplanır:
 *
 *   HexaFleet/
 *   ├── HexaFleet                     → ana kayıt tablosu (uygulama buradan okur/yazar)
 *   ├── 2026-01 Ocak/
 *   │   ├── 2026-01 Ocak - Rapor      → o ayın renkli raporu (her kayıtta kendiliğinden güncellenir)
 *   │   ├── Faturalar/                → sefer faturaları: "Müşteri Firma - 05.01.2026.pdf"
 *   │   └── Masraf Fişleri/           → yakıt ve masraf fişleri
 *   └── 2026-02 Şubat/ ...
 *
 * Kurulum adımları için KURULUM.md dosyasına bakın.
 * Proje Ayarları > Komut dosyası özellikleri kısmına SIFRE adında bir özellik eklemeyi unutmayın.
 */

const KOLEKSIYONLAR = ['seferler', 'yakit', 'masraflar', 'hatirlatmalar'];
const RAPORLU = ['seferler', 'yakit', 'masraflar'];
const SAYFA_ADLARI = {
  seferler: 'Seferler',
  yakit: 'Yakıt',
  masraflar: 'Masraflar',
  hatirlatmalar: 'Hatırlatmalar'
};
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
// Drive'daki HexaFleet klasörünün kimliği (klasör linkindeki /folders/ sonrası kısım)
const HEXAFLEET_KLASOR_ID = '1AndJIHiGhvX0QJwXsl0owEOUapBK7m5H';

const RENK = {
  baslik: '#0f172a', baslikYazi: '#ffffff',
  odendi: '#c6f6d5', odenmedi: '#fed7d7',
  toplam: '#e2e8f0'
};
const PARA_FORMAT = '#,##0.00 "₺"';

// =====================================================================
// Elle çalıştırılan fonksiyonlar
// =====================================================================

/** Kurulumda bir kez çalıştırın: sayfaları oluşturur, e-tabloyu HexaFleet klasörüne taşır, izinleri ister. */
function kurulum() {
  KOLEKSIYONLAR.forEach(sayfa);
  const klasor = kokKlasor();
  const tablo = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const ebeveyn = tablo.getParents();
  if (!ebeveyn.hasNext() || ebeveyn.next().getId() !== klasor.getId()) tablo.moveTo(klasor);
  Logger.log('E-tablo ve belgeler bu klasörde: ' + klasor.getUrl());
  if (!PropertiesService.getScriptProperties().getProperty('SIFRE')) {
    Logger.log('UYARI: Henüz SIFRE tanımlamadınız! Proje Ayarları > Komut dosyası özellikleri kısmından ekleyin.');
  } else {
    Logger.log('Kurulum tamam. Şimdi Dağıt > Yeni dağıtım > Web uygulaması yapın.');
  }
}

/**
 * Bütün belgeleri ay klasörlerine taşır, isimlerini düzeltir, her ayın raporunu baştan oluşturur
 * ve eski düzenden kalan boş klasörleri çöp kutusuna atar. Güncellemeden sonra bir kez çalıştırın.
 */
function herSeyiDuzenle() {
  const aylar = {};
  let belge = 0;
  RAPORLU.forEach(function (kol) {
    hepsiniOku(kol).forEach(function (r) {
      if (gecerliTarih(r.tarih)) aylar[ayAnahtari(r.tarih)] = true;
      if (r.dosyaUrl) { belgeYerlestir(kol, r); belge++; }
    });
  });
  Object.keys(aylar).sort().forEach(ayRaporuGuncelle);
  const silinen = bosKlasorleriTemizle();
  Logger.log(belge + ' belge düzenlendi, ' + Object.keys(aylar).length + ' ay raporu oluşturuldu, ' + silinen + ' boş klasör çöpe atıldı.');
  Logger.log('Klasör: ' + kokKlasor().getUrl());
}

// =====================================================================
// Web uygulaması
// =====================================================================

function doGet() {
  return json({ ok: true, mesaj: 'HexaFleet sunucusu çalışıyor' });
}

function doPost(e) {
  let cevap;
  try {
    const istek = JSON.parse(e.postData.contents);
    const sifre = PropertiesService.getScriptProperties().getProperty('SIFRE');
    if (!sifre) throw new Error('Sunucuda SIFRE tanımlı değil (Apps Script > Proje Ayarları > Komut dosyası özellikleri).');
    if (String(istek.sifre || '') !== sifre) throw new Error('Şifre yanlış');

    const kilit = LockService.getScriptLock();
    kilit.waitLock(30000);
    try {
      cevap = isle(istek);
    } finally {
      kilit.releaseLock();
    }
    cevap.ok = true;
  } catch (err) {
    cevap = { ok: false, hata: String((err && err.message) || err) };
  }
  return json(cevap);
}

function isle(istek) {
  switch (istek.islem) {
    case 'test':
      return { mesaj: 'Bağlantı başarılı' };

    case 'hepsi': {
      const veri = {};
      KOLEKSIYONLAR.forEach(function (k) { veri[k] = hepsiniOku(k); });
      return { veri: veri, zaman: new Date().toISOString() };
    }

    case 'kaydet': {
      kolKontrol(istek.kol);
      if (!istek.kayit || !istek.kayit.id) throw new Error('Kayıt kimliği (id) yok');
      const sonuc = kaydet(istek.kol, istek.kayit, istek.dosya);
      raporlariGuncelle(istek.kol, [sonuc.kayit.tarih, sonuc.eskiTarih]);
      return { kayit: sonuc.kayit };
    }

    case 'sil': {
      kolKontrol(istek.kol);
      const eski = sil(istek.kol, istek.id);
      if (eski) raporlariGuncelle(istek.kol, [eski.tarih]);
      return {};
    }

    default:
      throw new Error('Bilinmeyen işlem: ' + istek.islem);
  }
}

// =====================================================================
// Ana kayıt tablosu
// =====================================================================

function kolKontrol(kol) {
  if (KOLEKSIYONLAR.indexOf(kol) < 0) throw new Error('Geçersiz tablo: ' + kol);
}

function sayfa(kol) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ad = SAYFA_ADLARI[kol];
  let sh = ss.getSheetByName(ad);
  if (!sh) {
    sh = ss.insertSheet(ad);
    sh.getRange(1, 1).setValue('id');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 1).setFontWeight('bold');
  }
  return sh;
}

function basliklar(sh) {
  const sut = Math.max(1, sh.getLastColumn());
  return sh.getRange(1, 1, 1, sut).getValues()[0].map(String);
}

function satirBul(sh, id) {
  const son = sh.getLastRow();
  if (son < 2) return -1;
  const idler = sh.getRange(2, 1, son - 1, 1).getValues();
  for (let i = 0; i < idler.length; i++) {
    if (String(idler[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function hucreDegeri(x, tz) {
  if (x instanceof Date) return Utilities.formatDate(x, tz, 'yyyy-MM-dd');
  return x;
}

function satirOku(sh, satir, bas) {
  const tz = Session.getScriptTimeZone();
  const v = sh.getRange(satir, 1, 1, bas.length).getValues()[0];
  const o = {};
  bas.forEach(function (k, j) {
    if (k && v[j] !== '' && v[j] !== null) o[k] = hucreDegeri(v[j], tz);
  });
  return o;
}

/** Kaydı ekler ya da günceller. Belge geldiyse doğru ay/klasöre doğru isimle yükler. */
function kaydet(kol, kayit, dosya) {
  const sh = sayfa(kol);
  let bas = basliklar(sh);
  let satir = satirBul(sh, kayit.id);

  // Var olan kayıtla birleştir (gönderilmeyen alanlar korunur)
  const mevcut = satir > 0 ? satirOku(sh, satir, bas) : {};
  const birlesik = Object.assign({}, mevcut, kayit);

  if (dosya && dosya.base64) {
    birlesik.dosyaUrl = dosyaKaydet(kol, birlesik, dosya);
  } else if (birlesik.dosyaUrl && birlesik.dosyaUrl === mevcut.dosyaUrl) {
    // Tarih / müşteri değiştiyse mevcut belgeyi doğru klasöre taşı ve yeniden adlandır
    belgeYerlestir(kol, birlesik);
  }
  // Belge değiştirildi ya da kaldırıldıysa eski dosyayı çöp kutusuna taşı
  if (mevcut.dosyaUrl && birlesik.dosyaUrl !== mevcut.dosyaUrl) dosyaCopeAt(mevcut.dosyaUrl);

  // Yeni alanlar için sütun aç
  const yeni = Object.keys(birlesik).filter(function (k) { return bas.indexOf(k) < 0; });
  if (yeni.length) {
    sh.getRange(1, bas.length + 1, 1, yeni.length).setValues([yeni]).setFontWeight('bold');
    bas = bas.concat(yeni);
  }

  const degerler = bas.map(function (k) {
    const v = birlesik[k];
    return v === undefined || v === null ? '' : v;
  });
  // Metinler metin olarak kalsın (tarih/fatura no otomatik dönüşmesin), sayılar sayı olsun
  const formatlar = degerler.map(function (v) { return typeof v === 'string' ? '@' : 'General'; });

  if (satir < 0) satir = sh.getLastRow() + 1;
  const aralik = sh.getRange(satir, 1, 1, bas.length);
  aralik.setNumberFormats([formatlar]);
  aralik.setValues([degerler]);
  return { kayit: birlesik, eskiTarih: mevcut.tarih };
}

/** Kaydı siler, belgesini çöp kutusuna taşır. Silinen kaydı döndürür. */
function sil(kol, id) {
  const sh = sayfa(kol);
  const satir = satirBul(sh, id);
  if (satir < 0) return null;
  const eski = satirOku(sh, satir, basliklar(sh));
  if (eski.dosyaUrl) dosyaCopeAt(eski.dosyaUrl);
  sh.deleteRow(satir);
  return eski;
}

function hepsiniOku(kol) {
  const sh = sayfa(kol);
  const son = sh.getLastRow();
  const sut = sh.getLastColumn();
  if (son < 2) return [];
  const tz = Session.getScriptTimeZone();
  const v = sh.getRange(1, 1, son, sut).getValues();
  const bas = v[0].map(String);
  const sonuc = [];
  for (let i = 1; i < v.length; i++) {
    const o = {};
    for (let j = 0; j < bas.length; j++) {
      const x = v[i][j];
      if (!bas[j] || x === '' || x === null) continue;
      o[bas[j]] = hucreDegeri(x, tz);
    }
    if (o.id) sonuc.push(o);
  }
  return sonuc;
}

// =====================================================================
// Tarih / sayı yardımcıları
// =====================================================================

function gecerliTarih(s) { return /^\d{4}-\d{2}-\d{2}/.test(String(s || '')); }
function bugun() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function ayAnahtari(s) { return String(gecerliTarih(s) ? s : bugun()).slice(0, 7); }      // "2026-01"
function ayKlasorAdi(ay) { return ay + ' ' + AYLAR[Number(ay.slice(5, 7)) - 1]; }        // "2026-01 Ocak"
function trTarih(s) { s = String(s || ''); return gecerliTarih(s) ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; }
function sayi(v) { const n = typeof v === 'number' ? v : parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? n : 0; }
function evet(v) { return v === true || v === 'true' || v === 'TRUE'; }
function temizAd(s) { return String(s || '').replace(/[\\/:*?"<>|#%\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(); }

// =====================================================================
// Drive: klasörler ve belgeler
// =====================================================================

function kokKlasor() {
  // İstenirse Proje Ayarları > Komut dosyası özellikleri'nde KLASOR_ID ile başka klasör seçilebilir
  const id = PropertiesService.getScriptProperties().getProperty('KLASOR_ID') || HEXAFLEET_KLASOR_ID;
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error('HexaFleet Drive klasörüne erişilemedi. Apps Script projesini klasörün sahibi olan Google hesabıyla yayınladığınızdan emin olun.');
  }
}

function altKlasor(ust, ad) {
  const it = ust.getFoldersByName(ad);
  return it.hasNext() ? it.next() : ust.createFolder(ad);
}

function ayKlasoru(ay) { return altKlasor(kokKlasor(), ayKlasorAdi(ay)); }

/** Seferin faturası "Faturalar"a, yakıt/masraf fişleri "Masraf Fişleri"ne */
function belgeKlasoru(kol, r) {
  return altKlasor(ayKlasoru(ayAnahtari(r.tarih)), kol === 'seferler' ? 'Faturalar' : 'Masraf Fişleri');
}

/** "Ege Lojistik - 05.01.2026.pdf", "Yakıt - Shell - 03.01.2026.jpg", "Lastik - 2 ön lastik - 04.01.2026.jpg" */
function belgeAdi(kol, r, uzanti) {
  let parcalar;
  if (kol === 'seferler') parcalar = [r.musteri || 'Müşteri', trTarih(r.faturaTarihi || r.tarih)];
  else if (kol === 'yakit') parcalar = [r.tur === 'AdBlue' ? 'AdBlue' : 'Yakıt', r.istasyon, trTarih(r.tarih)];
  else parcalar = [r.kategori || 'Masraf', r.aciklama, trTarih(r.tarih)];
  const ad = parcalar.map(temizAd).filter(String).join(' - ').slice(0, 120);
  return ad + (uzanti ? '.' + uzanti : '');
}

function uzantiBul(ad, mime) {
  const m = String(ad || '').match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return '';
}

function dosyaKaydet(kol, r, dosya) {
  const klasor = belgeKlasoru(kol, r);
  const ad = belgeAdi(kol, r, uzantiBul(dosya.ad, dosya.mime));
  const blob = Utilities.newBlob(Utilities.base64Decode(dosya.base64), dosya.mime || 'application/octet-stream', ad);
  return klasor.createFile(blob).getUrl();
}

/** Var olan belgeyi kaydın ayına/klasörüne taşır ve adını düzeltir (link değişmez) */
function belgeYerlestir(kol, r) {
  const id = dosyaIdBul(r.dosyaUrl);
  if (!id) return;
  try {
    const f = DriveApp.getFileById(id);
    if (f.isTrashed()) return;
    const ad = belgeAdi(kol, r, uzantiBul(f.getName(), f.getMimeType()));
    if (f.getName() !== ad) f.setName(ad);
    const hedef = belgeKlasoru(kol, r);
    const ebeveyn = f.getParents();
    if (!ebeveyn.hasNext() || ebeveyn.next().getId() !== hedef.getId()) f.moveTo(hedef);
  } catch (e) {
    console.warn('Belge yerleştirilemedi: ' + r.dosyaUrl + ' — ' + e);
  }
}

/** Drive linkinden dosya kimliğini çıkarır: .../file/d/KIMLIK/view veya ...?id=KIMLIK */
function dosyaIdBul(url) {
  const m = String(url || '').match(/\/d\/([-\w]{20,})/) || String(url || '').match(/[?&]id=([-\w]{20,})/);
  return m ? m[1] : null;
}

/** Dosyayı kalıcı silmez, Drive çöp kutusuna taşır (30 gün içinde geri alınabilir) */
function dosyaCopeAt(url) {
  const id = dosyaIdBul(url);
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (e) {
    // dosya zaten silinmiş ya da erişim yok: kaydın silinmesine engel olmasın
  }
}

/** Eski düzenden kalan (ör. "2026/11-Kasım") içi boş klasörleri çöp kutusuna atar */
function bosKlasorleriTemizle() {
  let sayac = 0;
  function bosMu(k) {
    if (k.getFiles().hasNext()) return false;
    const alt = k.getFolders();
    let hepsiBos = true;
    while (alt.hasNext()) {
      const a = alt.next();
      if (bosMu(a)) { a.setTrashed(true); sayac++; } else hepsiBos = false;
    }
    return hepsiBos;
  }
  const it = kokKlasor().getFolders();
  while (it.hasNext()) {
    const k = it.next();
    if (/^\d{4}$/.test(k.getName()) && bosMu(k)) { k.setTrashed(true); sayac++; }
  }
  return sayac;
}

// =====================================================================
// Aylık rapor tabloları
// =====================================================================

/** Kayıt değişince ilgili ay(lar)ın raporunu yeniler. Hata olsa da kaydı engellemez. */
function raporlariGuncelle(kol, tarihler) {
  if (RAPORLU.indexOf(kol) < 0) return;
  const aylar = {};
  tarihler.forEach(function (t) { if (gecerliTarih(t)) aylar[ayAnahtari(t)] = true; });
  Object.keys(aylar).forEach(function (ay) {
    try { ayRaporuGuncelle(ay); } catch (e) { console.error('Rapor güncellenemedi (' + ay + '): ' + e); }
  });
}

function raporTablosu(ay, olustur) {
  const p = PropertiesService.getScriptProperties();
  const anahtar = 'RAPOR_' + ay;
  const id = p.getProperty(anahtar);
  if (id) {
    try {
      if (!DriveApp.getFileById(id).isTrashed()) return SpreadsheetApp.openById(id);
    } catch (e) { /* silinmiş, yeniden bul/oluştur */ }
  }
  const ad = ayKlasorAdi(ay) + ' - Rapor';
  const klasor = ayKlasoru(ay);
  const it = klasor.getFilesByName(ad);
  let ss;
  if (it.hasNext()) ss = SpreadsheetApp.openById(it.next().getId());
  else if (olustur) {
    ss = SpreadsheetApp.create(ad);
    DriveApp.getFileById(ss.getId()).moveTo(klasor);
  } else return null;
  p.setProperty(anahtar, ss.getId());
  return ss;
}

function ayRaporuGuncelle(ay) {
  const ayda = function (r) { return gecerliTarih(r.tarih) && ayAnahtari(r.tarih) === ay; };
  const tarihSirasi = function (a, b) { return String(a.tarih).localeCompare(String(b.tarih)); };
  const seferler = hepsiniOku('seferler').filter(ayda).sort(tarihSirasi);
  const giderler = hepsiniOku('yakit').filter(ayda).map(function (r) { r._kol = 'yakit'; return r; })
    .concat(hepsiniOku('masraflar').filter(ayda).map(function (r) { r._kol = 'masraflar'; return r; }))
    .sort(tarihSirasi);

  const bos = !seferler.length && !giderler.length;
  const ss = raporTablosu(ay, !bos);   // o ay hiç iş yoksa yeni rapor açma
  if (!ss) return;

  const sh1 = raporSayfasi(ss, 'Seferler', 0);
  const sh2 = raporSayfasi(ss, 'Giderler', 1);
  const sh3 = raporSayfasi(ss, 'Özet', 2);
  // Yeni tablodaki varsayılan boş sayfayı kaldır
  ss.getSheets().forEach(function (s) {
    if (['Seferler', 'Giderler', 'Özet'].indexOf(s.getName()) < 0 && ss.getSheets().length > 3) ss.deleteSheet(s);
  });

  const t = seferRaporu(sh1, seferler);
  const g = giderRaporu(sh2, giderler);
  ozetRaporu(sh3, ay, seferler.length, t, g);
}

function raporSayfasi(ss, ad, sira) {
  return ss.getSheetByName(ad) || ss.insertSheet(ad, sira);
}

function baslikYaz(sh, basliklar) {
  sh.clear();
  sh.setConditionalFormatRules([]);
  sh.getRange(1, 1, 1, basliklar.length).setValues([basliklar])
    .setFontWeight('bold').setBackground(RENK.baslik).setFontColor(RENK.baslikYazi).setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 36);
}

function linkleriYaz(sh, satir, sutun, urller, metin) {
  if (!urller.length) return;
  const zengin = urller.map(function (u) {
    const b = SpreadsheetApp.newRichTextValue().setText(u ? metin : '');
    return [u ? b.setLinkUrl(u).build() : b.build()];
  });
  sh.getRange(satir, sutun, urller.length, 1).setRichTextValues(zengin);
}

function seferRaporu(sh, seferler) {
  const bas = ['Yükleme tarihi', 'Nereden', 'Nereye', 'Müşteri / fatura kesilen firma', 'Yük', 'Navlun (KDV hariç)', 'KDV', 'Fatura toplamı',
    'Fatura kesildi', 'Fatura no', 'Fatura tarihi', 'Vade', 'Ödeme durumu', 'Tahsil tarihi', 'Fatura belgesi'];
  baslikYaz(sh, bas);
  const t = { navlun: 0, kdv: 0, toplam: 0, tahsil: 0, bekleyen: 0 };
  if (seferler.length) {
    const satirlar = [], renkler = [];
    seferler.forEach(function (s) {
      const navlun = sayi(s.navlun);
      const kdv = navlun * sayi(s.kdvOrani) / 100;
      const odendi = evet(s.tahsilEdildi);
      t.navlun += navlun; t.kdv += kdv; t.toplam += navlun + kdv;
      if (odendi) t.tahsil += navlun + kdv; else t.bekleyen += navlun + kdv;
      satirlar.push([trTarih(s.tarih), s.yukleme || '', s.bosaltma || '', s.musteri || '', s.yuk || '', navlun, kdv, navlun + kdv,
        evet(s.faturaKesildi) ? 'Evet' : 'Hayır', String(s.faturaNo || ''), trTarih(s.faturaTarihi), trTarih(s.vade),
        odendi ? '✓ Ödeme alındı' : '✗ Ödeme bekleniyor', trTarih(s.tahsilTarihi), '']);
      renkler.push(bas.map(function () { return odendi ? RENK.odendi : RENK.odenmedi; }));
    });
    const n = satirlar.length;
    const aralik = sh.getRange(2, 1, n, bas.length);
    aralik.setNumberFormat('@');
    sh.getRange(2, 6, n, 3).setNumberFormat(PARA_FORMAT);
    aralik.setValues(satirlar).setBackgrounds(renkler);
    sh.getRange(2, 13, n, 1).setFontWeight('bold');
    linkleriYaz(sh, 2, 15, seferler.map(function (s) { return s.dosyaUrl || ''; }), '📎 Faturayı aç');

    const ts = n + 3;
    sh.getRange(ts, 1, 3, 8).setValues([
      ['TOPLAM', '', '', n + ' sefer', '', t.navlun, t.kdv, t.toplam],
      ['Tahsil edilen', '', '', '', '', '', '', t.tahsil],
      ['Bekleyen alacak', '', '', '', '', '', '', t.bekleyen]
    ]).setFontWeight('bold').setBackground(RENK.toplam);
    sh.getRange(ts, 6, 3, 3).setNumberFormat(PARA_FORMAT);
    sh.getRange(ts + 1, 1, 1, 8).setBackground(RENK.odendi);
    sh.getRange(ts + 2, 1, 1, 8).setBackground(RENK.odenmedi);
  } else {
    sh.getRange(2, 1).setValue('Bu ay sefer yok');
  }
  sh.autoResizeColumns(1, bas.length);
  return t;
}

function giderRaporu(sh, giderler) {
  const bas = ['Tarih', 'Tür', 'Kategori / istasyon', 'Açıklama', 'Tutar (KDV dahil)', 'KDV %', 'KDV hariç', 'Ödeme', 'Litre', 'Km', 'Ekleyen', 'Belge'];
  baslikYaz(sh, bas);
  const g = { dahil: 0, haric: 0 };
  if (giderler.length) {
    const satirlar = giderler.map(function (r) {
      const tutar = sayi(r.tutar);
      const haric = tutar / (1 + sayi(r.kdvOrani) / 100);
      g.dahil += tutar; g.haric += haric;
      const yakit = r._kol === 'yakit';
      return [trTarih(r.tarih), yakit ? (r.tur === 'AdBlue' ? 'AdBlue' : 'Yakıt') : 'Masraf', yakit ? (r.istasyon || '') : (r.kategori || ''),
        yakit ? '' : (r.aciklama || ''), tutar, sayi(r.kdvOrani), haric, r.odeme || '', yakit ? sayi(r.litre) : '', r.km ? sayi(r.km) : '', r.ekleyen || '', ''];
    });
    const n = satirlar.length;
    sh.getRange(2, 1, n, 4).setNumberFormat('@');
    sh.getRange(2, 1, n, bas.length).setValues(satirlar);
    sh.getRange(2, 5, n, 1).setNumberFormat(PARA_FORMAT);
    sh.getRange(2, 7, n, 1).setNumberFormat(PARA_FORMAT);
    linkleriYaz(sh, 2, 12, giderler.map(function (r) { return r.dosyaUrl || ''; }), '📎 Fişi aç');
    const ts = n + 3;
    sh.getRange(ts, 1, 1, 7).setValues([['TOPLAM', '', '', n + ' kayıt', g.dahil, '', g.haric]])
      .setFontWeight('bold').setBackground(RENK.toplam);
    sh.getRange(ts, 5, 1, 3).setNumberFormat(PARA_FORMAT);
  } else {
    sh.getRange(2, 1).setValue('Bu ay gider yok');
  }
  sh.autoResizeColumns(1, bas.length);
  return g;
}

function ozetRaporu(sh, ay, seferSayisi, t, g) {
  sh.clear();
  const satirlar = [
    [ayKlasorAdi(ay) + ' özeti', ''],
    ['Sefer sayısı', seferSayisi],
    ['Gelir (navlun, KDV hariç)', t.navlun],
    ['Gider (KDV hariç)', g.haric],
    ['Net kâr (KDV hariç)', t.navlun - g.haric],
    ['Faturalar toplamı (KDV dahil)', t.toplam],
    ['Tahsil edilen', t.tahsil],
    ['Bekleyen alacak', t.bekleyen],
    ['Son güncelleme', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm')]
  ];
  sh.getRange(1, 1, satirlar.length, 2).setValues(satirlar);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground(RENK.baslik).setFontColor(RENK.baslikYazi);
  sh.getRange(3, 2, 6, 1).setNumberFormat(PARA_FORMAT);
  sh.getRange(5, 1, 1, 2).setFontWeight('bold');
  sh.getRange(7, 1, 1, 2).setBackground(RENK.odendi);
  sh.getRange(8, 1, 1, 2).setBackground(RENK.odenmedi);
  sh.autoResizeColumns(1, 2);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
