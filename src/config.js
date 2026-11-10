// Oyunun sabitleri: yarışçılar, eşyalar, zorluklar.

export const TOTAL_LAPS = 3;

// hiz / ivme / tutus 1-5 arası; fizik değerleri kart.js içinde bunlardan türetilir.
export const CHARACTERS = [
  { id: 'simitci', name: 'Simitçi Cemal', tag: 'Tablası hiç düşmez', color: '#e23b2e', hiz: 3, ivme: 3, tutus: 4, voice: 'c_simitci', yaw: -Math.PI / 2 },
  { id: 'kaptan', name: 'Kaptan Nuri', tag: 'Vapurdan hızlı, lodostan sakin', color: '#1f3f8f', hiz: 5, ivme: 2, tutus: 2, voice: 'c_kaptan', yaw: -Math.PI / 2 },
  { id: 'tekir', name: 'Tekir', tag: 'Mahallenin gerçek sahibi', color: '#f28a1b', hiz: 2, ivme: 5, tutus: 4, voice: 'meow', yaw: -Math.PI / 2 },
  { id: 'marti', name: 'Martı Rıfkı', tag: 'Simidine göz dikti bile', color: '#3aa7ee', hiz: 4, ivme: 4, tutus: 2, voice: 'seagull', yaw: -Math.PI / 2 },
  { id: 'cayci', name: 'Çaycı Zehra', tag: 'Tavşan kanı, tam gaz', color: '#17b8b0', hiz: 2, ivme: 4, tutus: 5, voice: 'c_cayci', yaw: -Math.PI / 2 },
  { id: 'dolmuscu', name: 'Dolmuşçu Rıza', tag: 'Müsait bir yerde... durmaz', color: '#f2c31b', hiz: 4, ivme: 3, tutus: 3, voice: 'c_dolmuscu', yaw: -Math.PI / 2 },
];

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

export const PLACE_SUFFIX = ['.', '.', '.', '.', '.', '.'];
