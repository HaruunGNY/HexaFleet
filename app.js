'use strict';
/* HexaFleet — tek dosyalık uygulama mantığı */

const SURUM = '1.0.0';
const IMZA = `<div class="imza">Bir <a href="https://hexaforge.com.tr/" target="_blank" rel="noopener"><b>HEXAFORGE</b></a> ürünüdür · Industrial Tech Solutions</div>`;

// =====================================================================
// Yardımcılar
// =====================================================================
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const pad = n => String(n).padStart(2, '0');

const fmt0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt2 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const NUM = (n, d = 0) => (d === 0 ? fmt0 : d === 1 ? fmt1 : fmt2).format(n || 0);
const para = n => (n < 0 ? '-' : '') + '₺' + fmt0.format(Math.abs(Math.round(n || 0)));
const para2 = n => '₺' + fmt2.format(n || 0);

/** "1.250,50" / "1250.5" / "1.250" gibi girişleri sayıya çevirir */
function sayi(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s|₺|tl/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
const evet = v => v === true || v === 'true' || v === 'TRUE';
const topla = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);

function tarihStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function bugun() { return tarihStr(new Date()); }
function tarihObj(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d || 1); }
function gunFarki(a, b) { return Math.round((tarihObj(b) - tarihObj(a)) / 86400000); }
function ayEkle(s, n) {
  const d = tarihObj(s); const gun = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(gun, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return tarihStr(d);
}
function tarihGoster(s, yil) {
  if (!s) return '';
  const d = tarihObj(s);
  return d.getDate() + ' ' + AY_KISA[d.getMonth()] + (yil ? ' ' + d.getFullYear() : '');
}
const ayAnahtari = s => (s ? String(s).slice(0, 7) : '');
function ayAdi(k) { const [y, m] = k.split('-'); return AYLAR[+m - 1] + ' ' + y; }
function ayKaydir(k, d) { const [y, m] = k.split('-').map(Number); const t = new Date(y, m - 1 + d, 1); return t.getFullYear() + '-' + pad(t.getMonth() + 1); }
const yeniId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let toastZaman;
function toast(mesaj, tur = '') {
  const t = $('#toast');
  t.textContent = mesaj; t.className = 'toast goster ' + tur;
  clearTimeout(toastZaman);
  toastZaman = setTimeout(() => { t.className = 'toast ' + tur; }, tur === 'hata' ? 4500 : 2400);
}

// =====================================================================
// Yerel depo (IndexedDB) — internet olmasa da veriler telefonda kalır
// =====================================================================
const depo = {
  _db: null, _bellek: {},
  ac() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('tir-takip', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this._db = r.result; res(this._db); };
      r.onerror = () => rej(r.error);
    });
  },
  async al(k) {
    try {
      const db = await this.ac();
      return await new Promise((res, rej) => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
    } catch (e) { return this._bellek[k]; }
  },
  async koy(k, v) {
    this._bellek[k] = v;
    try {
      const db = await this.ac();
      await new Promise((res, rej) => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').put(v, k);
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
    } catch (e) { console.warn('Depo yazılamadı', e); }
  }
};

// =====================================================================
// Durum
// =====================================================================
const bosVeri = () => ({ seferler: [], yakit: [], masraflar: [], hatirlatmalar: [] });
let V = bosVeri();
let kuyruk = [];                          // sunucuya gönderilmeyi bekleyen işlemler
let ayar = { ad: '', url: '', sifre: '' };
const senk = { calisiyor: false, hata: null, son: null };
const UI = { sayfa: 'ozet', ay: bugun().slice(0, 7), yil: +bugun().slice(0, 4), seferFiltre: 'ay', raporAy: bugun().slice(0, 7), masrafKat: '' };
let F = null;                             // açık form durumu

async function yukle() {
  V = Object.assign(bosVeri(), (await depo.al('veri')) || {});
  kuyruk = (await depo.al('kuyruk')) || [];
  ayar = Object.assign(ayar, (await depo.al('ayar')) || {});
  senk.son = (await depo.al('sonSenkron')) || null;
}
async function yereleYaz() {
  await depo.koy('veri', V);
  await depo.koy('kuyruk', kuyruk);
}

// =====================================================================
// Sunucu (Google Apps Script) ile senkron
// =====================================================================
async function api(govde, url = ayar.url, sifre = ayar.sifre) {
  const ctrl = new AbortController();
  const zaman = setTimeout(() => ctrl.abort(), 90000);
  let res;
  try {
    // Content-Type belirtmiyoruz: text/plain gider, Apps Script CORS ön kontrolü gerekmez
    res = await fetch(url, { method: 'POST', body: JSON.stringify({ ...govde, sifre }), signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Sunucu yanıt vermedi (zaman aşımı)' : 'Sunucuya bağlanılamadı');
  } finally { clearTimeout(zaman); }
  let j;
  try { j = await res.json(); } catch (e) {
    throw new Error('Sunucudan geçersiz yanıt. Linki ve dağıtım ayarını (Erişim: Herkes) kontrol edin.');
  }
  if (!j.ok) throw new Error(j.hata || 'Sunucu hatası');
  return j;
}

let senkZamanlayici = null;
function senkronIste(gecikme = 700) {
  clearTimeout(senkZamanlayici);
  senkZamanlayici = setTimeout(() => senkronize(), gecikme);
}

async function senkronize(sessiz = true) {
  if (!ayar.url || senk.calisiyor) return;
  if (!navigator.onLine) { durumGuncelle(); return; }
  senk.calisiyor = true; senk.hata = null; durumGuncelle();
  let degisti = false;
  try {
    while (kuyruk.length) {
      const op = kuyruk[0];
      if (op.islem === 'kaydet') {
        const r = await api({ islem: 'kaydet', kol: op.kol, kayit: op.kayit, dosya: op.dosya || null });
        const yerel = V[op.kol].find(x => x.id === op.kayit.id);
        if (yerel && r.kayit && r.kayit.dosyaUrl) yerel.dosyaUrl = r.kayit.dosyaUrl;
      } else if (op.islem === 'sil') {
        await api({ islem: 'sil', kol: op.kol, id: op.id });
      }
      kuyruk.shift();
      await yereleYaz();
      degisti = true;
    }
    const r = await api({ islem: 'hepsi' });
    if (!kuyruk.length) {
      V = Object.assign(bosVeri(), r.veri || {});
      await depo.koy('veri', V);
      degisti = true;
    }
    senk.son = new Date().toISOString();
    await depo.koy('sonSenkron', senk.son);
    if (!sessiz) toast('Senkronize edildi', 'basari');
  } catch (e) {
    senk.hata = e.message || String(e);
    if (!sessiz) toast(senk.hata, 'hata');
  } finally {
    senk.calisiyor = false;
    durumGuncelle();
    if (degisti) ciz();
    if (kuyruk.length && !senk.hata) senkronIste(500);
  }
}

function durumGuncelle() {
  const b = $('#senkronBtn'); if (!b) return;
  const n = kuyruk.length;
  let cls, txt;
  if (!ayar.url) { cls = ''; txt = 'Yerel mod'; }
  else if (senk.calisiyor) { cls = 'mavi'; txt = 'Senkronize…'; }
  else if (!navigator.onLine) { cls = 'sari'; txt = n ? `Çevrimdışı · ${n}` : 'Çevrimdışı'; }
  else if (senk.hata) { cls = 'kirmizi'; txt = 'Senkron hatası'; }
  else if (n) { cls = 'sari'; txt = `${n} bekliyor`; }
  else { cls = 'yesil'; txt = 'Güncel'; }
  b.className = 'durum ' + cls;
  b.innerHTML = `<span class="nokta"></span>${txt}`;
}

// ---------- Yerel değişiklikler (önce telefona, sonra kuyrukla sunucuya) ----------
function kayitKaydet(kol, rec, dosya, dosyaSilindi) {
  const i = V[kol].findIndex(x => x.id === rec.id);
  if (i >= 0) V[kol][i] = rec; else V[kol].push(rec);
  const gonder = { ...rec };
  if (dosyaSilindi) gonder.dosyaUrl = '';
  else if (!gonder.dosyaUrl) delete gonder.dosyaUrl; // sunucudaki mevcut linki ezmesin
  kuyruk.push({ islem: 'kaydet', kol, kayit: gonder, dosya: dosya || null });
  yereleYaz();
  senkronIste();
}
function kayitSil(kol, id) {
  V[kol] = V[kol].filter(x => x.id !== id);
  kuyruk.push({ islem: 'sil', kol, id });
  yereleYaz();
  senkronIste();
}
const bekleyenler = () => new Set(kuyruk.filter(o => o.islem === 'kaydet').map(o => o.kayit.id));
const dosyaBekleyenler = () => new Set(kuyruk.filter(o => o.islem === 'kaydet' && o.dosya).map(o => o.kayit.id));

// =====================================================================
// Hesaplamalar
// =====================================================================
const KATEGORILER = ['Otoyol / Köprü', 'Bakım - Onarım', 'Lastik', 'Yağ - Filtre', 'Sigorta / Kasko', 'MTV / Vergi', 'Ceza', 'Şoför Maaşı', 'Harcırah', 'Yemek', 'Otopark', 'Yıkama', 'Kredi / Leasing Taksiti', 'Muhasebe', 'Diğer'];
const KAT_IKON = {
  'Yakıt': '⛽', 'AdBlue': '💧', 'Otoyol / Köprü': '🛣️', 'Bakım - Onarım': '🔧', 'Lastik': '🛞', 'Yağ - Filtre': '🛢️',
  'Sigorta / Kasko': '🛡️', 'MTV / Vergi': '🏛️', 'Ceza': '🚨', 'Şoför Maaşı': '👷', 'Harcırah': '💵', 'Yemek': '🍽️',
  'Otopark': '🅿️', 'Yıkama': '🧽', 'Kredi / Leasing Taksiti': '🏦', 'Muhasebe': '📒', 'Diğer': '🧾'
};
const ODEME = ['Nakit', 'Kredi Kartı', 'Banka Kartı', 'Havale/EFT', 'HGS/OGS', 'Taşıt Tanıma'];

const kdvHaric = (tutar, oran) => (tutar || 0) / (1 + (sayi(oran) || 0) / 100);
const giderHaric = r => kdvHaric(sayi(r.tutar), r.kdvOrani);
const giderKdv = r => (sayi(r.tutar) || 0) - giderHaric(r);
const seferGelir = s => sayi(s.navlun) || 0;                          // KDV hariç
const seferKdv = s => seferGelir(s) * (sayi(s.kdvOrani) || 0) / 100;
const seferFaturaToplam = s => seferGelir(s) + seferKdv(s);
const motorinMi = y => (y.tur || 'Motorin') !== 'AdBlue';

function kmOkumalari() {
  const a = [];
  V.yakit.forEach(y => { const k = sayi(y.km); if (k) a.push({ tarih: y.tarih, km: k }); });
  V.seferler.forEach(s => {
    const b = sayi(s.baslangicKm), e = sayi(s.bitisKm);
    if (b) a.push({ tarih: s.tarih, km: b });
    if (e) a.push({ tarih: s.bosaltmaTarihi || s.tarih, km: e });
  });
  V.masraflar.forEach(m => { const k = sayi(m.km); if (k) a.push({ tarih: m.tarih, km: k }); });
  return a;
}
function guncelKm() { return kmOkumalari().reduce((m, o) => Math.max(m, o.km), 0); }
function ayKm(ay) {
  const o = kmOkumalari();
  const ic = o.filter(x => ayAnahtari(x.tarih) === ay).map(x => x.km);
  if (!ic.length) return 0;
  const once = o.filter(x => x.tarih < ay + '-01').map(x => x.km);
  const bas = once.length ? Math.max(...once) : Math.min(...ic);
  return Math.max(0, Math.max(...ic) - bas);
}

/** Depo-dolu yöntemiyle tüketim: iki dolu depo arasındaki litre / km */
function tuketim() {
  const m = V.yakit.filter(y => motorinMi(y) && sayi(y.km) && sayi(y.litre))
    .sort((a, b) => sayi(a.km) - sayi(b.km) || String(a.tarih).localeCompare(b.tarih));
  const kayit = {}; const araliklar = [];
  let sonDolu = -1, litre = 0;
  m.forEach((y, i) => {
    if (sonDolu >= 0) litre += sayi(y.litre);
    if (evet(y.doluDepo)) {
      if (sonDolu >= 0) {
        const km = sayi(y.km) - sayi(m[sonDolu].km);
        if (km > 0) { const t = litre / km * 100; kayit[y.id] = t; araliklar.push({ tarih: y.tarih, litre, km, t }); }
      }
      sonDolu = i; litre = 0;
    }
  });
  const tl = topla(araliklar, a => a.litre), tk = topla(araliklar, a => a.km);
  return { kayit, araliklar, genel: tk ? tl / tk * 100 : null };
}

function ayOzet(ay) {
  const ayda = r => ayAnahtari(r.tarih) === ay;
  const s = V.seferler.filter(ayda), y = V.yakit.filter(ayda), m = V.masraflar.filter(ayda);
  const kat = {};
  y.forEach(x => { const k = motorinMi(x) ? 'Yakıt' : 'AdBlue'; kat[k] = (kat[k] || 0) + giderHaric(x); });
  m.forEach(x => { const k = x.kategori || 'Diğer'; kat[k] = (kat[k] || 0) + giderHaric(x); });
  const gelir = topla(s, seferGelir);
  const gider = topla(y, giderHaric) + topla(m, giderHaric);
  const km = ayKm(ay);
  const ar = tuketim().araliklar.filter(a => ayAnahtari(a.tarih) === ay);
  const tl = topla(ar, a => a.litre), tk = topla(ar, a => a.km);
  return {
    gelir, gider, net: gelir - gider, kat, km,
    kmMaliyet: km ? gider / km : null,
    tuketim: tk ? tl / tk * 100 : null,
    seferSay: s.length,
    litre: topla(y.filter(motorinMi), x => sayi(x.litre)),
    yakitTutar: topla(y, x => sayi(x.tutar)),
    kdvHesaplanan: topla(s, seferKdv),
    kdvIndirilecek: topla(y, giderKdv) + topla(m, giderKdv)
  };
}

function seferGiderleri(id) {
  const y = V.yakit.filter(x => x.seferId === id), m = V.masraflar.filter(x => x.seferId === id);
  return { adet: y.length + m.length, tutar: topla(y, giderHaric) + topla(m, giderHaric) };
}

function alacakDurum(s) {
  if (evet(s.tahsilEdildi)) return { k: 'tahsil', etiket: 'Tahsil edildi', renk: 'yesil' };
  if (!evet(s.faturaKesildi)) return { k: 'fatura', etiket: 'Fatura kesilmedi', renk: '' };
  if (s.vade) {
    const g = gunFarki(bugun(), s.vade);
    if (g < 0) return { k: 'gecti', etiket: `Vade geçti · ${-g} gün`, renk: 'kirmizi' };
    if (g === 0) return { k: 'bekliyor', etiket: 'Vade bugün', renk: 'sari' };
    return { k: 'bekliyor', etiket: `Vade ${tarihGoster(s.vade)}`, renk: g <= 7 ? 'sari' : 'mavi' };
  }
  return { k: 'bekliyor', etiket: 'Ödeme bekleniyor', renk: 'mavi' };
}
function alacaklar() {
  const acik = V.seferler.filter(s => !evet(s.tahsilEdildi));
  const gecmis = acik.filter(s => alacakDurum(s).k === 'gecti');
  return { acik, toplam: topla(acik, seferFaturaToplam), gecmis, gecmisToplam: topla(gecmis, seferFaturaToplam) };
}

function aktifSefer() {
  const bugunS = bugun();
  return V.seferler
    .filter(s => !sayi(s.bitisKm) && s.tarih <= bugunS && gunFarki(s.tarih, bugunS) <= 20)
    .sort((a, b) => String(b.tarih).localeCompare(a.tarih))[0] || null;
}

function hatDurum(h, km = guncelKm()) {
  if (h.tur === 'km') {
    const s = sayi(h.sonKm);
    if (s == null) return { renk: '', metin: 'Km girilmemiş', oncelik: 3, sira: 0 };
    const kalan = s - km;
    if (kalan < 0) return { renk: 'kirmizi', metin: `${NUM(-kalan)} km geçti`, oncelik: 0, sira: kalan };
    if (kalan <= 3000) return { renk: 'sari', metin: `${NUM(kalan)} km kaldı`, oncelik: 1, sira: kalan / 100 };
    return { renk: 'yesil', metin: `${NUM(kalan)} km kaldı`, oncelik: 2, sira: kalan / 100 };
  }
  if (!h.sonTarih) return { renk: '', metin: 'Tarih girilmemiş', oncelik: 3, sira: 0 };
  const g = gunFarki(bugun(), h.sonTarih);
  if (g < 0) return { renk: 'kirmizi', metin: `${-g} gün geçti`, oncelik: 0, sira: g };
  if (g === 0) return { renk: 'kirmizi', metin: 'Bugün!', oncelik: 0, sira: 0 };
  if (g <= 30) return { renk: 'sari', metin: `${g} gün kaldı`, oncelik: 1, sira: g };
  return { renk: 'yesil', metin: tarihGoster(h.sonTarih, true), oncelik: 2, sira: g };
}
function hatirlatmaListesi() {
  const km = guncelKm();
  return V.hatirlatmalar.map(h => ({ h, d: hatDurum(h, km) }))
    .sort((a, b) => a.d.oncelik - b.d.oncelik || a.d.sira - b.d.sira);
}

// =====================================================================
// Form tanımları
// =====================================================================
const KDV_SEC = [['20', '%20'], ['10', '%10'], ['1', '%1'], ['0', 'Yok']];

const HAZIR_HATIRLATMALAR = [
  { baslik: 'Araç Muayenesi', tur: 'tarih', tekrarAy: 12 },
  { baslik: 'Egzoz Emisyon Ölçümü', tur: 'tarih', tekrarAy: 12 },
  { baslik: 'Takograf Kalibrasyonu', tur: 'tarih', tekrarAy: 24 },
  { baslik: 'Trafik Sigortası', tur: 'tarih', tekrarAy: 12 },
  { baslik: 'Kasko', tur: 'tarih', tekrarAy: 12 },
  { baslik: 'CMR / Taşıyıcı Sorumluluk Sigortası', tur: 'tarih', tekrarAy: 12 },
  { baslik: 'MTV Ödemesi', tur: 'tarih', tekrarAy: 6 },
  { baslik: 'K Belgesi', tur: 'tarih' },
  { baslik: 'SRC Belgesi', tur: 'tarih' },
  { baslik: 'Psikoteknik', tur: 'tarih' },
  { baslik: 'Ehliyet', tur: 'tarih' },
  { baslik: 'Yağ Değişimi', tur: 'km' },
  { baslik: 'Periyodik Bakım', tur: 'km' },
  { baslik: 'Lastik Kontrolü / Rotasyon', tur: 'km' }
];

const FORMLAR = {
  seferler: {
    baslik: 'Sefer',
    alanlar: [
      { k: 'tarih', l: 'Yükleme tarihi', t: 'date', zorunlu: 1, yarim: 1, vars: () => bugun() },
      { k: 'bosaltmaTarihi', l: 'Boşaltma tarihi', t: 'date', yarim: 1 },
      { k: 'yukleme', l: 'Nereden', t: 'text', zorunlu: 1, yarim: 1, liste: 'yerler', ph: 'Örn. İzmir' },
      { k: 'bosaltma', l: 'Nereye', t: 'text', zorunlu: 1, yarim: 1, liste: 'yerler', ph: 'Örn. Ankara' },
      { k: 'musteri', l: 'Müşteri / Firma', t: 'text', zorunlu: 1, liste: 'musteriler' },
      { k: 'yuk', l: 'Yük cinsi', t: 'text', yarim: 1 },
      { k: 'tonaj', l: 'Tonaj', t: 'num', yarim: 1 },
      { k: 'navlun', l: 'Navlun (KDV hariç ₺)', t: 'num', zorunlu: 1, yarim: 1 },
      { k: 'kdvOrani', l: 'KDV', t: 'select', sec: [['20', '%20'], ['0', 'Yok']], yarim: 1, vars: '20' },
      { k: 'baslangicKm', l: 'Başlangıç km', t: 'num', yarim: 1, vars: () => guncelKm() || '' },
      { k: 'bitisKm', l: 'Bitiş km', t: 'num', yarim: 1, ipucu: 'Sefer bitince girin' },
      { bolum: 'Fatura & Tahsilat' },
      { k: 'faturaKesildi', l: 'Fatura kesildi', t: 'check' },
      { k: 'faturaNo', l: 'Fatura no', t: 'text', yarim: 1, goster: v => v.faturaKesildi },
      { k: 'vade', l: 'Vade tarihi', t: 'date', yarim: 1, goster: v => v.faturaKesildi },
      { k: 'tahsilEdildi', l: 'Ödemesi alındı', t: 'check' },
      { k: 'tahsilTarihi', l: 'Tahsil tarihi', t: 'date', goster: v => v.tahsilEdildi, vars: () => bugun() },
      { k: 'not', l: 'Not', t: 'area' },
      { k: 'dosya', l: 'Belge (CMR / irsaliye / fatura)', t: 'file' }
    ],
    dogrula(v) {
      if (sayi(v.bitisKm) && sayi(v.baslangicKm) && sayi(v.bitisKm) < sayi(v.baslangicKm)) return ['bitisKm', 'Bitiş km, başlangıçtan küçük olamaz'];
      if (v.bosaltmaTarihi && v.bosaltmaTarihi < v.tarih) return ['bosaltmaTarihi', 'Boşaltma tarihi yüklemeden önce olamaz'];
    },
    canli(v) {
      const p = [];
      if (sayi(v.navlun)) p.push(`Fatura toplamı: ${para(seferFaturaToplam(v))}`);
      if (sayi(v.bitisKm) && sayi(v.baslangicKm)) p.push(`Yol: ${NUM(sayi(v.bitisKm) - sayi(v.baslangicKm))} km`);
      if (F && F.eski) {
        const g = seferGiderleri(F.eski.id);
        if (g.adet) p.push(`Bağlı gider: ${para(g.tutar)} → Kâr: ${para(seferGelir(v) - g.tutar)}`);
      }
      return p.join(' · ');
    },
    ust(eski) {
      if (!eski) return '';
      return `<div class="btn-grup" style="margin-bottom:12px">
        <button type="button" class="btn ikincil" data-act="yeni" data-kol="yakit" data-sefer="${esc(eski.id)}">⛽ Yakıt ekle</button>
        <button type="button" class="btn ikincil" data-act="yeni" data-kol="masraflar" data-sefer="${esc(eski.id)}">🧾 Masraf ekle</button>
      </div>`;
    },
    dosyaAdi: r => `Sefer_${r.yukleme}-${r.bosaltma}_${r.musteri}`
  },

  yakit: {
    baslik: 'Yakıt',
    alanlar: [
      { k: 'tarih', l: 'Tarih', t: 'date', zorunlu: 1, yarim: 1, vars: () => bugun() },
      { k: 'tur', l: 'Tür', t: 'select', sec: [['Motorin', 'Motorin'], ['AdBlue', 'AdBlue']], yarim: 1, vars: 'Motorin' },
      { k: 'km', l: 'Kilometre sayacı', t: 'num', ipucu: 'Tüketim ortalaması için önemli' },
      { k: 'litre', l: 'Litre', t: 'num', zorunlu: 1, yarim: 1 },
      { k: 'tutar', l: 'Toplam tutar (₺)', t: 'num', zorunlu: 1, yarim: 1 },
      { k: 'doluDepo', l: 'Depo tamamen dolduruldu', t: 'check', vars: true, goster: v => v.tur !== 'AdBlue' },
      { k: 'istasyon', l: 'İstasyon', t: 'text', liste: 'istasyonlar', yarim: 1 },
      { k: 'odeme', l: 'Ödeme', t: 'select', sec: ODEME.map(x => [x, x]), yarim: 1, vars: 'Taşıt Tanıma' },
      { k: 'kdvOrani', l: 'KDV', t: 'select', sec: KDV_SEC, yarim: 1, vars: '20' },
      { k: 'seferId', l: 'Sefer', t: 'sefer', yarim: 1, vars: () => (aktifSefer() || {}).id || '' },
      { k: 'dosya', l: 'Fiş / fatura', t: 'file' }
    ],
    dogrula(v) {
      if (v.tur !== 'AdBlue' && !sayi(v.km)) return ['km', 'Kilometre sayacını girin'];
    },
    uyar(v, eski) {
      const km = sayi(v.km); if (!km || v.tur === 'AdBlue') return null;
      const onceki = V.yakit.filter(y => (!eski || y.id !== eski.id) && motorinMi(y) && sayi(y.km) && y.tarih <= v.tarih)
        .reduce((m, y) => Math.max(m, sayi(y.km)), 0);
      if (onceki && km < onceki) return `Girilen km (${NUM(km)}) önceki yakıt kaydından (${NUM(onceki)}) düşük. Yine de kaydedilsin mi?`;
      if (onceki && km - onceki > 5000) return `Önceki yakıttan bu yana ${NUM(km - onceki)} km görünüyor. Km doğru mu?`;
      return null;
    },
    canli(v) {
      const p = [];
      if (sayi(v.litre) && sayi(v.tutar)) p.push(`Litre fiyatı: ${para2(sayi(v.tutar) / sayi(v.litre))}`);
      const km = sayi(v.km);
      if (km && v.tur !== 'AdBlue') {
        const onceki = V.yakit.filter(y => (!F.eski || y.id !== F.eski.id) && motorinMi(y) && sayi(y.km) && sayi(y.km) < km)
          .reduce((m, y) => Math.max(m, sayi(y.km)), 0);
        if (onceki) p.push(`Son yakıttan beri ${NUM(km - onceki)} km`);
      }
      return p.join(' · ');
    },
    dosyaAdi: r => `Yakit_${r.tur || 'Motorin'}_${r.istasyon || ''}`
  },

  masraflar: {
    baslik: 'Masraf',
    alanlar: [
      { k: 'tarih', l: 'Tarih', t: 'date', zorunlu: 1, yarim: 1, vars: () => bugun() },
      { k: 'kategori', l: 'Kategori', t: 'select', sec: [['', 'Seçin…']].concat(KATEGORILER.map(k => [k, `${KAT_IKON[k]} ${k}`])), zorunlu: 1, yarim: 1 },
      { k: 'tutar', l: 'Tutar (KDV dahil ₺)', t: 'num', zorunlu: 1, yarim: 1 },
      { k: 'kdvOrani', l: 'KDV', t: 'select', sec: KDV_SEC, yarim: 1, vars: '20' },
      { k: 'aciklama', l: 'Açıklama', t: 'text', ph: 'Örn. Ön lastik değişimi, Osmangazi köprüsü…' },
      { k: 'odeme', l: 'Ödeme', t: 'select', sec: ODEME.map(x => [x, x]), yarim: 1, vars: 'Nakit' },
      { k: 'km', l: 'Km (bakımda)', t: 'num', yarim: 1 },
      { k: 'seferId', l: 'Sefer', t: 'sefer', vars: () => (aktifSefer() || {}).id || '' },
      { k: 'dosya', l: 'Fiş / fatura', t: 'file' }
    ],
    canli(v) {
      const t = sayi(v.tutar); if (!t) return '';
      const h = kdvHaric(t, v.kdvOrani);
      return sayi(v.kdvOrani) ? `KDV hariç: ${para2(h)} · KDV: ${para2(t - h)}` : '';
    },
    dosyaAdi: r => `Masraf_${r.kategori}_${r.aciklama || ''}`
  },

  hatirlatmalar: {
    baslik: 'Hatırlatma',
    alanlar: [
      { k: 'baslik', l: 'Ne yapılacak?', t: 'text', zorunlu: 1 },
      { k: 'tur', l: 'Neye göre?', t: 'select', sec: [['tarih', '📅 Tarihe göre'], ['km', '🛣️ Kilometreye göre']], vars: 'tarih' },
      { k: 'sonTarih', l: 'Son tarih', t: 'date', yarim: 1, goster: v => v.tur !== 'km' },
      { k: 'tekrarAy', l: 'Kaç ayda bir?', t: 'num', yarim: 1, goster: v => v.tur !== 'km', ipucu: 'Boşsa tekrarlanmaz' },
      { k: 'sonKm', l: 'Yapılacağı km', t: 'num', yarim: 1, goster: v => v.tur === 'km' },
      { k: 'tekrarKm', l: 'Kaç km\'de bir?', t: 'num', yarim: 1, goster: v => v.tur === 'km' },
      { k: 'not', l: 'Not', t: 'area' }
    ],
    dogrula(v) {
      if (v.tur === 'km' && !sayi(v.sonKm)) return ['sonKm', 'Yapılacağı km\'yi girin'];
      if (v.tur !== 'km' && !v.sonTarih) return ['sonTarih', 'Son tarihi girin'];
    },
    canli(v) {
      if (v.tur === 'km') {
        const km = guncelKm(); const s = sayi(v.sonKm);
        return km ? `Araç şu an ${NUM(km)} km` + (s ? ` · ${NUM(s - km)} km kaldı` : '') : '';
      }
      return v.sonTarih ? `${gunFarki(bugun(), v.sonTarih)} gün kaldı` : '';
    },
    ust(eski) {
      if (eski) return '';
      return `<div class="etiket" style="margin-bottom:6px">Hazır şablonlar</div><div class="hazirlar">${HAZIR_HATIRLATMALAR.map((h, i) => `<button type="button" class="cip" data-act="hazir" data-i="${i}">${esc(h.baslik)}</button>`).join('')}</div>`;
    }
  }
};

// =====================================================================
// Form motoru
// =====================================================================
function seferSecenekleri(secili) {
  const list = [...V.seferler].sort((a, b) => String(b.tarih).localeCompare(a.tarih)).slice(0, 40);
  if (secili && !list.some(s => s.id === secili)) {
    const s = V.seferler.find(x => x.id === secili); if (s) list.push(s);
  }
  return `<option value="">— Seferle ilişkili değil —</option>` + list.map(s =>
    `<option value="${esc(s.id)}" ${s.id === secili ? 'selected' : ''}>${esc(tarihGoster(s.tarih))} · ${esc(s.yukleme)} → ${esc(s.bosaltma)}</option>`).join('');
}

function alanHtml(a, d, eski) {
  const id = 'f_' + a.k;
  const lbl = `<label for="${id}">${esc(a.l)}${a.zorunlu ? ' <span class="zor">*</span>' : ''}</label>`;
  const ipucu = a.ipucu ? `<div class="ipucu">${esc(a.ipucu)}</div>` : '';
  const sinif = `alan${a.yarim ? ' yarim' : ''}`;
  const deger = d ?? '';
  let ic = '';
  switch (a.t) {
    case 'text':
      ic = `<input id="${id}" name="${a.k}" type="text" value="${esc(deger)}" ${a.liste ? `list="dl_${a.liste}"` : ''} ${a.ph ? `placeholder="${esc(a.ph)}"` : ''} autocomplete="off" enterkeyhint="next">`; break;
    case 'num': {
      const g = deger === '' || deger == null ? '' : String(deger).replace('.', ',');
      ic = `<input id="${id}" name="${a.k}" type="text" inputmode="decimal" value="${esc(g)}" autocomplete="off" enterkeyhint="next">`; break;
    }
    case 'date':
      ic = `<input id="${id}" name="${a.k}" type="date" value="${esc(deger)}">`; break;
    case 'select':
      ic = `<select id="${id}" name="${a.k}">${a.sec.map(([v, t]) => `<option value="${esc(v)}" ${String(deger) === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`; break;
    case 'sefer':
      ic = `<select id="${id}" name="${a.k}">${seferSecenekleri(deger)}</select>`; break;
    case 'area':
      ic = `<textarea id="${id}" name="${a.k}" rows="2">${esc(deger)}</textarea>`; break;
    case 'check':
      return `<div class="${sinif}" data-alan="${a.k}"><label class="check"><input type="checkbox" name="${a.k}" ${evet(deger) ? 'checked' : ''}><span>${esc(a.l)}</span></label></div>`;
    case 'file': {
      let mevcut = '';
      if (eski && dosyaBekleyenler().has(eski.id)) mevcut = `<span>⏳</span><span class="bosluk">Belge yüklenmeyi bekliyor</span>`;
      else if (eski && eski.dosyaUrl) mevcut = `<span>📎</span><a class="bosluk" href="${esc(eski.dosyaUrl)}" target="_blank" rel="noopener">Kayıtlı belgeyi aç</a><button type="button" class="mini-btn" data-act="dosyaSil">Kaldır</button>`;
      return `<div class="${sinif}" data-alan="dosya"><label>${esc(a.l)}</label>
        <div class="dosya-kutu" id="dosyaKutu">${mevcut}</div>
        <div class="dosya-btnler">
          <label class="btn ikincil">📷 Fotoğraf çek<input type="file" accept="image/*" capture="environment" hidden data-dosya></label>
          <label class="btn ikincil">📁 Dosya seç<input type="file" accept="image/*,application/pdf" hidden data-dosya></label>
        </div></div>`;
    }
  }
  return `<div class="${sinif}" data-alan="${a.k}">${lbl}${ic}${ipucu}</div>`;
}

function formAc(kol, eski, on = {}) {
  const tanim = FORMLAR[kol];
  const d = eski ? { ...eski } : {};
  if (!eski) {
    tanim.alanlar.forEach(a => { if (a.k && a.vars !== undefined) d[a.k] = typeof a.vars === 'function' ? a.vars() : a.vars; });
    Object.assign(d, on);
  }
  F = { kol, eski: eski || null, dosya: null, dosyaSil: false };
  const bilgi = eski ? `<div class="kayit-bilgi">Ekleyen: ${esc(eski.ekleyen || '—')}${eski.olusturma ? ' · ' + esc(new Date(eski.olusturma).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })) : ''}${eski.guncelleyen && eski.guncelleyen !== eski.ekleyen ? ' · Son düzenleyen: ' + esc(eski.guncelleyen) : ''}</div>` : '';
  modalAc(`
    <div class="sheet-ust"><h2>${eski ? tanim.baslik + ' düzenle' : 'Yeni ' + tanim.baslik.toLocaleLowerCase('tr')}</h2>
      <button type="button" class="ikon-btn" data-act="kapat" aria-label="Kapat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    ${tanim.ust ? tanim.ust(eski) : ''}
    <form id="form" class="form" novalidate autocomplete="off">
      ${tanim.alanlar.map(a => a.bolum ? `<div class="bolum">${esc(a.bolum)}</div>` : alanHtml(a, d[a.k], eski)).join('')}
      <div class="canli" id="canli"></div>
      ${bilgi}
      <div class="form-alt">
        ${eski ? '<button type="button" class="btn tehlike" data-act="sil">Sil</button>' : ''}
        <button type="submit" class="btn ana">Kaydet</button>
      </div>
    </form>`);
  const form = $('#form');
  form.addEventListener('submit', e => { e.preventDefault(); formKaydet(); });
  form.addEventListener('input', formDegisti);
  form.addEventListener('change', e => {
    if (e.target.matches('[data-dosya]')) dosyaSecildi(e.target);
    else formDegisti();
  });
  formDegisti();
}

function formOku() {
  const tanim = FORMLAR[F.kol]; const f = $('#form'); const v = {};
  tanim.alanlar.forEach(a => {
    if (!a.k || a.t === 'file') return;
    const el = f.elements[a.k]; if (!el) return;
    if (a.t === 'check') v[a.k] = el.checked;
    else if (a.t === 'num') { const n = sayi(el.value); v[a.k] = n == null ? '' : n; }
    else v[a.k] = el.value.trim();
  });
  return v;
}

function formDegisti(e) {
  if (!F) return;
  const tanim = FORMLAR[F.kol];
  const v = formOku();
  tanim.alanlar.forEach(a => {
    if (!a.goster) return;
    const kutu = $(`[data-alan="${a.k}"]`); if (!kutu) return;
    const gor = !!a.goster(v);
    if (gor && kutu.hidden && a.vars !== undefined) {
      const el = $('#form').elements[a.k];
      if (el && el.type !== 'checkbox' && !el.value) el.value = typeof a.vars === 'function' ? a.vars() : a.vars;
    }
    kutu.hidden = !gor;
  });
  if (e && e.target && e.target.closest('.alan')) e.target.closest('.alan').classList.remove('hatali');
  const c = $('#canli');
  if (c) c.textContent = tanim.canli ? tanim.canli(formOku()) || '' : '';
}

async function dosyaSecildi(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const kutu = $('#dosyaKutu');
  kutu.innerHTML = '<span>⏳</span><span class="bosluk">Hazırlanıyor…</span>';
  try {
    F.dosya = await dosyaHazirla(file);
    F.dosyaSil = false;
    kutu.innerHTML = (F.dosya.onizleme ? `<img src="${F.dosya.onizleme}" alt="">` : '<span>📄</span>') +
      `<span class="bosluk">${esc(F.dosya.orjAd || 'Fotoğraf')} · ${NUM(F.dosya.base64.length * 0.75 / 1024)} KB</span><button type="button" class="mini-btn" data-act="dosyaIptal">Kaldır</button>`;
  } catch (e) {
    F.dosya = null; kutu.innerHTML = '';
    toast(e.message, 'hata');
  }
}

function resimYukle(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Resim okunamadı. Kamerayla çekmeyi veya JPG seçmeyi deneyin.'));
    i.src = src;
  });
}
async function dosyaHazirla(file) {
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    try {
      const img = await resimYukle(url);
      const max = 1600;
      const o = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * o), h = Math.round(img.naturalHeight * o);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      const d = c.toDataURL('image/jpeg', 0.8);
      return { mime: 'image/jpeg', uzanti: 'jpg', base64: d.split(',')[1], onizleme: d, orjAd: '' };
    } finally { URL.revokeObjectURL(url); }
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('Dosya 10 MB\'dan büyük olamaz');
  const d = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  return { mime: file.type || 'application/pdf', uzanti: (file.name.split('.').pop() || 'pdf').toLowerCase(), base64: d.split(',')[1], onizleme: null, orjAd: file.name };
}

function dosyaAdiOlustur(kol, r, uzanti) {
  const tanim = FORMLAR[kol];
  const tutar = sayi(r.tutar) || sayi(r.navlun);
  const ham = `${r.tarih}_${tanim.dosyaAdi ? tanim.dosyaAdi(r) : kol}${tutar ? '_' + Math.round(tutar) + 'TL' : ''}`;
  return ham.replace(/[\\/:*?"<>|#%]+/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').slice(0, 120) + '.' + uzanti;
}

function formKaydet() {
  const tanim = FORMLAR[F.kol];
  const v = formOku();
  // gizli alanları temizle
  tanim.alanlar.forEach(a => { if (a.k && a.goster && !a.goster(v)) v[a.k] = a.t === 'check' ? false : ''; });

  document.querySelectorAll('.alan.hatali').forEach(x => x.classList.remove('hatali'));
  const eksik = tanim.alanlar.find(a => a.zorunlu && (!a.goster || a.goster(v)) && (v[a.k] === '' || v[a.k] == null));
  let hata = eksik ? [eksik.k, `"${eksik.l}" alanını doldurun`] : (tanim.dogrula && tanim.dogrula(v));
  if (hata) {
    const kutu = $(`[data-alan="${hata[0]}"]`);
    if (kutu) { kutu.classList.add('hatali'); kutu.scrollIntoView({ block: 'center', behavior: 'smooth' }); const el = kutu.querySelector('input,select'); if (el) el.focus({ preventScroll: true }); }
    toast(hata[1], 'hata');
    return;
  }
  const uyari = tanim.uyar && tanim.uyar(v, F.eski);
  if (uyari && !confirm(uyari)) return;

  const simdi = new Date().toISOString();
  const rec = Object.assign({}, F.eski || {}, v, { id: F.eski ? F.eski.id : yeniId(), guncelleme: simdi, guncelleyen: ayar.ad });
  if (!F.eski) { rec.ekleyen = ayar.ad; rec.olusturma = simdi; }
  let dosya = null;
  if (F.dosya) {
    dosya = { ad: dosyaAdiOlustur(F.kol, rec, F.dosya.uzanti), mime: F.dosya.mime, base64: F.dosya.base64 };
    rec.dosyaUrl = '';
  }
  if (F.dosyaSil) rec.dosyaUrl = '';
  kayitKaydet(F.kol, rec, dosya, F.dosyaSil && !dosya);
  const yeni = !F.eski;
  modalKapat();
  toast(yeni ? 'Kaydedildi' : 'Güncellendi', 'basari');
  ciz();
}

// =====================================================================
// Modal
// =====================================================================
function modalAc(html) {
  $('#sheet').innerHTML = html;
  $('#sheet').scrollTop = 0;
  const m = $('#modal');
  m.hidden = false;
  document.body.classList.add('kilit');
  requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('acik')));
  if (!(history.state && history.state.modal)) history.pushState({ modal: 1 }, '');
}
function modalGizle() {
  const m = $('#modal');
  m.classList.remove('acik');
  document.body.classList.remove('kilit');
  F = null;
  setTimeout(() => { if (!m.classList.contains('acik')) { m.hidden = true; $('#sheet').innerHTML = ''; } }, 220);
}
function modalKapat() {
  if (history.state && history.state.modal) history.back(); else modalGizle();
}
window.addEventListener('popstate', () => { if (!$('#modal').hidden) modalGizle(); });

function hizliMenu() {
  F = null;
  modalAc(`<div class="sheet-ust"><h2>Ne eklemek istiyorsun?</h2>
    <button type="button" class="ikon-btn" data-act="kapat" aria-label="Kapat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="menu-liste">
      <button type="button" data-act="yeni" data-kol="yakit"><span>⛽</span>Yakıt</button>
      <button type="button" data-act="yeni" data-kol="masraflar"><span>🧾</span>Masraf</button>
      <button type="button" data-act="yeni" data-kol="seferler"><span>🚛</span>Sefer</button>
      <button type="button" data-act="yeni" data-kol="hatirlatmalar"><span>🔔</span>Hatırlatma</button>
    </div>`);
}

// =====================================================================
// Ortak görünüm parçaları
// =====================================================================
function ayNav() {
  const buAy = UI.ay === bugun().slice(0, 7);
  return `<div class="ay-nav">
    <button type="button" class="ikon-btn" data-act="ay" data-d="-1" aria-label="Önceki ay">‹</button>
    <button type="button" class="ay-ad" data-act="ayBugun">${ayAdi(UI.ay)}${buAy ? '' : ' ↺'}</button>
    <button type="button" class="ikon-btn" data-act="ay" data-d="1" aria-label="Sonraki ay">›</button></div>`;
}
function meta(r, bek) {
  const p = [];
  if (r.ekleyen) p.push('👤 ' + esc(r.ekleyen));
  if (r.dosyaUrl) p.push('📎');
  if (bek.has(r.id)) p.push('⏳');
  return p.join(' ');
}
function bosHtml(ikon, metin, kol, btn) {
  return `<div class="bos"><div class="bos-ikon">${ikon}</div><div>${metin}</div>${kol ? `<button type="button" class="btn ana" data-act="yeni" data-kol="${kol}">${btn}</button>` : ''}</div>`;
}
const satirAc = (kol, id) => `class="satir" data-act="duzenle" data-kol="${kol}" data-id="${esc(id)}" role="button" tabindex="0"`;

function seferSatir(s, bek) {
  const d = alacakDurum(s);
  const g = seferGiderleri(s.id);
  const km = sayi(s.bitisKm) && sayi(s.baslangicKm) ? sayi(s.bitisKm) - sayi(s.baslangicKm) : null;
  const devam = !sayi(s.bitisKm);
  return `<div ${satirAc('seferler', s.id)}>
    <div class="satir-ikon mavi">🚛</div>
    <div class="satir-ana">
      <div class="satir-ust"><b>${esc(s.yukleme)} → ${esc(s.bosaltma)}</b><span>${para(seferGelir(s))}</span></div>
      <div class="satir-alt"><span>${tarihGoster(s.tarih)} · ${esc(s.musteri)}</span><span class="rozet ${d.renk}">${d.etiket}</span></div>
      <div class="satir-alt"><span>${devam ? '<span class="rozet mavi">Yolda</span> ' : ''}${km ? NUM(km) + ' km · ' : ''}${g.adet ? `Gider ${para(g.tutar)} · Kâr <b class="${seferGelir(s) - g.tutar < 0 ? 'eksi' : 'arti'}">${para(seferGelir(s) - g.tutar)}</b>` : ''}</span><span>${meta(s, bek)}</span></div>
    </div></div>`;
}
function yakitSatir(y, bek, tk) {
  const t = tk.kayit[y.id];
  const anormal = t && tk.genel && tk.araliklar.length >= 3 && t > tk.genel * 1.15;
  return `<div ${satirAc('yakit', y.id)}>
    <div class="satir-ikon turuncu">${motorinMi(y) ? '⛽' : '💧'}</div>
    <div class="satir-ana">
      <div class="satir-ust"><b>${NUM(sayi(y.litre), 1)} L ${esc(y.tur || 'Motorin')}</b><span>${para(sayi(y.tutar))}</span></div>
      <div class="satir-alt"><span>${tarihGoster(y.tarih)}${sayi(y.km) ? ' · ' + NUM(sayi(y.km)) + ' km' : ''}${y.istasyon ? ' · ' + esc(y.istasyon) : ''}</span>
        ${t ? `<span class="rozet ${anormal ? 'kirmizi' : 'mavi'}">${NUM(t, 1)} L/100</span>` : `<span>${meta(y, bek)}</span>`}</div>
      ${t ? `<div class="satir-alt"><span>${sayi(y.litre) && sayi(y.tutar) ? para2(sayi(y.tutar) / sayi(y.litre)) + '/L' : ''}</span><span>${meta(y, bek)}</span></div>` : ''}
    </div></div>`;
}
function masrafSatir(m, bek) {
  return `<div ${satirAc('masraflar', m.id)}>
    <div class="satir-ikon">${KAT_IKON[m.kategori] || '🧾'}</div>
    <div class="satir-ana">
      <div class="satir-ust"><b>${esc(m.aciklama || m.kategori)}</b><span>${para(sayi(m.tutar))}</span></div>
      <div class="satir-alt"><span>${tarihGoster(m.tarih)} · ${esc(m.kategori)}${m.odeme ? ' · ' + esc(m.odeme) : ''}</span><span>${meta(m, bek)}</span></div>
    </div></div>`;
}
function hatSatir({ h, d }) {
  const tekrar = h.tur === 'km' ? sayi(h.tekrarKm) : sayi(h.tekrarAy);
  return `<div ${satirAc('hatirlatmalar', h.id)}>
    <div class="satir-ikon">${h.tur === 'km' ? '🛣️' : '📅'}</div>
    <div class="satir-ana">
      <div class="satir-ust"><b>${esc(h.baslik)}</b><span class="rozet ${d.renk}">${d.metin}</span></div>
      <div class="satir-alt"><span>${h.tur === 'km' ? (sayi(h.sonKm) ? NUM(sayi(h.sonKm)) + ' km\'de' : '') : tarihGoster(h.sonTarih, true)}${tekrar ? ' · ' + (h.tur === 'km' ? NUM(tekrar) + ' km\'de bir' : tekrar + ' ayda bir') : ''}</span>
        <button type="button" class="mini-btn yesil" data-act="yapildi" data-id="${esc(h.id)}">✓ Yapıldı</button></div>
    </div></div>`;
}
function dagilim(kat, toplam, baslik = 'Gider dağılımı') {
  const e = Object.entries(kat).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  if (!e.length) return '';
  return `<section class="kart"><h3>${baslik} <small>KDV hariç</small></h3>${e.map(([k, v]) => `
    <div class="bar-satir"><div class="bar-ust"><span>${KAT_IKON[k] || '•'} ${esc(k)}</span><b>${para(v)}</b></div>
    <div class="bar"><i style="width:${Math.max(1, v / toplam * 100).toFixed(1)}%"></i></div></div>`).join('')}</section>`;
}

// =====================================================================
// Sayfalar
// =====================================================================
const SAYFALAR = {
  ozet: { baslik: 'Özet', ciz: ozetCiz },
  seferler: { baslik: 'Seferler', ciz: seferlerCiz },
  yakit: { baslik: 'Yakıt', ciz: yakitCiz },
  masraflar: { baslik: 'Masraflar', ciz: masraflarCiz },
  daha: { baslik: 'Daha fazla', ciz: dahaCiz },
  hatirlatmalar: { baslik: 'Hatırlatmalar', ciz: hatirlatmalarCiz, alt: 1 },
  raporlar: { baslik: 'Raporlar', ciz: raporlarCiz, alt: 1 },
  ayarlar: { baslik: 'Ayarlar', ciz: ayarlarCiz, alt: 1 }
};

function ozetCiz() {
  const o = ayOzet(UI.ay);
  const al = alacaklar();
  const hat = hatirlatmaListesi().filter(x => x.d.oncelik <= 1);
  const aktif = aktifSefer();
  const bek = bekleyenler();

  const sonlar = [
    ...V.seferler.map(r => ['seferler', r]), ...V.yakit.map(r => ['yakit', r]), ...V.masraflar.map(r => ['masraflar', r])
  ].sort((a, b) => String(b[1].olusturma || b[1].tarih).localeCompare(String(a[1].olusturma || a[1].tarih))).slice(0, 5);
  const tk = tuketim();

  const bosVeriMi = !V.seferler.length && !V.yakit.length && !V.masraflar.length;

  return `${ayNav()}
    <section class="kart vurgu">
      <div class="etiket">Net kâr · KDV hariç</div>
      <div class="buyuk">${para(o.net)}</div>
      <div class="ikili">
        <div><span class="etiket">Gelir</span><b>${para(o.gelir)}</b></div>
        <div><span class="etiket">Gider</span><b>${para(o.gider)}</b></div>
      </div>
    </section>
    <div class="istat-grid">
      <div class="istat"><span class="etiket">Gidilen yol</span><b>${o.km ? NUM(o.km) + ' km' : '—'}</b></div>
      <div class="istat"><span class="etiket">Km başı maliyet</span><b>${o.kmMaliyet ? para2(o.kmMaliyet) : '—'}</b></div>
      <div class="istat"><span class="etiket">Ort. tüketim</span><b>${o.tuketim ? NUM(o.tuketim, 1) + ' L/100km' : '—'}</b></div>
      <div class="istat"><span class="etiket">Sefer sayısı</span><b>${o.seferSay}</b></div>
    </div>
    ${aktif ? `<section class="kart tikla" data-act="duzenle" data-kol="seferler" data-id="${esc(aktif.id)}">
      <h3>🚛 Yoldaki sefer <span class="rozet mavi">Devam ediyor</span></h3>
      <div><b>${esc(aktif.yukleme)} → ${esc(aktif.bosaltma)}</b></div>
      <div class="etiket">${tarihGoster(aktif.tarih)} · ${esc(aktif.musteri)} · Bitince "Bitiş km" girmeyi unutmayın</div></section>` : ''}
    ${al.gecmis.length ? `<section class="kart uyari tikla" data-act="alacaklar">
      <h3>⚠️ Vadesi geçen alacak <b class="eksi">${para(al.gecmisToplam)}</b></h3>
      <div class="etiket">${al.gecmis.length} seferin ödemesi gecikti. Görmek için dokun.</div></section>` : ''}
    ${al.acik.length ? `<section class="kart tikla" data-act="alacaklar">
      <h3>💰 Açık alacaklar <b>${para(al.toplam)}</b></h3>
      <div class="etiket">${al.acik.length} seferin ödemesi henüz alınmadı (KDV dahil)</div></section>` : ''}
    ${hat.length ? `<section class="kart ${hat.some(x => x.d.oncelik === 0) ? 'uyari-sari' : ''}">
      <h3>🔔 Yaklaşan işler <button type="button" class="mini-btn" data-act="sayfa" data-s="hatirlatmalar">Tümü</button></h3>
      <div class="ic-liste">${hat.slice(0, 5).map(({ h, d }) => `<div class="tikla" data-act="duzenle" data-kol="hatirlatmalar" data-id="${esc(h.id)}"><span>${esc(h.baslik)}</span><span class="rozet ${d.renk}">${d.metin}</span></div>`).join('')}</div></section>` : ''}
    ${dagilim(o.kat, o.gider)}
    ${bosVeriMi ? bosHtml('👋', 'Henüz kayıt yok. İlk kaydı eklemek için sağ alttaki <b>+</b> butonuna bas.', '', '') : ''}
    ${sonlar.length ? `<section><h3 style="margin:16px 4px 8px;font-size:15px">Son eklenenler</h3><div class="liste">${sonlar.map(([k, r]) =>
      k === 'seferler' ? seferSatir(r, bek) : k === 'yakit' ? yakitSatir(r, bek, tk) : masrafSatir(r, bek)).join('')}</div></section>` : ''}`;
}

function seferlerCiz() {
  const bek = bekleyenler();
  const f = UI.seferFiltre;
  const cip = (k, t) => `<button type="button" class="cip ${f === k ? 'aktif' : ''}" data-act="filtre" data-f="${k}">${t}</button>`;
  let list, ust = '';
  if (f === 'ay') {
    list = V.seferler.filter(s => ayAnahtari(s.tarih) === UI.ay);
    const g = topla(list, seferGelir);
    ust = ayNav() + (list.length ? `<div class="istat-grid"><div class="istat"><span class="etiket">Sefer</span><b>${list.length}</b></div><div class="istat"><span class="etiket">Navlun toplamı</span><b>${para(g)}</b></div></div>` : '');
    list.sort((a, b) => String(b.tarih).localeCompare(a.tarih));
  } else if (f === 'acik') {
    const al = alacaklar();
    list = al.acik.sort((a, b) => {
      const da = alacakDurum(a), db = alacakDurum(b);
      const p = x => x.k === 'gecti' ? 0 : x.k === 'bekliyor' ? 1 : 2;
      return p(da) - p(db) || String(a.vade || a.tarih).localeCompare(b.vade || b.tarih);
    });
    ust = `<div class="istat-grid"><div class="istat"><span class="etiket">Açık alacak (KDV dahil)</span><b>${para(al.toplam)}</b></div><div class="istat"><span class="etiket">Vadesi geçen</span><b class="${al.gecmisToplam ? 'eksi' : ''}">${para(al.gecmisToplam)}</b></div></div>`;
  } else {
    list = [...V.seferler].sort((a, b) => String(b.tarih).localeCompare(a.tarih));
  }
  return `<div class="cipler">${cip('ay', 'Aylık')}${cip('acik', 'Açık alacaklar')}${cip('hepsi', 'Tümü')}</div>${ust}
    ${list.length ? `<div class="liste">${list.map(s => seferSatir(s, bek)).join('')}</div>`
      : bosHtml('🚛', f === 'acik' ? 'Bekleyen alacak yok 👍' : 'Bu dönemde sefer yok', f === 'acik' ? '' : 'seferler', '+ Sefer ekle')}`;
}

function yakitCiz() {
  const bek = bekleyenler(); const tk = tuketim();
  const list = V.yakit.filter(y => ayAnahtari(y.tarih) === UI.ay)
    .sort((a, b) => String(b.tarih).localeCompare(a.tarih) || (sayi(b.km) || 0) - (sayi(a.km) || 0));
  const o = ayOzet(UI.ay);
  const motorin = list.filter(motorinMi);
  const ortFiyat = topla(motorin, y => sayi(y.litre)) ? topla(motorin, y => sayi(y.tutar)) / topla(motorin, y => sayi(y.litre)) : null;
  return `${ayNav()}
    <div class="istat-grid">
      <div class="istat"><span class="etiket">Toplam yakıt</span><b>${para(o.yakitTutar)}</b></div>
      <div class="istat"><span class="etiket">Motorin</span><b>${NUM(o.litre)} L</b></div>
      <div class="istat"><span class="etiket">Bu ay ortalama</span><b>${o.tuketim ? NUM(o.tuketim, 1) + ' L/100' : '—'}</b></div>
      <div class="istat"><span class="etiket">Genel ortalama</span><b>${tk.genel ? NUM(tk.genel, 1) + ' L/100' : '—'}</b></div>
      ${ortFiyat ? `<div class="istat"><span class="etiket">Ort. litre fiyatı</span><b>${para2(ortFiyat)}</b></div>` : ''}
      ${o.km ? `<div class="istat"><span class="etiket">Km başı yakıt</span><b>${para2(o.yakitTutar / o.km)}</b></div>` : ''}
    </div>
    ${list.length ? `<div class="liste">${list.map(y => yakitSatir(y, bek, tk)).join('')}</div>`
      : bosHtml('⛽', 'Bu ay yakıt kaydı yok.<br><small>Ortalama tüketim için her alımda <b>km</b> girin ve depoyu fullediğinizde işaretleyin.</small>', 'yakit', '+ Yakıt ekle')}`;
}

function masraflarCiz() {
  const bek = bekleyenler();
  let list = V.masraflar.filter(m => ayAnahtari(m.tarih) === UI.ay);
  const katlar = [...new Set(list.map(m => m.kategori || 'Diğer'))];
  if (UI.masrafKat && !katlar.includes(UI.masrafKat)) UI.masrafKat = '';
  const toplam = topla(list, m => sayi(m.tutar));
  if (UI.masrafKat) list = list.filter(m => (m.kategori || 'Diğer') === UI.masrafKat);
  list.sort((a, b) => String(b.tarih).localeCompare(a.tarih));
  const cip = (k, t) => `<button type="button" class="cip ${UI.masrafKat === k ? 'aktif' : ''}" data-act="katFiltre" data-k="${esc(k)}">${t}</button>`;
  return `${ayNav()}
    <div class="istat-grid">
      <div class="istat"><span class="etiket">Masraf toplamı</span><b>${para(toplam)}</b></div>
      <div class="istat"><span class="etiket">Kayıt</span><b>${V.masraflar.filter(m => ayAnahtari(m.tarih) === UI.ay).length}</b></div>
    </div>
    ${katlar.length > 1 ? `<div class="cipler">${cip('', 'Tümü')}${katlar.map(k => cip(k, (KAT_IKON[k] || '') + ' ' + esc(k))).join('')}</div>` : ''}
    ${list.length ? `<div class="liste">${list.map(m => masrafSatir(m, bek)).join('')}</div>` : bosHtml('🧾', 'Bu ay masraf kaydı yok', 'masraflar', '+ Masraf ekle')}`;
}

function hatirlatmalarCiz() {
  const list = hatirlatmaListesi();
  const km = guncelKm();
  return `${km ? `<div class="kart" style="display:flex;justify-content:space-between;align-items:center"><span class="etiket">Aracın son bilinen km'si</span><b>${NUM(km)} km</b></div>` : ''}
    ${list.length ? `<div class="liste">${list.map(hatSatir).join('')}</div>`
      : bosHtml('🔔', 'Muayene, sigorta, takograf, yağ değişimi gibi tarihleri buraya ekle. Zamanı yaklaşınca Özet ekranında uyarı çıkar.', 'hatirlatmalar', '+ Hatırlatma ekle')}`;
}

function dahaCiz() {
  const sayac = hatirlatmaListesi().filter(x => x.d.oncelik <= 1).length;
  return `<div class="kutular">
      <button type="button" class="kutu" data-act="sayfa" data-s="hatirlatmalar"><span class="k-ikon">🔔</span><b>Hatırlatmalar</b><small>Muayene, sigorta, bakım</small>${sayac ? `<i class="nav-rozet">${sayac}</i>` : ''}</button>
      <button type="button" class="kutu" data-act="sayfa" data-s="raporlar"><span class="k-ikon">📊</span><b>Raporlar</b><small>Aylık / yıllık, Excel</small></button>
      <button type="button" class="kutu" data-act="alacaklar"><span class="k-ikon">💰</span><b>Alacaklar</b><small>Tahsil edilmeyenler</small></button>
      <button type="button" class="kutu" data-act="sayfa" data-s="ayarlar"><span class="k-ikon">⚙️</span><b>Ayarlar</b><small>Bağlantı, yedek</small></button>
    </div>
    <section class="kart"><div class="ic-liste">
      <div><span class="etiket">Kullanıcı</span><b>${esc(ayar.ad)}</b></div>
      <div><span class="etiket">Aracın km'si</span><b>${guncelKm() ? NUM(guncelKm()) + ' km' : '—'}</b></div>
      <div><span class="etiket">Toplam kayıt</span><b>${V.seferler.length + V.yakit.length + V.masraflar.length}</b></div>
      <div><span class="etiket">Son senkron</span><b>${senk.son ? new Date(senk.son).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</b></div>
    </div></section>
    <img src="icons/logo.jpg" alt="Hexaforge" style="display:block;width:180px;margin:18px auto 6px;border-radius:14px;opacity:.95">
    ${IMZA}
    <p class="kucuk" style="text-align:center;margin-top:4px">HexaFleet · sürüm ${SURUM}</p>`;
}

function grafikSvg(oz) {
  const W = 340, H = 150, ust = 10, alt = 20, sol = 4;
  const max = Math.max(1, ...oz.map(o => Math.max(o.gelir, o.gider)));
  const bw = (W - sol) / 12;
  const y = v => ust + (H - ust - alt) * (1 - v / max);
  let s = `<line class="g-cizgi" x1="0" x2="${W}" y1="${H - alt}" y2="${H - alt}"/>`;
  oz.forEach((o, i) => {
    const x = sol + i * bw;
    const b = bw * 0.34;
    s += `<rect class="g-gelir" x="${(x + bw * 0.14).toFixed(1)}" y="${y(o.gelir).toFixed(1)}" width="${b.toFixed(1)}" height="${(H - alt - y(o.gelir)).toFixed(1)}" rx="2"/>`;
    s += `<rect class="g-gider" x="${(x + bw * 0.14 + b + 1).toFixed(1)}" y="${y(o.gider).toFixed(1)}" width="${b.toFixed(1)}" height="${(H - alt - y(o.gider)).toFixed(1)}" rx="2"/>`;
    s += `<text class="g-yazi" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${AY_KISA[i]}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Aylık gelir ve gider">${s}</svg>`;
}

function raporlarCiz() {
  const y = UI.yil;
  const oz = Array.from({ length: 12 }, (_, i) => { const a = `${y}-${pad(i + 1)}`; return { a, ...ayOzet(a) }; });
  const T = k => topla(oz, o => o[k]);
  if (ayAnahtari(UI.raporAy + '-01').slice(0, 4) !== String(y)) UI.raporAy = `${y}-${pad(new Date().getFullYear() === y ? new Date().getMonth() + 1 : 12)}`;
  const sec = oz.find(o => o.a === UI.raporAy);
  const kdvFark = sec.kdvHesaplanan - sec.kdvIndirilecek;
  const yilKm = T('km');
  return `<div class="ay-nav">
      <button type="button" class="ikon-btn" data-act="yil" data-d="-1" aria-label="Önceki yıl">‹</button>
      <span class="ay-ad">${y}</span>
      <button type="button" class="ikon-btn" data-act="yil" data-d="1" aria-label="Sonraki yıl">›</button></div>
    <section class="kart">
      <h3>${y} yılı <small>KDV hariç</small></h3>
      <div class="istat-grid" style="margin-bottom:8px">
        <div><span class="etiket">Gelir</span><b class="arti" style="display:block;font-size:18px">${para(T('gelir'))}</b></div>
        <div><span class="etiket">Gider</span><b class="eksi" style="display:block;font-size:18px">${para(T('gider'))}</b></div>
        <div><span class="etiket">Net kâr</span><b style="display:block;font-size:18px">${para(T('net'))}</b></div>
        <div><span class="etiket">Km başı maliyet</span><b style="display:block;font-size:18px">${yilKm ? para2(T('gider') / yilKm) : '—'}</b></div>
      </div>
      <div class="grafik">${grafikSvg(oz)}</div>
      <div class="lejant"><span><i style="background:var(--yesil)"></i>Gelir</span><span><i style="background:var(--kirmizi)"></i>Gider</span></div>
    </section>
    <section class="kart kaydir">
      <h3>Aylar <small>Detay için dokun</small></h3>
      <table class="tablo"><thead><tr><th>Ay</th><th>Gelir</th><th>Gider</th><th>Net</th><th>Km</th></tr></thead><tbody>
      ${oz.map((o, i) => `<tr class="tikla ${o.a === UI.raporAy ? 'secili' : ''}" data-act="raporAy" data-a="${o.a}">
        <td>${AYLAR[i]}</td><td>${o.gelir ? fmt0.format(o.gelir) : '–'}</td><td>${o.gider ? fmt0.format(o.gider) : '–'}</td>
        <td class="${o.net < 0 ? 'eksi' : o.net > 0 ? 'arti' : ''}">${o.net ? fmt0.format(o.net) : '–'}</td><td>${o.km ? fmt0.format(o.km) : '–'}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Toplam</td><td>${fmt0.format(T('gelir'))}</td><td>${fmt0.format(T('gider'))}</td><td>${fmt0.format(T('net'))}</td><td>${fmt0.format(yilKm)}</td></tr></tfoot></table>
    </section>
    <h3 style="margin:18px 4px 10px;font-size:16px">${ayAdi(UI.raporAy)} detayı</h3>
    <div class="istat-grid">
      <div class="istat"><span class="etiket">Net kâr</span><b class="${sec.net < 0 ? 'eksi' : 'arti'}">${para(sec.net)}</b></div>
      <div class="istat"><span class="etiket">Km başı maliyet</span><b>${sec.kmMaliyet ? para2(sec.kmMaliyet) : '—'}</b></div>
      <div class="istat"><span class="etiket">Km başı gelir</span><b>${sec.km ? para2(sec.gelir / sec.km) : '—'}</b></div>
      <div class="istat"><span class="etiket">Ort. tüketim</span><b>${sec.tuketim ? NUM(sec.tuketim, 1) + ' L/100' : '—'}</b></div>
    </div>
    ${dagilim(sec.kat, sec.gider)}
    <section class="kart">
      <h3>KDV özeti <small>Tahmini</small></h3>
      <div class="ic-liste">
        <div><span>Hesaplanan KDV (navlunlardan)</span><b>${para(sec.kdvHesaplanan)}</b></div>
        <div><span>İndirilecek KDV (giderlerden)</span><b>${para(sec.kdvIndirilecek)}</b></div>
        <div><span>${kdvFark >= 0 ? 'Ödenecek KDV' : 'Devreden KDV'}</span><b class="${kdvFark >= 0 ? 'eksi' : 'arti'}">${para(Math.abs(kdvFark))}</b></div>
      </div>
      <p class="kucuk" style="margin:10px 0 0">Tevkifat vb. durumlar hesaba katılmaz. Kesin rakam için muhasebeciye danışın.</p>
    </section>
    <div class="btn-grup">
      <button type="button" class="btn ikincil" data-act="csv" data-tur="ay">⬇️ ${AYLAR[+UI.raporAy.slice(5) - 1]} Excel</button>
      <button type="button" class="btn ikincil" data-act="csv" data-tur="yil">⬇️ ${y} Excel</button>
    </div>
    <p class="kucuk" style="text-align:center">Excel dosyasını muhasebeciye gönderebilirsiniz. Tüm kayıtlar Google E-Tablo'da da duruyor.</p>`;
}

function ayarlarCiz() {
  return `<section class="kart"><h3>Kullanıcı</h3>
      <div class="alan"><label for="aAd">Adın (kayıtlarda "ekleyen" olarak görünür)</label><input id="aAd" type="text" value="${esc(ayar.ad)}"></div></section>
    <section class="kart"><h3>Google bağlantısı</h3>
      <div style="display:grid;gap:12px">
        <div class="alan"><label for="aUrl">Apps Script linki</label><input id="aUrl" type="url" value="${esc(ayar.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></div>
        <div class="alan"><label for="aSifre">Ortak şifre</label><input id="aSifre" type="password" value="${esc(ayar.sifre)}" autocomplete="off"></div>
        ${senk.hata ? `<div class="rozet kirmizi" style="white-space:normal;padding:8px 12px;border-radius:10px">Son hata: ${esc(senk.hata)}</div>` : ''}
        <div class="btn-grup">
          <button type="button" class="btn ikincil" data-act="testEt">Bağlantıyı dene</button>
          <button type="button" class="btn ana" data-act="ayarKaydet">Kaydet</button>
        </div>
        ${ayar.url ? `<button type="button" class="btn ikincil tam" data-act="senkronSimdi">🔄 Şimdi senkronize et</button>
        <button type="button" class="btn ikincil tam" data-act="paylas">📤 Kurulum linkini paylaş</button>` : ''}
      </div>
      <p class="kucuk" style="margin:12px 0 0">Bekleyen işlem: <b>${kuyruk.length}</b>${kuyruk.some(o => o.dosya) ? ` (${kuyruk.filter(o => o.dosya).length} belge)` : ''}</p>
    </section>
    <section class="kart"><h3>Yedek & veri</h3>
      <div style="display:grid;gap:10px">
        <button type="button" class="btn ikincil tam" data-act="yedek">💾 Yedek indir (JSON)</button>
        ${kuyruk.length ? `<button type="button" class="btn tehlike tam" data-act="kuyrukSil">Gönderilemeyen ${kuyruk.length} işlemi iptal et</button>` : ''}
        <button type="button" class="btn tehlike tam" data-act="sifirla">Bu telefondaki verileri sil</button>
      </div>
      <p class="kucuk" style="margin:10px 0 0">"Bu telefondaki verileri sil" Google'daki kayıtlara dokunmaz; bir sonraki senkronda geri gelir.</p>
    </section>`;
}

function kurulumCiz() {
  document.body.classList.add('kurulum-modu');
  const kurUrl = (location.hash.match(/kur=([^&]+)/) || [])[1];
  $('#icerik').innerHTML = `<div class="kurulum">
    <img class="logo-buyuk" src="icons/logo.jpg" alt="Hexaforge — Industrial Tech Solutions" width="520" height="394">
    <h1><span>HexaFleet</span></h1>
    <p>Sefer, yakıt, masraf ve belgeler tek yerde.</p>
    <div class="kart">
      <div class="alan"><label for="kAd">Adın</label><input id="kAd" type="text" placeholder="Adınızı yazın" autocomplete="given-name"><div class="ipucu">Eklediğin kayıtlarda "ekleyen" olarak görünür</div></div>
      <div class="alan"><label for="kUrl">Apps Script linki</label><input id="kUrl" type="url" value="${esc(kurUrl ? decodeURIComponent(kurUrl) : '')}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></div>
      <div class="alan"><label for="kSifre">Ortak şifre</label><input id="kSifre" type="password" autocomplete="off"></div>
      <button type="button" class="btn ana tam" data-act="kurulumBitir">Başla</button>
      <p class="kucuk">Linki boş bırakırsan uygulama <b>deneme modunda</b>, sadece bu telefonda çalışır. Sonradan Ayarlar'dan bağlarsın, girdiğin kayıtlar da gönderilir.</p>
    </div>${IMZA}</div>`;
}

// =====================================================================
// Çizim
// =====================================================================
function ciz() {
  if (!ayar.ad) { kurulumCiz(); return; }
  document.body.classList.remove('kurulum-modu');
  const s = SAYFALAR[UI.sayfa] || SAYFALAR.ozet;
  $('#baslik').textContent = s.baslik;
  $('#geri').hidden = !s.alt;
  $('#icerik').innerHTML = s.ciz();
  const navS = s.alt ? 'daha' : UI.sayfa;
  document.querySelectorAll('#altNav button').forEach(b => b.classList.toggle('aktif', b.dataset.s === navS));
  const sayac = hatirlatmaListesi().filter(x => x.d.oncelik <= 1).length;
  const r = $('#dahaRozet'); r.hidden = !sayac; r.textContent = sayac;
  $('#fab').hidden = UI.sayfa === 'ayarlar';
  listelerGuncelle();
  durumGuncelle();
}

function listelerGuncelle() {
  const uniq = arr => [...new Set(arr.filter(Boolean).map(x => String(x).trim()))].sort((a, b) => a.localeCompare(b, 'tr'));
  const dl = (id, arr) => `<datalist id="dl_${id}">${arr.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  $('#listeler').innerHTML =
    dl('musteriler', uniq(V.seferler.map(s => s.musteri))) +
    dl('yerler', uniq(V.seferler.flatMap(s => [s.yukleme, s.bosaltma]))) +
    dl('istasyonlar', uniq(V.yakit.map(y => y.istasyon)));
}

// =====================================================================
// Dışa aktarma
// =====================================================================
function csvIndir(ad, satirlar) {
  const hucre = h => { let v = h == null ? '' : String(h); if (/[;"\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"'; return v; };
  const metin = '﻿' + satirlar.map(r => r.map(hucre).join(';')).join('\r\n');
  indir(ad, new Blob([metin], { type: 'text/csv;charset=utf-8' }));
}
function indir(ad, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = ad;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function dokum(filtre) {
  const s = n => n == null || n === '' ? '' : (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  const satir = [['Tür', 'Tarih', 'Kategori', 'Açıklama', 'Tutar (KDV dahil)', 'KDV %', 'KDV', 'KDV hariç', 'Ödeme / Durum', 'Km', 'Litre', 'Ekleyen', 'Belge']];
  const kayitlar = [];
  V.seferler.filter(r => filtre(r.tarih)).forEach(r => kayitlar.push([r.tarih, ['Gelir (Sefer)', r.tarih, 'Navlun', `${r.yukleme} → ${r.bosaltma} · ${r.musteri}${r.faturaNo ? ' · Fatura ' + r.faturaNo : ''}`,
    s(seferFaturaToplam(r)), r.kdvOrani || 0, s(seferKdv(r)), s(seferGelir(r)), alacakDurum(r).etiket,
    sayi(r.bitisKm) && sayi(r.baslangicKm) ? sayi(r.bitisKm) - sayi(r.baslangicKm) : '', '', r.ekleyen || '', r.dosyaUrl || '']]));
  V.yakit.filter(r => filtre(r.tarih)).forEach(r => kayitlar.push([r.tarih, ['Gider', r.tarih, r.tur === 'AdBlue' ? 'AdBlue' : 'Yakıt', r.istasyon || '',
    s(sayi(r.tutar)), r.kdvOrani || 0, s(giderKdv(r)), s(giderHaric(r)), r.odeme || '', r.km || '', s(sayi(r.litre)), r.ekleyen || '', r.dosyaUrl || '']]));
  V.masraflar.filter(r => filtre(r.tarih)).forEach(r => kayitlar.push([r.tarih, ['Gider', r.tarih, r.kategori || '', r.aciklama || '',
    s(sayi(r.tutar)), r.kdvOrani || 0, s(giderKdv(r)), s(giderHaric(r)), r.odeme || '', r.km || '', '', r.ekleyen || '', r.dosyaUrl || '']]));
  kayitlar.sort((a, b) => String(a[0]).localeCompare(b[0])).forEach(k => satir.push(k[1]));
  return satir;
}

// =====================================================================
// Eylemler (tıklamalar)
// =====================================================================
function sayfaGit(s) {
  UI.sayfa = s;
  ciz();
  window.scrollTo(0, 0);
}

const EYLEM = {
  sayfa: el => sayfaGit(el.dataset.s),
  ay: el => { UI.ay = ayKaydir(UI.ay, +el.dataset.d); ciz(); },
  ayBugun: () => { UI.ay = bugun().slice(0, 7); ciz(); },
  yil: el => { UI.yil += +el.dataset.d; ciz(); },
  raporAy: el => { UI.raporAy = el.dataset.a; ciz(); },
  filtre: el => { UI.seferFiltre = el.dataset.f; ciz(); },
  katFiltre: el => { UI.masrafKat = el.dataset.k; ciz(); },
  alacaklar: () => { UI.seferFiltre = 'acik'; sayfaGit('seferler'); },
  fab: () => {
    const hedef = { seferler: 'seferler', yakit: 'yakit', masraflar: 'masraflar', hatirlatmalar: 'hatirlatmalar' }[UI.sayfa];
    hedef ? formAc(hedef) : hizliMenu();
  },
  yeni: el => formAc(el.dataset.kol, null, el.dataset.sefer ? { seferId: el.dataset.sefer } : {}),
  duzenle: el => {
    const r = V[el.dataset.kol].find(x => x.id === el.dataset.id);
    if (r) formAc(el.dataset.kol, r);
  },
  kapat: () => modalKapat(),
  sil: () => {
    if (!F || !F.eski) return;
    const ad = FORMLAR[F.kol].baslik.toLocaleLowerCase('tr');
    if (!confirm(`Bu ${ad} kaydı herkes için silinecek. Emin misin?`)) return;
    kayitSil(F.kol, F.eski.id);
    modalKapat(); toast('Silindi'); ciz();
  },
  dosyaSil: () => { F.dosyaSil = true; F.dosya = null; $('#dosyaKutu').innerHTML = '<span>🗑️</span><span class="bosluk">Belge kaydedince kaldırılacak</span>'; },
  dosyaIptal: () => { F.dosya = null; $('#dosyaKutu').innerHTML = ''; },
  hazir: el => {
    const h = HAZIR_HATIRLATMALAR[+el.dataset.i]; const f = $('#form');
    f.elements.baslik.value = h.baslik;
    f.elements.tur.value = h.tur;
    f.elements.tekrarAy.value = h.tekrarAy || '';
    f.elements.tekrarKm.value = h.tekrarKm || '';
    formDegisti();
    const hedef = f.elements[h.tur === 'km' ? 'sonKm' : 'sonTarih'];
    hedef.focus();
  },
  yapildi: el => {
    const h = V.hatirlatmalar.find(x => x.id === el.dataset.id); if (!h) return;
    const yeni = { ...h };
    let mesaj;
    if (h.tur === 'km') {
      const t = sayi(h.tekrarKm);
      if (!t) { formAc('hatirlatmalar', h); toast('Tekrar aralığı yok — yeni km\'yi elle girin'); return; }
      yeni.sonKm = guncelKm() + t; mesaj = `Sonraki: ${NUM(yeni.sonKm)} km`;
    } else {
      const t = sayi(h.tekrarAy);
      if (!t) { formAc('hatirlatmalar', h); toast('Tekrar aralığı yok — yeni tarihi elle girin'); return; }
      yeni.sonTarih = ayEkle(bugun(), t); mesaj = `Sonraki: ${tarihGoster(yeni.sonTarih, true)}`;
    }
    if (!confirm(`"${h.baslik}" yapıldı olarak işaretlensin mi?\n${mesaj}`)) return;
    yeni.sonYapilma = bugun(); yeni.guncelleme = new Date().toISOString(); yeni.guncelleyen = ayar.ad;
    kayitKaydet('hatirlatmalar', yeni);
    toast(mesaj, 'basari'); ciz();
  },
  senkron: () => {
    if (!ayar.url || senk.hata) sayfaGit('ayarlar');
    else senkronize(false);
  },
  senkronSimdi: () => senkronize(false),
  testEt: async el => {
    const url = $('#aUrl').value.trim(), sifre = $('#aSifre').value;
    if (!url) return toast('Önce linki girin', 'hata');
    el.disabled = true; el.textContent = 'Deneniyor…';
    try { await api({ islem: 'test' }, url, sifre); toast('Bağlantı başarılı ✓', 'basari'); }
    catch (e) { toast(e.message, 'hata'); }
    finally { el.disabled = false; el.textContent = 'Bağlantıyı dene'; }
  },
  ayarKaydet: async el => {
    const ad = $('#aAd').value.trim(), url = $('#aUrl').value.trim(), sifre = $('#aSifre').value;
    if (!ad) return toast('Adını gir', 'hata');
    if (url && !/^https:\/\/script\.google\.com\//.test(url)) return toast('Link https://script.google.com/… ile başlamalı', 'hata');
    if (url) {
      el.disabled = true; el.textContent = 'Kontrol ediliyor…';
      try { await api({ islem: 'test' }, url, sifre); }
      catch (e) { el.disabled = false; el.textContent = 'Kaydet'; return toast(e.message, 'hata'); }
      if (!ayar.url && kuyruk.length && !confirm(`Bu telefonda deneme modunda girilmiş ${kuyruk.length} işlem var. Sunucuya gönderilsin mi?\n\n"İptal" dersen bu deneme kayıtları silinir.`)) {
        kuyruk = []; V = bosVeri(); await yereleYaz();
      }
    }
    const urlDegisti = url !== ayar.url;
    ayar = { ad, url, sifre };
    await depo.koy('ayar', ayar);
    senk.hata = null;
    toast('Ayarlar kaydedildi', 'basari');
    ciz();
    if (url) senkronize(!urlDegisti);
  },
  paylas: async () => {
    const link = location.origin + location.pathname + '#kur=' + encodeURIComponent(ayar.url);
    const metin = `HexaFleet uygulaması: ${link}\nŞifreyi ayrıca söyleyeceğim. Açınca adını yaz, sonra tarayıcı menüsünden "Ana ekrana ekle" de.`;
    try {
      if (navigator.share) await navigator.share({ title: 'HexaFleet', text: metin });
      else { await navigator.clipboard.writeText(metin); toast('Link kopyalandı, WhatsApp\'tan gönderebilirsin', 'basari'); }
    } catch (e) { /* kullanıcı iptal etti */ }
  },
  yedek: () => indir(`hexafleet-yedek-${bugun()}.json`, new Blob([JSON.stringify({ surum: SURUM, tarih: new Date().toISOString(), veri: V }, null, 2)], { type: 'application/json' })),
  kuyrukSil: async () => {
    if (!confirm(`Gönderilemeyen ${kuyruk.length} işlem iptal edilecek. Bu kayıtlar Google'a hiç gitmeyecek. Emin misin?`)) return;
    kuyruk = []; senk.hata = null; await yereleYaz(); ciz(); senkronize();
  },
  sifirla: async () => {
    const uyari = kuyruk.length ? `\n\nDİKKAT: Henüz gönderilmemiş ${kuyruk.length} işlem var, bunlar kaybolur!` : '';
    if (!confirm('Bu telefondaki tüm veriler ve ayarlar silinecek.' + uyari + '\n\nEmin misin?')) return;
    V = bosVeri(); kuyruk = []; ayar = { ad: '', url: '', sifre: '' }; senk.son = null; senk.hata = null;
    await yereleYaz(); await depo.koy('ayar', ayar); await depo.koy('sonSenkron', null);
    UI.sayfa = 'ozet'; ciz();
  },
  csv: el => {
    if (el.dataset.tur === 'ay') csvIndir(`HexaFleet_${UI.raporAy}.csv`, dokum(t => ayAnahtari(t) === UI.raporAy));
    else csvIndir(`HexaFleet_${UI.yil}.csv`, dokum(t => String(t).startsWith(String(UI.yil))));
  },
  kurulumBitir: async el => {
    const ad = $('#kAd').value.trim(), url = $('#kUrl').value.trim(), sifre = $('#kSifre').value;
    if (!ad) { $('#kAd').focus(); return toast('Adını yaz', 'hata'); }
    if (url) {
      if (!/^https:\/\/script\.google\.com\//.test(url)) return toast('Link https://script.google.com/… ile başlamalı', 'hata');
      el.disabled = true; el.textContent = 'Bağlanıyor…';
      try { await api({ islem: 'test' }, url, sifre); }
      catch (e) { el.disabled = false; el.textContent = 'Başla'; return toast(e.message, 'hata'); }
    }
    ayar = { ad, url, sifre };
    await depo.koy('ayar', ayar);
    history.replaceState(history.state, '', location.pathname + location.search);
    ciz();
    if (url) senkronize(false);
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const f = EYLEM[el.dataset.act];
  if (f) f(el, e);
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.satir[role=button]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && !$('#modal').hidden) modalKapat();
});

// =====================================================================
// Başlat
// =====================================================================
(async function baslat() {
  await yukle();
  ciz();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW kaydı başarısız', e));
  }
  window.addEventListener('online', () => { durumGuncelle(); senkronize(); });
  window.addEventListener('offline', durumGuncelle);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') senkronize(); });
  setInterval(() => { if (document.visibilityState === 'visible') senkronize(); }, 60000);
  senkronize();
})();
