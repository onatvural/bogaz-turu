// Cephe ve çarşı dokularındaki resimli öğelerin ölçüleri — kabartma geometrisi bunlardan üretilir.
// Her ev, 2048×1024 dokunun bir çeyreğidir: 512×1024 px; x soldan, y yukarıdan, ev karesine göre.
// Dikdörtgenler [x0, y0, x1, y1]. Doku değişirse buradaki sayılar yeniden ölçülmelidir.

// facade_a — Balat sıra evleri (3 kat, ortada üst üste iki cumba, altta tenteli dükkân)
//   top: duvarın başladığı satır (üstü resimli kiremit saçağı), ground: kaldırım çizgisi
//   bays: cumbalar; x = [dış sol, ön sol, ön sağ, dış sağ], y = [üst, alt], cap = saçak/silme [x dört nokta, y üst-alt]
//   boxes: pencere önü saksıları, awn: tente (x aralığı; y = üst kenar, ön çubuk, etek ucu)
//   holes: içeri gömülen kapı ve vitrinler, steps: kapı önü basamakları, plain: düz sıva örneği
//   sideWin: uç duvarlara konan panjurlu pencere blokları (üst kat, orta kat), dormer: çatı penceresinin camı
export const FACADE_A = [
  { // kiremit kırmızısı
    top: 26, ground: 990,
    bays: [
      { x: [155, 196, 312, 349], y: [66, 300], cap: { x: [131, 190, 320, 381], y: [38, 66] } },
      { x: [152, 196, 312, 352], y: [331, 512] },
    ],
    boxes: [[60, 186, 116, 234], [397, 186, 460, 234], [58, 455, 118, 502], [390, 457, 455, 502]],
    awn: { x: [27, 349], y: [658, 704, 726] },
    holes: [[66, 728, 147, 968], [158, 728, 320, 870], [383, 688, 475, 945]],
    steps: [365, 945, 492, 990],
    plain: [14, 262, 136, 322],
    sideWin: [[16, 72, 156, 250], [16, 338, 156, 518]], dormer: [58, 74, 120, 160],
  },
  { // hardal sarısı
    top: 26, ground: 993,
    bays: [
      { x: [158, 195, 311, 350], y: [66, 300], cap: { x: [133, 190, 318, 380], y: [38, 66] } },
      { x: [152, 195, 311, 354], y: [333, 512] },
    ],
    boxes: [[68, 470, 115, 503], [395, 455, 448, 503]],
    awn: { x: [35, 339], y: [664, 716, 731] },
    holes: [[57, 733, 145, 970], [154, 733, 300, 876], [367, 687, 463, 948]],
    steps: [353, 950, 480, 993],
    plain: [14, 262, 136, 322],
    sideWin: [[16, 72, 156, 250], [16, 338, 156, 518]], dormer: [58, 74, 120, 160],
  },
  { // mavi
    top: 26, ground: 993,
    bays: [
      { x: [157, 196, 314, 350], y: [66, 300], cap: { x: [132, 190, 320, 382], y: [38, 66] } },
      { x: [150, 196, 314, 356], y: [332, 510] },
    ],
    boxes: [[60, 187, 113, 234], [400, 185, 462, 234], [62, 453, 122, 503], [400, 453, 462, 503]],
    awn: { x: [29, 341], y: [659, 703, 727] },
    holes: [[55, 730, 135, 872], [147, 730, 308, 873], [378, 683, 473, 947]],
    steps: [363, 948, 490, 993],
    plain: [14, 262, 136, 322],
    sideWin: [[16, 72, 156, 250], [16, 338, 156, 518]], dormer: [58, 74, 120, 160],
  },
  { // küf yeşili
    top: 26, ground: 993,
    bays: [
      { x: [158, 198, 315, 352], y: [66, 300], cap: { x: [133, 192, 322, 383], y: [38, 66] } },
      { x: [152, 198, 315, 358], y: [332, 510] },
    ],
    boxes: [[62, 187, 117, 234], [400, 187, 448, 234], [62, 455, 120, 503], [400, 455, 463, 503]],
    awn: { x: [30, 327], y: [664, 712, 733] },
    holes: [[60, 737, 135, 970], [145, 737, 302, 873], [370, 687, 465, 947]],
    steps: [355, 948, 482, 993],
    plain: [14, 262, 136, 322],
    sideWin: [[16, 72, 156, 250], [16, 338, 156, 518]], dormer: [58, 74, 120, 160],
  },
];

// facade_b — Pera apartmanları (4 kat, üç katta ferforje balkon, altta büyük tenteli dükkân)
//   cornice: saçak silmesinin alt satırı
//   balc: her katın balkonu; rails = korkuluk x aralıkları, y = [korkuluk üstü, döşeme üstü, döşeme altı], slab = döşeme x aralığı
//   awn: tente yamuk biçimli; top/bot = üst ve ön kenarın x aralığı
//   pil: köşe pilastrlarının x aralıkları, br: döşeme altındaki taş konsolların x aralıkları
//   sideWin: uç duvarlara konan korkuluklu pencerenin x aralığı (satırlar balkonlardan türetilir)
export const FACADE_B = [
  { // kiremit turuncusu — resimde korkuluğun ortası seyrek çizilmiş; döşeme tek parça olduğundan korkuluk da tek parça alındı
    top: 0, ground: 989, cornice: 31,
    balc: [
      { rails: [[62, 460]], y: [161, 226, 247], slab: [59, 463] },
      { rails: [[62, 460]], y: [389, 453, 468], slab: [59, 463] },
      { rails: [[62, 460]], y: [615, 676, 691], slab: [59, 463] },
    ],
    awn: { top: [57, 465], bot: [39, 482], y: [705, 763, 785] },
    holes: [[255, 795, 337, 986]],
    pil: [[17, 57], [465, 500]],
    plain: [226, 40, 296, 150],
    br: [[80, 97], [204, 221], [308, 325], [428, 445]], sideWin: [58, 222],
  },
  { // krem
    top: 0, ground: 988, cornice: 31,
    balc: [
      { rails: [[59, 456]], y: [161, 225, 246], slab: [55, 459] },
      { rails: [[59, 456]], y: [389, 452, 470], slab: [55, 459] },
      { rails: [[59, 456]], y: [616, 676, 691], slab: [55, 459] },
    ],
    awn: { top: [55, 462], bot: [31, 480], y: [705, 765, 784] },
    holes: [[60, 786, 435, 988]],
    pil: [[14, 54], [462, 498]],
    plain: [215, 40, 300, 150],
    br: [[74, 92], [194, 213], [304, 321], [423, 441]], sideWin: [58, 222],
  },
  { // petrol yeşili — berber
    top: 0, ground: 988, cornice: 31,
    balc: [
      { rails: [[56, 453]], y: [161, 225, 246], slab: [54, 456] },
      { rails: [[56, 453]], y: [389, 451, 470], slab: [54, 456] },
      { rails: [[56, 453]], y: [615, 676, 691], slab: [53, 457] },
    ],
    awn: { top: [55, 462], bot: [42, 470], y: [704, 755, 776] },
    holes: [[76, 778, 428, 988]],
    pil: [[12, 52], [458, 498]],
    plain: [215, 40, 300, 150],
    br: [[72, 91], [193, 210], [302, 319], [419, 437]], sideWin: [58, 222],
  },
  { // leylak
    top: 0, ground: 988, cornice: 31,
    balc: [
      { rails: [[59, 456]], y: [161, 225, 246], slab: [56, 459] },
      { rails: [[59, 456]], y: [389, 451, 470], slab: [56, 459] },
      { rails: [[59, 456]], y: [615, 676, 690], slab: [56, 459] },
    ],
    awn: { top: [55, 462], bot: [41, 473], y: [705, 765, 785] },
    holes: [[100, 786, 432, 988]],
    pil: [[12, 54], [462, 500]],
    plain: [215, 40, 300, 150],
    br: [[75, 93], [196, 213], [305, 323], [423, 441]], sideWin: [58, 222],
  },
];

// bazaar — 2048×512, altı sivri kemerli dükkân; koordinatlar tüm dokuya göre.
//   x = [açıklığın sol kenarı, kemer tepesi, sağ kenarı], spring = üzengi satırı, apex = kemer iç tepe satırı
//   fold = [tezgâh önünün üst satırı, eğimli tablanın üst satırı] (dükkân resmi bu satırlardan katlanır)
export const BAZAAR_BAYS = [
  { x: [10, 157, 305], spring: 131, apex: 25, fold: [418, 352] },   // lambacı
  { x: [360, 512, 664], spring: 131, apex: 25, fold: [432, 344] },  // halıcı
  { x: [714, 855, 997], spring: 131, apex: 25, fold: [430, 346] },  // çinici
  { x: [1052, 1199, 1344], spring: 131, apex: 25, fold: [404, 340] }, // baharatçı
  { x: [1400, 1544, 1688], spring: 131, apex: 25, fold: [432, 356] }, // bakırcı
  { x: [1745, 1890, 2040], spring: 131, apex: 25, fold: [416, 352] }, // lokumcu
];
// kemer iç eğrisinin yarım profili: [yatay oran (üzengi → tepe), yükseklik oranı]
export const ARCH_PROFILE = [[0, 0], [0.013, 0.2], [0.05, 0.34], [0.115, 0.48], [0.18, 0.575], [0.29, 0.67], [0.43, 0.765], [0.575, 0.835], [0.74, 0.906], [0.885, 0.96], [1, 1]];
// ayak (sütun) dokusu: gövdesi temiz olan ayak
export const BAZAAR_PIER = [305, 360];
