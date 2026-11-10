#!/usr/bin/env python3
"""Araca özel motor döngülerini işler: raw/audio/eng_*.pcm -> public/assets/audio/eng_*.wav

Telefon ve dizüstü hoparlörleri 300 Hz altını neredeyse hiç vermez; bas ağırlıklı motorlar
(dizel, V8, mırıltı) orada duyulmaz olur. Burada bas, doyurma ile orta banda harmonik olarak
taşınır; ritim aynı kalır. Bütün süzgeçler döngüsel FFT ile yapılır, böylece döngü dikişi bozulmaz.
Kullanım: python3 tools/engine-loops.py   (numpy gerekir)
"""
import math, os, sys, wave
import numpy as np

SR_IN, SR_OUT, TARGET_RMS_DB = 44100, 22050, -19.0
# ad: (orta bant katkısı, doyurma kazancı, tiz eğimi dB)  — ölçüme göre ayarlandı
RECIPE = {
    'simitci': (0.0, 1, 0),
    'kaptan': (0.55, 8, 0),
    'tekir': (0.9, 14, 0),
    'marti': (0.8, 10, 0),
    'cayci': (0.0, 1, -7),
    'dolmuscu': (0.8, 10, 0),
}

def band(X, f, lo, hi, w=0.25):
    """Yumuşak kenarlı bant geçiren kazanç eğrisi (kenar genişliği: oktavın w katı)."""
    g = np.ones_like(f)
    if lo: g *= 1 / (1 + (lo / np.maximum(f, 1e-6)) ** (2 / w))
    if hi: g *= 1 / (1 + (np.maximum(f, 1e-6) / hi) ** (2 / w))
    return X * g

def process(name):
    x = np.fromfile(f'raw/audio/eng_{name}.pcm', dtype=np.int16).astype(np.float64) / 32768
    x = x.reshape(-1, 2).mean(1)
    n = len(x); f = np.fft.rfftfreq(n, 1 / SR_IN)
    mix, drive, tilt = RECIPE[name]
    X = np.fft.rfft(x)
    X = band(X, f, 45, 0)                       # duyulmayan en alt bası at: kazanç payı açılır
    if tilt: X = X * 10 ** (tilt / 20 * np.clip(np.log2(np.maximum(f, 1) / 3000), 0, 1.5))
    dry = np.fft.irfft(X, n)
    y = dry
    if mix:
        d = dry / (np.sqrt((dry ** 2).mean()) + 1e-9)
        wet = np.tanh(d * drive * 0.25)
        W = band(np.fft.rfft(wet), f, 320, 2600)
        wet = np.fft.irfft(W, n)
        wet *= np.sqrt((dry ** 2).mean()) / (np.sqrt((wet ** 2).mean()) + 1e-9)
        y = dry + wet * mix
    # 22.05 kHz'e döngüsel yeniden örnekleme
    Y = np.fft.rfft(y); m = n * SR_OUT // SR_IN
    y = np.fft.irfft(Y[: m // 2 + 1], m) * (m / n)
    g = 10 ** (TARGET_RMS_DB / 20) / (np.sqrt((y ** 2).mean()) + 1e-9)
    y *= g
    peak = np.abs(y).max()
    if peak > 0.89: y = np.tanh(y / peak * 1.6) / math.tanh(1.6) * 0.89   # tepe taşarsa yumuşak sınırla
    out = f'public/assets/audio/eng_{name}.wav'
    with wave.open(out, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR_OUT)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    return out

if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    for name in RECIPE:
        if os.path.exists(f'raw/audio/eng_{name}.pcm'): print('  ' + process(name))
