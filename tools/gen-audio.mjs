#!/usr/bin/env node
// ElevenLabs CLI ile müzik, ses efektleri ve seslendirmeleri üretir.
// Kullanım: node tools/gen-audio.mjs [isim ...]   (isim verilmezse eksik olanların hepsi)
// Anahtar: ELEVENLABS_API_KEY ya da ~/.elevenlabs/api_key
// Çıktı: raw/audio/<isim>.(mp3|pcm) — sonra tools/process-assets.sh işler.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
const run = promisify(execFile);

const KEY = process.env.ELEVENLABS_API_KEY || readFileSync(`${homedir()}/.elevenlabs/api_key`, 'utf8').trim();
const OUT = 'raw/audio';
mkdirSync(OUT, { recursive: true });

const V = {
  spiker: 'Q2IX97JeHBY3vNGzgM5s', // Cavit - TV Presenter
  simitci: 'UDnouLsS6dHA56XeGEjG', // Adil - Warm & Playful
  kaptan: 'MuOq11XzQTthwLhmGZ2V', // Nihat - deep
  cayci: 'xyqF3vGMQlPk3e7yA4DI', // Ahu - Cheerful
  dolmuscu: 'yUfFgVx4fCYbB3cVkJEp', // Adam - Confident
};

// Not: CLI, --prompt bayrağıyla eski music_prompt alanını zorunlu sanıyor; gövdeyi --json ile veriyoruz.
const music = (name, ms, prompt) => ({ name, ext: 'mp3', args: ['music', 'compose', '--json', JSON.stringify({ prompt, music_length_ms: ms, force_instrumental: true, model_id: 'music_v2_5' })] });
const sfx = (name, sec, text, o = {}) => ({
  name, ext: o.loop ? 'pcm' : 'mp3',
  args: ['text-to-sound-effects', 'convert', '--model-id', 'eleven_text_to_sound_v2', '--text', text, '--duration-seconds', String(sec),
    '--prompt-influence', String(o.influence ?? 0.45), ...(o.loop ? ['--loop', 'true', '--output-format', 'pcm_44100'] : [])],
});
const say = (name, voice, text) => ({ name, ext: 'mp3', args: ['text-to-speech', 'convert', '--model-id', 'eleven_v4', '--voice-id', V[voice], '--language-code', 'tr', '--text', text] });

export const JOBS = [
  // ---------- Müzik ----------
  music('music_race', 110000, 'High-energy instrumental racing theme for a cartoon kart racing game set in Istanbul. Fast Anatolian funk-rock at 150 BPM: driving drum kit with darbuka fills, a catchy electric saz (baglama) riff, a wailing joyful clarinet lead melody, slap bass and punchy brass stabs. Exciting, sunny, mischievous, full of momentum from the first second, steady energy throughout so it loops well. No vocals.'),
  music('music_menu', 50000, 'Playful laid-back instrumental for a cartoon game menu set in Istanbul. Bouncy darbuka and hand-clap groove at 105 BPM, plucked kanun melody, a cheerful clarinet answering it, round upright bass, light accordion chords. Warm, cheeky, inviting, steady so it loops well. No vocals.'),
  music('music_results', 28000, 'Celebratory instrumental victory music: a short triumphant Turkish festival fanfare with zurna, big davul drums and brass, then a relaxed happy darbuka groove with clarinet. Joyful and proud. No vocals.'),

  // ---------- Döngüler ----------
  sfx('engine', 3, 'Small go-kart engine running at a perfectly steady medium RPM, constant even buzzing hum, no revving, no gear changes', { loop: true, influence: 0.6 }),
  sfx('skid', 2, 'Continuous car tire screech skidding on asphalt, steady and even', { loop: true, influence: 0.6 }),
  sfx('ambience', 12, 'Seaside city ambience: gentle waves lapping against a stone quay, distant seagulls calling, faint harbor bustle', { loop: true }),
  // araca özel motorlar: her kartın kendi sesi (oyunda devirle birlikte hızlanır)
  sfx('eng_simitci', 3, 'Old small two-stroke moped engine running at a perfectly steady medium RPM, buzzy rattling putt-putt, constant and even, no revving, no gear changes', { loop: true, influence: 0.6 }),
  sfx('eng_kaptan', 3, 'Old diesel ferry boat engine running steadily, heavy knocking chug chug chug with a clattering mechanical rattle, constant even rhythm, no revving', { loop: true, influence: 0.6 }),
  sfx('eng_tekir', 3, 'A very loud continuous cat purr, steady rhythmic rumbling purring like a tiny motor, constant and even, no meowing', { loop: true, influence: 0.6 }),
  sfx('eng_marti', 3, 'Small single-cylinder wooden fishing boat engine running at a perfectly steady RPM, hollow rhythmic pat-pat-pat popping exhaust, constant and even, no revving', { loop: true, influence: 0.6 }),
  sfx('eng_cayci', 3, 'Small steam locomotive chuffing rhythmically at a steady fast pace, chuff chuff chuff chuff, constant even rhythm, no whistle', { loop: true, influence: 0.6 }),
  sfx('eng_dolmuscu', 3, 'Old 1970s car with a rough carbureted V8 engine running at a perfectly steady medium RPM, burbling rumbling exhaust, constant and even, no revving, no gear changes', { loop: true, influence: 0.6 }),

  // ---------- Tek seferlik efektler ----------
  sfx('boost', 1.6, 'Short powerful turbo boost whoosh with a rising jet flame burst, arcade racing game'),
  sfx('pickup', 1, 'Bright sparkly magical chime, arcade game item pickup'),
  sfx('throw', 0.7, 'Quick cartoon throwing whoosh'),
  sfx('hit', 1.3, 'Cartoon comedic bonk impact followed by a short tire squeal, arcade game'),
  sfx('shield_on', 1.6, 'Magical glassy shimmering shield activating, bell-like protective aura, game sound'),
  sfx('shield_block', 1, 'Bright glass bell ding deflecting an impact, magical ricochet'),
  sfx('seagull', 2, 'A seagull squawking loudly and angrily, close up, several sharp cries'),
  sfx('horn', 2.6, 'Loud deep ferry boat horn, one long powerful blast'),
  sfx('slip', 1.1, 'Cartoon slip on a wet peel, squeaky slide and a small squish'),
  sfx('bump', 0.5, 'Dull rubber bumper thud, small kart bumping into a barrier'),
  sfx('drop', 0.5, 'Small wet plop of an object dropped on the ground'),
  sfx('lap', 1.6, 'Short cheerful arcade jingle of ascending bells, lap completed'),
  sfx('finish', 4.5, 'Celebratory finish line fanfare with a cheering crowd, whistles and applause, arcade racing game'),
  sfx('tram_bell', 1.5, 'Vintage tram bell ringing twice, clear ding ding'),
  sfx('meow', 1, 'A cute confident cat meow, single clear meow'),
  sfx('ui_click', 0.5, 'Soft wooden user interface button click, very short'),
  sfx('ui_select', 0.9, 'Pleasant confirm sound, short plucked string with a small chime'),
  sfx('hop', 0.5, 'Tiny cartoon spring hop, short boing'),
  sfx('crash', 0.6, 'Two bumper cars colliding, short metallic clank with a rubbery thud'),
  sfx('power_ready', 0.9, 'Bright magical power-up ready chime, two quick rising sparkly notes, arcade game'),
  sfx('dolmus_horn', 1.6, 'Old minibus musical multi-tone air horn playing a short cheerful melody, loud and brassy'),
  sfx('smoke', 1.3, 'Old car engine backfiring and coughing out a big puff of exhaust smoke, sputtering pop'),
  sfx('steam', 1.3, 'Boiling kettle steam whistle rising quickly into a powerful hissing jet of steam'),
  sfx('slam', 0.8, 'Heavy cartoon ground slam landing thud with a short rumbling shockwave'),

  // ---------- Seslendirme ----------
  say('v_hosgeldin', 'spiker', 'Boğaz Turu\'na hoş geldiniz!'),
  say('v_sec', 'spiker', 'Yarışçını seç!'),
  say('v_uc', 'spiker', 'Üç!'),
  say('v_iki', 'spiker', 'İki!'),
  say('v_bir', 'spiker', 'Bir!'),
  say('v_basla', 'spiker', 'Bas gaza!'),
  say('v_sontur', 'spiker', 'Son tur! Son tur!'),
  say('v_bitti', 'spiker', 'Yarış bitti!'),
  say('v_birinci', 'spiker', 'İnanılmaz! Birinci oldun! İstanbul seninle gurur duyuyor!'),
  say('v_podyum', 'spiker', 'Harika yarış! Podyumdasın!'),
  say('v_gec', 'spiker', 'Olsun! Bir çay iç, tekrar dene!'),
  say('c_simitci', 'simitci', 'Simiiit! Taze simit, sıcak simit!'),
  say('c_kaptan', 'kaptan', 'Vira bismillah! Halatları çözün!'),
  say('c_cayci', 'cayci', 'Çaylar taze demlendi, haydi bakalım!'),
  say('c_dolmuscu', 'dolmuscu', 'Arkaya doğru ilerleyelim, kalkıyoruz!'),
];

async function one(job) {
  const file = `${OUT}/${job.name}.${job.ext}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await run('elevenlabs', [...job.args, '--xi-api-key', KEY, '-o', file, '-q'], { maxBuffer: 1 << 24 });
      if (!existsSync(file) || statSync(file).size < 800) throw new Error('boş çıktı');
      console.log(`✓ ${job.name} (${(statSync(file).size / 1024) | 0} KB)`);
      return;
    } catch (e) {
      console.log(`✗ ${job.name} deneme ${attempt}: ${String(e.stderr || e.message).replaceAll(KEY, '***').slice(0, 400)}`);
    }
  }
}

const want = process.argv.slice(2);
const todo = JOBS.filter((j) => (want.length ? want.includes(j.name) : !existsSync(`${OUT}/${j.name}.${j.ext}`)));
console.log(`${todo.length} ses üretilecek`);
const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) await one(queue.shift());
}));
console.log('bitti');
