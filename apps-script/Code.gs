/**
 * HexaFleet — Google Apps Script arka ucu
 *
 * Bu kod bir Google E-Tablo'ya (Sheets) bağlı çalışır:
 *  - Kayıtlar e-tablodaki sayfalarda tutulur (Seferler, Yakıt, Masraflar, Hatırlatmalar)
 *  - Fatura / fiş fotoğrafları Google Drive'da "HexaFleet - Belgeler / YIL / AY" klasörlerine kaydedilir
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
const KOK_KLASOR_ADI = 'HexaFleet - Belgeler';

/** Kurulumda bir kez elle çalıştırın: sayfaları ve Drive klasörünü oluşturur, izinleri ister. */
function kurulum() {
  KOLEKSIYONLAR.forEach(sayfa);
  const klasor = kokKlasor();
  Logger.log('Belgeler klasörü: ' + klasor.getUrl());
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
  const birlesik = satir > 0 ? satirOku(sh, satir, bas) : {};
  Object.keys(kayit).forEach(function (k) { birlesik[k] = kayit[k]; });

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
  if (satir > 0) sh.deleteRow(satir);
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
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('KLASOR_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* silinmiş olabilir, yeniden oluştur */ }
  }
  const klasor = DriveApp.createFolder(KOK_KLASOR_ADI);
  p.setProperty('KLASOR_ID', klasor.getId());
  return klasor;
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

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
