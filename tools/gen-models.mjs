#!/usr/bin/env node
// Higgsfield "Tripo H3.1 Image to 3D" ile raw/img/{k_*,m_*}.png görsellerinden GLB modelleri üretir.
// Akış: JPEG'e çevir → upload → iş oluştur → durumu yokla → GLB indir. İş kimliği raw/models/<isim>.job
// dosyasında saklanır; betik yarıda kesilirse kaldığı yerden sürer.
// Kullanım: node tools/gen-models.mjs [isim ...]
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
const run = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OUT = 'raw/models';
mkdirSync(OUT, { recursive: true });
mkdirSync('raw/jpg', { recursive: true });

// isim → istenen üçgen sayısı
export const MODELS = {
  k_simitci: 20000, k_kaptan: 20000, k_tekir: 20000, k_marti: 20000, k_cayci: 20000, k_dolmuscu: 20000,
  m_galata: 12000, m_kizkulesi: 14000, m_cami: 18000, m_vapur: 14000, m_tramvay: 12000, m_balikci: 6000,
};

// stdin'i hemen kapat: istem verilmeyen işlerde CLI istemi stdin'den okumaya çalışıp sonsuza dek bekliyor.
const hf = async (args) => {
  const p = run('higgsfield', args, { maxBuffer: 1 << 26, timeout: 120000 });
  p.child.stdin.end();
  return (await p).stdout;
};

async function one(name) {
  try {
    const jobFile = `${OUT}/${name}.job`;
    let job = existsSync(jobFile) ? readFileSync(jobFile, 'utf8').trim() : null;
    if (!job) {
      const jpg = `raw/jpg/${name}.jpg`;
      await run('convert', [`raw/img/${name}.png`, '-background', 'white', '-flatten', '-resize', '1024x1024', '-quality', '92', jpg]);
      const up = JSON.parse(await hf(['upload', 'create', jpg, '--json']));
      const out = await hf(['generate', 'create', 'tripo_h3_1_image_to_3d', '--image', up.id,
        '--geometry_quality', 'detailed', '--texture_quality', 'detailed', '--face_limit', String(MODELS[name]), '--json']);
      job = JSON.parse(out)[0];
      writeFileSync(jobFile, job);
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 25 * 60000) {
      await sleep(10000);
      let res;
      try { res = JSON.parse(await hf(['generate', 'get', job, '--json'])); } catch { continue; }
      res = Array.isArray(res) ? res[0] : res;
      if (res.status === 'completed') {
        const buf = Buffer.from(await (await fetch(res.result_url)).arrayBuffer());
        writeFileSync(`${OUT}/${name}.glb`, buf);
        console.log(`✓ ${name} (${(buf.length / 1024) | 0} KB, ${((Date.now() - t0) / 1000) | 0} sn)`);
        return;
      }
      if (!['queued', 'in_progress', 'pending', 'processing', 'created', 'waiting'].includes(res.status)) throw new Error('durum: ' + res.status);
    }
    throw new Error('zaman aşımı');
  } catch (e) {
    console.log(`✗ ${name}: ${String(e.stderr || e.message).slice(0, 300)}`);
  }
}

const want = process.argv.slice(2);
const todo = Object.keys(MODELS).filter((n) => (want.length ? want.includes(n) : !existsSync(`${OUT}/${n}.glb`)));
console.log(`${todo.length} model üretilecek`);
const queue = [...todo];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) await one(queue.shift());
}));
console.log('bitti');
