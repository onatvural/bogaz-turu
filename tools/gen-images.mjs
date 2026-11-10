#!/usr/bin/env node
// Higgsfield CLI ile oyunun tüm görsellerini üretir.
// Kullanım: node tools/gen-images.mjs [isim ...]   (isim verilmezse eksik olanların hepsi)
// Çıktı: raw/img/<isim>.png  — sonra tools/process-assets.sh ile public/assets altına işlenir.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
const run = promisify(execFile);

const OUT = 'raw/img';
mkdirSync(OUT, { recursive: true });

const STYLE =
  'Stylized 3D cartoon game art, chunky toy-like proportions, smooth clean shapes, vibrant saturated colors, soft warm lighting, playful family-friendly arcade kart racing game look.';
const MODEL_REF =
  'Single object centered, the whole object fully inside the frame with generous margin, three-quarter front view from slightly above, plain pure white background, no ground shadow, no text, no logo, flat even studio lighting. Stylized 3D cartoon game asset, chunky toy-like proportions, smooth clean shapes, vibrant saturated colors.';
const PORTRAIT =
  'Character portrait bust, head and shoulders, facing slightly to the side, big friendly expressive face, centered. ' + STYLE + ' No text.';
const ICON =
  'Game item icon, single object centered, glossy chunky 3D cartoon render, bold shapes, soft rim light, vibrant saturated colors, transparent background, no text.';

const J = (name, prompt, o = {}) => ({ name, prompt, model: 'gpt_image_2_5', aspect_ratio: '1:1', quality: 'medium', resolution: '1k', ...o });

export const JOBS = [
  // ---------- Arayüz ----------
  J('keyart',
    'Wide cinematic title-screen illustration for a kart racing game set in Istanbul. Six quirky go-karts race toward the camera along a seaside road by the Bosphorus at golden hour: a moustached simit seller in a red simit-cart kart, a tabby street cat with racing goggles in a cardboard-box kart, a cheeky seagull in a tiny blue fishing-boat kart, an old bearded ferry captain in a little white ferry-shaped kart, a cheerful tea vendor woman in a brass samovar kart, and a sunglasses-wearing driver in a tiny yellow minibus kart. Dust, speed lines, flying simits and tulip tea glasses. Background: Galata Tower, Ottoman mosque domes and slender minarets, a long suspension bridge, white ferries on sparkling water, seagulls in a warm orange and turquoise sky. The upper third is open sky. ' + STYLE + ' No text, no letters, no logos.',
    { aspect_ratio: '16:9', quality: 'high', resolution: '2k' }),
  J('logo',
    'Game title logo lettering that reads exactly "BOĞAZ TURU" in two stacked lines (first line BOĞAZ, second line TURU). Chunky bouncy 3D cartoon letters, glossy tulip red with a thick white outline and a turquoise drop shadow, the letter O in BOĞAZ is replaced by a golden sesame simit ring, a tiny seagull perched on the last letter, small checkered racing flag accent. The Ğ must have its breve accent. Transparent background, nothing else.',
    { aspect_ratio: '3:2', quality: 'high', background: 'transparent' }),

  // ---------- Karakter portreleri ----------
  J('p_simitci', 'A jolly Istanbul simit seller man in his forties with a thick black moustache, grey flat cap, white shirt and red striped apron, balancing a round tray stacked with golden sesame simit rings on his head. Plain flat warm red background. ' + PORTRAIT),
  J('p_kaptan', 'A kind old Istanbul ferry captain with a bushy white beard, white captain hat with gold anchor badge, navy blue double-breasted jacket with gold buttons, rosy cheeks. Plain flat navy blue background. ' + PORTRAIT),
  J('p_tekir', 'A chubby confident tabby street cat with green eyes wearing brown leather aviator racing goggles pushed up on its forehead and a small red neckerchief, smug smile. Plain flat orange background. ' + PORTRAIT),
  J('p_marti', 'A cheeky white seagull with grey wings, yellow beak holding a stolen sesame simit ring, wearing a tiny leather pilot cap, mischievous eyes. Plain flat sky blue background. ' + PORTRAIT),
  J('p_cayci', 'A cheerful young woman tea vendor with curly dark hair tied with a turquoise bandana, mustard yellow apron, holding up a traditional hanging tea tray with tulip-shaped glasses of red Turkish tea, big smile. Plain flat turquoise background. ' + PORTRAIT),
  J('p_dolmuscu', 'A cool Istanbul minibus driver man in his thirties with stubble, black aviator sunglasses, slicked-back hair, brown leather vest over a yellow shirt, toothy confident grin, string of amber prayer beads in his hand. Plain flat taxi yellow background. ' + PORTRAIT),

  // ---------- Kart + sürücü (3D model referansı ve seçim ekranı) ----------
  J('k_simitci', 'A small open go-kart built like a classic red Istanbul simit street cart, with a glass display case full of sesame simit rings at the back, red and white striped little canopy, four fat black tyres with red rims. Driving it is a jolly moustached man with a grey flat cap and striped apron, hands on the steering wheel. ' + MODEL_REF),
  J('k_kaptan', 'A small open go-kart shaped like a little white Istanbul passenger ferry boat with a yellow-and-black funnel at the back, life ring on the side, wooden deck, four fat black tyres with white rims. Driving it is an old ferry captain with a bushy white beard, white captain hat and navy jacket, hands on the steering wheel. ' + MODEL_REF),
  J('k_tekir', 'A small go-kart made from a sturdy cardboard box with drawn-on racing stripes and a fish-bone flag on a stick at the back, four fat black tyres with orange rims. Sitting inside and driving it is a chubby tabby cat wearing leather aviator goggles and a red neckerchief, paws on the steering wheel. ' + MODEL_REF),
  J('k_marti', 'A small open go-kart shaped like a little blue and white wooden Turkish fishing rowboat on four fat black tyres with blue rims, a tiny mast with a triangular flag at the back. Driving it is a cheeky white seagull wearing a tiny leather pilot cap, wings on the steering wheel. ' + MODEL_REF),
  J('k_cayci', 'A small open go-kart themed after Turkish tea: shiny brass samovar as the engine at the back with a little steam puff shape, body like a silver tea tray with red and white saucer pattern trim, four fat black tyres with gold rims. Driving it is a cheerful young woman with curly dark hair, turquoise bandana and mustard apron, hands on the steering wheel. ' + MODEL_REF),
  J('k_dolmuscu', 'A small open-top go-kart shaped like a tiny cute yellow Istanbul dolmus minibus with round headlights, chrome bumper, a blue stripe on the side and a roof rack bar at the back, four fat black tyres with chrome rims. Driving it is a cool man with stubble, black aviator sunglasses and a brown leather vest, hands on the steering wheel. ' + MODEL_REF),

  // ---------- Simge yapılar / sahne modelleri (3D model referansı) ----------
  J('m_galata', 'The Galata Tower of Istanbul as a stylized game landmark: tall round medieval stone tower, arched windows near the top, balcony ring, pointed conical slate roof with a golden finial, small stone base. ' + MODEL_REF, { aspect_ratio: '2:3' }),
  J('m_kizkulesi', "The Maiden's Tower of Istanbul as a stylized game landmark: a small white stone tower with a red-tiled roofed base building, a balcony, an octagonal lantern with a grey dome and a flagpole with a red flag, standing on a tiny round rocky islet with a little pier. " + MODEL_REF),
  J('m_cami', 'A stylized Ottoman mosque as a game landmark: large central lead-grey dome surrounded by cascading smaller half-domes, cream stone walls with arched windows, four tall slender minarets with pointed grey caps at the corners, golden crescent finials, compact square footprint. ' + MODEL_REF),
  J('m_vapur', 'A classic Istanbul passenger ferry boat as a stylized game prop: white hull with a dark waterline stripe, two open decks with wooden railings and round life rings, a captain bridge on top, one yellow funnel with a black band, small red flag at the stern. Shown complete including the lower hull. ' + MODEL_REF),
  J('m_tramvay', 'The nostalgic red Istanbul heritage tram as a stylized game prop: short single vintage tram car, glossy red lower body with cream white upper half, row of arched windows, round front headlight, small open platforms at both ends, pantograph pole on the roof, four small wheels. ' + MODEL_REF),
  J('m_balikci', 'A stylized cartoon fisherman figure standing upright and holding a long fishing rod: a middle-aged man in a green rain jacket, wool beanie and rubber boots, small blue bucket at his feet. Full body, arms slightly away from the torso. ' + MODEL_REF, { aspect_ratio: '2:3' }),

  // ---------- Eşya simgeleri ----------
  J('i_cay', 'A steaming tulip-shaped glass of red Turkish tea on a small red and white saucer with a tiny spoon, little speed flames behind it. ' + ICON, { background: 'transparent' }),
  J('i_simit', 'A golden-brown sesame-covered Turkish simit bread ring flying with motion streaks. ' + ICON, { background: 'transparent' }),
  J('i_karpuz', 'A single crescent-shaped slice of watermelon rind that has been eaten: thick dark green striped rind with only a thin strip of red flesh left and three black seeds, lying on its side in a small shiny puddle of pink juice. ' + ICON, { background: 'transparent' }),
  J('i_nazar', 'A round glass Turkish evil eye amulet (nazar boncugu) with concentric circles of deep blue, white, light blue and black, glowing with a protective magical aura. ' + ICON, { background: 'transparent' }),
  J('i_marti', 'An angry cartoon seagull diving downward with wings spread and beak open, speed streaks behind it. ' + ICON, { background: 'transparent' }),
  J('i_duduk', 'A shiny brass ship horn trumpet blasting visible ring-shaped sound waves. ' + ICON, { background: 'transparent' }),

  // ---------- Özel güç simgeleri ----------
  J('pw_simitci', 'Three golden-brown sesame-covered Turkish simit bread rings flying forward in a fan formation with fiery motion streaks. ' + ICON, { background: 'transparent' }),
  J('pw_kaptan', 'The bow of a small white passenger ferry boat with a yellow-and-black funnel charging straight at the viewer, splitting a big splashing turquoise wave, speed lines. ' + ICON, { background: 'transparent' }),
  J('pw_tekir', 'An orange tabby cat paw with pink toe beans and claws out, pouncing upward along a bouncy curved motion arc with sparkles. ' + ICON, { background: 'transparent' }),
  J('pw_marti', 'A cheeky white seagull with grey wings flying away fast with a stolen golden sesame simit ring in its yellow beak, mischievous eyes, motion streaks. ' + ICON, { background: 'transparent' }),
  J('pw_cayci', 'A shiny brass double-stacked Turkish teapot blasting off like a rocket with big orange flames and white steam shooting out behind it. ' + ICON, { background: 'transparent' }),
  J('pw_dolmuscu', 'A chrome car exhaust pipe blowing out a big puffy dark grey cartoon smoke cloud. ' + ICON, { background: 'transparent' }),

  // ---------- Dokular ----------
  J('t_iznik', 'Seamless tileable texture, flat top-down orthographic view filling the whole frame: classic Iznik ceramic tile pattern, repeating square tiles with cobalt blue, turquoise and tomato red tulips, carnations and leaves on a glossy white ground, thin grout lines. Stylized hand-painted game texture, even flat lighting, no perspective, no shadows, no text.'),
  J('t_kilim', 'Seamless tileable texture, flat top-down orthographic view filling the whole frame: Turkish kilim carpet pattern with bold geometric diamonds and zigzags in deep red, burgundy, navy, mustard and cream. Stylized hand-painted game texture, even flat lighting, no perspective, no shadows, no fringe, no text.'),
  J('t_cobble', 'Seamless tileable texture, flat top-down orthographic view filling the whole frame: old town cobblestone pavement made of rounded warm grey and beige stones with darker gaps. Stylized hand-painted game texture, chunky shapes, even flat lighting, no perspective, no text.'),
  J('t_vault', 'Seamless tileable texture, flat orthographic view filling the whole frame: painted vaulted ceiling of the Istanbul Grand Bazaar, warm yellow-cream plaster with repeating dark blue and red arabesque floral ornament bands and medallions. Stylized hand-painted game texture, even flat lighting, no perspective, no text.'),
  J('t_itembox', 'Square ornamental ceramic tile filling the whole frame edge to edge: glossy turquoise Iznik tile with a white border band and a large stylized golden tulip in the center surrounded by small cobalt blue leaves, slightly glowing. Flat orthographic view, stylized game texture, no perspective, no text.'),
  J('t_facade_a', 'Flat front elevation, orthographic, no perspective: a continuous row of exactly four narrow colorful historic Istanbul Balat row houses of equal width side by side filling the entire frame edge to edge, each house a different color (coral pink, mustard yellow, sky blue, mint green), three storeys, wooden bay windows (cumba), shutters, flower pots, laundry lines, small shop doors at ground level. Top edge is the roof line, bottom edge is the pavement line. No sky, no street. Stylized hand-painted game texture, even lighting, no text.', { aspect_ratio: '16:9', resolution: '2k' }),
  J('t_facade_b', 'Flat front elevation, orthographic, no perspective: a continuous row of exactly four narrow old Istanbul apartment buildings of equal width side by side filling the entire frame edge to edge, each a different color (terracotta, cream, dusty teal, lavender), four storeys, tall arched windows with wrought iron balconies, awnings, a tea shop, a bakery and a barber at ground level with unreadable signs. Top edge is the roof line, bottom edge is the pavement line. No sky, no street. Stylized hand-painted game texture, even lighting, no text.', { aspect_ratio: '16:9', resolution: '2k' }),
  J('t_bazaar', 'Flat front elevation, orthographic, no perspective: a continuous row of Grand Bazaar shop fronts under repeating pointed stone arches filling the entire frame edge to edge: hanging colorful mosaic glass lamps, stacked carpets, painted ceramics plates, heaps of spices, copper pots, lokum boxes. Warm lantern glow. Stylized hand-painted game texture, no floor, no ceiling, no text.', { aspect_ratio: '21:9', resolution: '2k' }),
  J('sky', 'Ultra wide panoramic game sky backdrop: distant Istanbul skyline seen across calm water at golden hour. The horizon line sits in the lower quarter of the image. Along the horizon a low hazy silhouette of hills with many mosque domes, slender minarets and a round tower, softly lit in warm peach and violet. Above it a huge clean sky gradient from warm orange-peach near the horizon to soft turquoise-blue at the top, with a few fluffy painterly clouds and a glowing low sun. Below the horizon only flat calm teal water. Stylized painterly cartoon, no boats, no birds, no text.', { aspect_ratio: '21:9', quality: 'high', resolution: '2k' }),
  J('billboards', 'A 2x2 grid of four equal rectangular retro hand-painted Turkish shop signboards, each filling its quarter completely with a thin dark frame, flat front view. Top-left: red sign reading "TAZE SİMİT" with a simit ring. Top-right: turquoise sign reading "ÇAY OCAĞI" with a tulip tea glass. Bottom-left: blue sign reading "BALIK EKMEK" with a grilled fish sandwich. Bottom-right: pink sign reading "LOKUM" with cubes of Turkish delight. Bold playful lettering, spelled exactly as given, stylized cartoon game texture.', { aspect_ratio: '16:9', quality: 'high', resolution: '2k' }),
];

async function one(job) {
  const file = `${OUT}/${job.name}.png`;
  const { name, prompt, model, ...params } = job;
  const args = ['generate', 'create', model, '--prompt', prompt];
  for (const [k, v] of Object.entries(params)) args.push(`--${k}`, String(v));
  args.push('--wait', '--wait-timeout', '15m', '--json');
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { stdout } = await run('higgsfield', args, { maxBuffer: 1 << 24 });
      const res = JSON.parse(stdout.slice(stdout.indexOf('[')));
      const url = res[0]?.result_url;
      if (!url) throw new Error('sonuç adresi yok: ' + res[0]?.status);
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      writeFileSync(file, buf);
      console.log(`✓ ${name} (${(buf.length / 1024) | 0} KB)`);
      return;
    } catch (e) {
      console.log(`✗ ${name} deneme ${attempt}: ${String(e.stderr || e.message).slice(0, 300)}`);
    }
  }
}

const want = process.argv.slice(2);
const force = want.length > 0;
const todo = JOBS.filter((j) => (force ? want.includes(j.name) : !existsSync(`${OUT}/${j.name}.png`)));
console.log(`${todo.length} görsel üretilecek`);
const queue = [...todo];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) await one(queue.shift());
}));
console.log('bitti');
