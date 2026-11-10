// Oyunun sabitleri: yarışçılar, özel güçler, eşyalar, zorluklar.

export const TOTAL_LAPS = 3;

// hiz / ivme / tutus / agirlik 1-5 arası; fizik değerleri kart.js içinde bunlardan türetilir.
// Ağır kart çarpışmada az savrulur, hafifi iter.
export const CHARACTERS = [
  { id: 'simitci', name: 'Simitçi Cemal', tag: 'Tablası hiç düşmez', color: '#e23b2e', hiz: 3, ivme: 3, tutus: 4, agirlik: 3, voice: 'c_simitci', yaw: -Math.PI / 2 },
  { id: 'kaptan', name: 'Kaptan Nuri', tag: 'Vapurdan hızlı, lodostan sakin', color: '#1f3f8f', hiz: 5, ivme: 2, tutus: 2, agirlik: 5, voice: 'c_kaptan', yaw: -Math.PI / 2 },
  { id: 'tekir', name: 'Tekir', tag: 'Mahallenin gerçek sahibi', color: '#f28a1b', hiz: 2, ivme: 5, tutus: 4, agirlik: 1, voice: 'meow', yaw: -Math.PI / 2 },
  { id: 'marti', name: 'Martı Rıfkı', tag: 'Simidine göz dikti bile', color: '#3aa7ee', hiz: 4, ivme: 4, tutus: 2, agirlik: 2, voice: 'seagull', yaw: -Math.PI / 2 },
  { id: 'cayci', name: 'Çaycı Zehra', tag: 'Tavşan kanı, tam gaz', color: '#17b8b0', hiz: 2, ivme: 4, tutus: 5, agirlik: 2, voice: 'c_cayci', yaw: -Math.PI / 2 },
  { id: 'dolmuscu', name: 'Dolmuşçu Rıza', tag: 'Müsait bir yerde... durmaz', color: '#f2c31b', hiz: 4, ivme: 3, tutus: 3, agirlik: 4, voice: 'c_dolmuscu', yaw: -Math.PI / 2 },
];

// Özel güçler: her yarışçının kendine ait, zamanla dolan tek gücü. charge: boşken dolma süresi (sn).
export const POWERS = {
  simitci: { name: 'Simit Yağmuru', desc: 'Öndeki üç rakibe birer simit fırlatır', charge: 22 },
  kaptan: { name: 'Tam Yol İleri', desc: 'Zırhlı hücum: darbe almaz, değdiğini savurur', charge: 24 },
  tekir: { name: 'Pati Sıçrayışı', desc: 'Herkesin üstünden atlar, yere turboyla iner', charge: 19 },
  marti: { name: 'Kapkaç', desc: 'Öndekinin eşyasını kapar, kanat çırpıp hızlanır', charge: 21 },
  cayci: { name: 'Tavşan Kanı', desc: 'Uzun süper turbo; kabuklara aldırmaz', charge: 22 },
  dolmuscu: { name: 'Egzoz Bulutu', desc: 'Arkasını dumana boğar; giren yavaşlar', charge: 22 },
};

export const ITEMS = {
  cay: { name: 'Çay', desc: 'Tavşan kanı turbo' },
  simit: { name: 'Simit', desc: 'Öndekine fırlat' },
  karpuz: { name: 'Karpuz Kabuğu', desc: 'Arkana bırak' },
  nazar: { name: 'Nazar Boncuğu', desc: 'Bir darbeden korur' },
  marti: { name: 'Martı', desc: 'Öndekine dalar' },
  duduk: { name: 'Vapur Düdüğü', desc: 'Yakındakileri sarsar' },
};

// Sıraya göre eşya olasılıkları (0 = birinci, 5 = sonuncu)
export const ITEM_WEIGHTS = [
  { karpuz: 5, nazar: 4, simit: 2, cay: 1 },
  { karpuz: 4, nazar: 3, simit: 4, cay: 2, duduk: 1 },
  { karpuz: 2, nazar: 2, simit: 4, cay: 3, marti: 2, duduk: 2 },
  { karpuz: 1, nazar: 2, simit: 4, cay: 4, marti: 3, duduk: 2 },
  { simit: 3, cay: 5, marti: 4, duduk: 3, nazar: 1 },
  { simit: 2, cay: 6, marti: 5, duduk: 3 },
];

export const DIFFICULTY = {
  kolay: { label: 'Çay Bahçesi', sub: 'Kolay', ai: 0.86, band: 0.10 },
  normal: { label: 'Trafik', sub: 'Normal', ai: 0.94, band: 0.07 },
  zor: { label: 'Lodos', sub: 'Zor', ai: 1.0, band: 0.05 },
};

// Motor sesi: her kartın kendi döngüsü. rate: rölantiden son hıza çalma hızı aralığı, vol: düzey çarpanı.
export const ENGINES = {
  simitci: { rate: [0.72, 1.6], vol: 0.9 },   // iki zamanlı moped vızıltısı
  kaptan: { rate: [0.62, 1.3], vol: 1.1 },    // ağır vapur dizeli
  tekir: { rate: [0.8, 1.9], vol: 1.1 },      // mırıltı
  marti: { rate: [0.7, 1.75], vol: 1.0 },     // pat pat balıkçı motoru
  cayci: { rate: [0.8, 2.2], vol: 0.8 },      // semaver buharı
  dolmuscu: { rate: [0.65, 1.45], vol: 1.05 },// eski V8 hırıltısı
};

export const PLACE_SUFFIX = ['.', '.', '.', '.', '.', '.'];
