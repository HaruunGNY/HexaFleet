/**
 * HexaFleet — Google Apps Script arka ucu
 *
 * Bu kod bir Google E-Tablo'ya (Sheets) bağlı çalışır:
 *  - Kayıtlar e-tablodaki sayfalarda tutulur (Seferler, Yakıt, Masraflar, Hatırlatmalar)
 *  - Her şey Google Drive'daki "HexaFleet" klasöründe toplanır:
 *      HexaFleet/                 → e-tablo (kurulumda buraya taşınır)
 *      HexaFleet/2026/11-Kasım/   → o ayın fatura / fiş fotoğrafları ve PDF'leri
 *
 * Kurulum adımları için KURULUM.md dosyasına bakın.
 * Proje Ayarları > Komut dosyası özellikleri kısmına SIFRE adında bir özellik eklemeyi unutmayın.
 */

const KOLEKSIYONLAR = ['seferler', 'yakit', 'masraflar', 'hatirlatmalar'];
const SAYFA_ADLARI = {
  seferler: 'Seferler',
  yakit: 'Yakıt',
  masraflar: 'Masraflar',
  hatirlatmalar: 'Hatırlatmalar'
};
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
// Drive'daki HexaFleet klasörünün kimliği (klasör linkindeki /folders/ sonrası kısım)
const HEXAFLEET_KLASOR_ID = '1AndJIHiGhvX0QJwXsl0owEOUapBK7m5H';

/** Kurulumda bir kez elle çalıştırın: sayfaları oluşturur, e-tabloyu HexaFleet klasörüne taşır, izinleri ister. */
function kurulum() {
  KOLEKSIYONLAR.forEach(sayfa);
  const klasor = kokKlasor();
  const tablo = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const zatenOrada = tablo.getParents().hasNext() && tablo.getParents().next().getId() === klasor.getId();
  if (!zatenOrada) tablo.moveTo(klasor);
  Logger.log('E-tablo ve belgeler bu klasörde: ' + klasor.getUrl());
  if (!PropertiesService.getScriptProperties().getProperty('SIFRE')) {
    Logger.log('UYARI: Henüz SIFRE tanımlamadınız! Proje Ayarları > Komut dosyası özellikleri kısmından ekleyin.');
  } else {
    Logger.log('Kurulum tamam. Şimdi Dağıt > Yeni dağıtım > Web uygulaması yapın.');
  }
}

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
      const kayit = istek.kayit;
      if (!kayit || !kayit.id) throw new Error('Kayıt kimliği (id) yok');
      if (istek.dosya && istek.dosya.base64) {
        kayit.dosyaUrl = dosyaKaydet(istek.dosya, kayit.tarih);
      }
      return { kayit: kaydet(istek.kol, kayit) };
    }

    case 'sil':
      kolKontrol(istek.kol);
      sil(istek.kol, istek.id);
      return {};

    default:
      throw new Error('Bilinmeyen işlem: ' + istek.islem);
  }
}

// ---------------- E-tablo işlemleri ----------------

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

function kaydet(kol, kayit) {
  const sh = sayfa(kol);
  let bas = basliklar(sh);

  // Yeni alanlar için sütun aç
  const yeni = Object.keys(kayit).filter(function (k) { return bas.indexOf(k) < 0; });
  if (yeni.length) {
    sh.getRange(1, bas.length + 1, 1, yeni.length).setValues([yeni]).setFontWeight('bold');
    bas = bas.concat(yeni);
  }

  let satir = satirBul(sh, kayit.id);
  // Var olan kayıtla birleştir (gönderilmeyen alanlar korunur)
  const mevcut = satir > 0 ? satirOku(sh, satir, bas) : {};
  const birlesik = Object.assign({}, mevcut);
  Object.keys(kayit).forEach(function (k) { birlesik[k] = kayit[k]; });

  // Belge değiştirildi ya da kaldırıldıysa eski dosyayı Drive'da çöp kutusuna taşı
  if (mevcut.dosyaUrl && Object.prototype.hasOwnProperty.call(kayit, 'dosyaUrl') && kayit.dosyaUrl !== mevcut.dosyaUrl) {
    dosyaCopeAt(mevcut.dosyaUrl);
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
  return birlesik;
}

function sil(kol, id) {
  const sh = sayfa(kol);
  const satir = satirBul(sh, id);
  if (satir < 0) return;
  // Kayda bağlı fatura / fiş varsa Drive'da çöp kutusuna taşı (30 gün içinde geri alınabilir)
  const eski = satirOku(sh, satir, basliklar(sh));
  if (eski.dosyaUrl) dosyaCopeAt(eski.dosyaUrl);
  sh.deleteRow(satir);
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

// ---------------- Drive işlemleri ----------------

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

function dosyaKaydet(dosya, tarih) {
  const t = /^\d{4}-\d{2}/.test(String(tarih || '')) ? String(tarih) : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const yil = t.slice(0, 4);
  const ay = t.slice(5, 7);
  const klasor = altKlasor(altKlasor(kokKlasor(), yil), ay + '-' + AYLAR[Number(ay) - 1]);
  const blob = Utilities.newBlob(Utilities.base64Decode(dosya.base64), dosya.mime || 'application/octet-stream', dosya.ad || ('belge_' + Date.now()));
  return klasor.createFile(blob).getUrl();
}

/** Drive linkinden dosya kimliğini çıkarır: .../file/d/KIMLIK/view veya ...?id=KIMLIK */
function dosyaIdBul(url) {
  const m = String(url || '').match(/\/d\/([-\w]{20,})/) || String(url || '').match(/[?&]id=([-\w]{20,})/);
  return m ? m[1] : null;
}

/** Dosyayı kalıcı silmez, Drive çöp kutusuna taşır */
function dosyaCopeAt(url) {
  const id = dosyaIdBul(url);
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (e) {
    // dosya zaten silinmiş ya da erişim yok: kaydın silinmesine engel olmasın
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
