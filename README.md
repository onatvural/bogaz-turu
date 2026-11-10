# Boğaz Turu

İstanbul'da geçen, three.js ile yazılmış bir kart yarışı. Eminönü sahilinden kalk, Kapalıçarşı'nın içinden geç, Galata yokuşunda nostaljik tramvayı solla, Boğaz Köprüsü'nden Anadolu'ya geç, sahil yolundan inip balıkçıların arasından Galata Köprüsü'yle geri dön. Üç tur, altı yarışçı.

![Boğaz Köprüsü](docs/kopru.jpeg)

| Kapalıçarşı | Galata yokuşu |
| --- | --- |
| ![Kapalıçarşı](docs/carsi.jpeg) | ![Galata](docs/galata.jpeg) |

## Oynanış

| Tuş | İşlev |
| --- | --- |
| `←` `→` / `A` `D` | Yön |
| `↑` / `W` | Gaz |
| `↓` / `S` | Fren, geri |
| `BOŞLUK` | Zıpla ve drift. Basılı tutup dönersen kıvılcımlar renk değiştirir; bırakınca mini turbo |
| `SHIFT` / `E` / `X` | Eşyayı kullan |
| `ESC` / `P` | Duraklat |
| `M` | Sesi kapat |

Oyun kolu ve dokunmatik ekran da desteklenir (dokunmatikte gaz kendiliğinden basılıdır). Geri sayımda "Bir!" denirken gaza basarsan roket kalkış yaparsın.

### Yarışçılar

| | Hız | İvme | Yol tutuş |
| --- | --- | --- | --- |
| Simitçi Cemal | ●●●○○ | ●●●○○ | ●●●●○ |
| Kaptan Nuri | ●●●●● | ●●○○○ | ●●○○○ |
| Tekir | ●●○○○ | ●●●●● | ●●●●○ |
| Martı Rıfkı | ●●●●○ | ●●●●○ | ●●○○○ |
| Çaycı Zehra | ●●○○○ | ●●●●○ | ●●●●● |
| Dolmuşçu Rıza | ●●●●○ | ●●●○○ | ●●●○○ |

### Eşyalar

Pistteki çini sandıklardan çıkar. Geride olana daha güçlü eşya düşer.

| Eşya | Ne yapar |
| --- | --- |
| Çay | Tavşan kanı turbo |
| Simit | Pisti izleyerek yuvarlanır, öndekine çarpar |
| Karpuz kabuğu | Arkana bırakırsın, basan kayar |
| Nazar boncuğu | Bir darbeyi savuşturur |
| Martı | Bir öndeki yarışçıya pike yapar |
| Vapur düdüğü | Yakındaki herkesi sarsar |

Galata yokuşundaki tramvaya arkadan hızla bindirirsen savrulursun; turuncu şeritler turbo verir.

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5183
npm run build    # dist/
```

three.js `0.162.0` sürümüne sabitlendi; WebGL2'si olmayan eski cihazlarda WebGL1'e düşebilen son sürümlerden. `?q=0` düşük, `?q=1` yüksek ayrıntıyı zorlar.

Kod `src/` altında:

| Dosya | İçerik |
| --- | --- |
| `track.js` | Pist eğrisi, örnekleme, yol/duvar geometrisi |
| `world.js` | Arazi, deniz, gökyüzü, köprüler, çarşı, binalar, vapur, martı, tramvay |
| `kart.js` | Kart fiziği (drift, turbo, duvar) ve görseli |
| `ai.js` | Rakip sürücüler |
| `items.js` | Sandıklar ve eşyalar |
| `game.js` | Yarış akışı, kamera, sıralama, çarpışmalar |
| `hud.js`, `main.js`, `style.css` | Gösterge ve menüler |

## Görseller ve sesler nasıl üretildi

Hepsi komut satırından üretildi; istemler betiklerin içinde durur.

| Betik | Araç | Ürettiği |
| --- | --- | --- |
| `tools/gen-images.mjs` | Higgsfield CLI, GPT Image 2.5 | Kapak, logo, portreler, kart ve yapı görselleri, eşya simgeleri, dokular, gökyüzü, tabelalar |
| `tools/gen-models.mjs` | Higgsfield CLI, Tripo H3.1 Image to 3D | Kart ve yapı görsellerinden 12 GLB model |
| `tools/gen-audio.mjs` | ElevenLabs CLI | Müzik (music v2.5), ses efektleri, Türkçe seslendirme (eleven_v4) |
| `tools/process-assets.sh` | ImageMagick, ffmpeg, gltf-transform | Ham çıktıları `public/assets` altındaki boyut ve biçimlere çevirir |

Ham çıktılar `raw/` altına iner ve depoya girmez. ElevenLabs anahtarı `ELEVENLABS_API_KEY` ya da `~/.elevenlabs/api_key` dosyasından okunur.
