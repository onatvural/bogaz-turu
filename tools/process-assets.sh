#!/usr/bin/env bash
# raw/ altındaki üretilmiş ham dosyaları oyunun kullandığı boyut ve biçimlere çevirir.
# Kullanım: tools/process-assets.sh [img] [audio] [models]   (boşsa hepsi)
set -euo pipefail
cd "$(dirname "$0")/.."
R=raw/img; A=public/assets
mkdir -p $A/img $A/tex $A/models $A/audio
what="${*:-img audio models}"

if [[ $what == *img* ]]; then
  echo "== görseller"
  convert $R/keyart.png -resize 1920x -quality 84 $A/img/keyart.jpg
  # logo: saydam zemindeki soluk haleyi temizle
  convert $R/logo.png -channel A -level 45%,100% +channel -trim +repage -resize 900x $A/img/logo.webp
  for c in simitci kaptan tekir marti cayci dolmuscu; do
    convert $R/p_$c.png -resize 384x384 -quality 86 $A/img/p_$c.webp
    # kart görseli: beyaz zemini köşelerden taşırarak sil
    convert $R/k_$c.png -bordercolor white -border 2 -alpha set -fuzz 7% -fill none \
      -draw "matte 0,0 floodfill" -shave 2x2 -trim +repage -resize 640x640 -quality 88 $A/img/k_$c.webp
  done
  for i in cay simit karpuz nazar marti duduk; do
    convert $R/i_$i.png -trim +repage -resize 240x240 -background none -gravity center -extent 256x256 -quality 90 $A/img/i_$i.webp
  done

  for t in iznik kilim cobble vault; do
    convert $R/t_$t.png -resize 512x512! -quality 88 $A/tex/$t.jpg
  done
  convert $R/t_itembox.png -gravity center -crop 94%x94%+0+0 +repage -resize 256x256! -quality 90 $A/tex/itembox.jpg
  convert $R/t_facade_a.png -resize 2048x1024! -quality 86 $A/tex/facade_a.jpg
  convert $R/t_facade_b.png -resize 2048x1024! -quality 86 $A/tex/facade_b.jpg
  convert $R/t_bazaar.png -resize 2048x512! -quality 86 $A/tex/bazaar.jpg

  # tabelalar: 2x2 ızgarayı dörde böl
  W=$(identify -format %w $R/billboards.png); H=$(identify -format %h $R/billboards.png)
  n=1
  for gy in 0 1; do for gx in 0 1; do
    convert $R/billboards.png -crop $((W/2))x$((H/2))+$((gx*W/2))+$((gy*H/2)) +repage -shave 10x10 -resize 512x256! -quality 88 $A/tex/sign_$n.jpg
    n=$((n+1))
  done; done

  # gökyüzü: 360° panorama = A + ayna(A, güneşsiz). Güneşi komşu şeridi aynalayıp kapatarak siliyoruz.
  T=$(mktemp -d)
  convert $R/sky.png -crop 240x1152+880+0 +repage -flop $T/patch.png
  convert -size 240x1152 gradient:black-white -rotate -90 -resize 240x1152! -level 0%,42% $T/mask.png
  convert $T/patch.png $T/mask.png -alpha off -compose CopyOpacity -composite $T/patchm.png
  convert $R/sky.png $T/patchm.png -geometry +640+0 -compose over -composite $T/nosun.png
  convert $R/sky.png \( $T/nosun.png -flop \) +append -resize 4096x1024! -quality 88 $A/tex/sky.jpg
  rm -rf "$T"
fi

if [[ $what == *audio* ]]; then
  echo "== sesler"
  for f in raw/audio/music_*.mp3; do
    ffmpeg -v error -y -i "$f" -af "loudnorm=I=-17:TP=-1.5:LRA=11" -ar 44100 -b:a 128k $A/audio/$(basename "$f")
  done
  # tepe değerini -2 dB'ye çekecek kazanç
  gain() { local m; m=$(ffmpeg -hide_banner -i "$1" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\?[0-9.]*\) dB.*/\1/p'); awk -v m="${m:-0}" 'BEGIN{g=-2-m; if(g>18)g=18; printf "%.1f", g}'; }
  # seslendirmelerde baş/son sessizliği kırp; efektlerde yalnızca baştaki boşluğu al
  VTRIM="silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse"
  STRIM="silenceremove=start_periods=1:start_threshold=-60dB"
  for f in raw/audio/*.mp3; do
    b=$(basename "$f"); [[ $b == music_* ]] && continue
    if [[ $b == v_* || $b == c_* ]]; then tr=$VTRIM; else tr=$STRIM; fi
    ffmpeg -v error -y -i "$f" -af "$tr,volume=$(gain "$f")dB" -ar 44100 -ac 1 -b:a 96k $A/audio/$b
  done
  # döngüler: boşluksuz çalsın diye WAV
  for l in engine skid ambience; do
    ffmpeg -v error -y -f s16le -ar 44100 -ac 2 -i raw/audio/$l.pcm -ac 1 -ar 22050 $A/audio/$l.wav
  done
fi

if [[ $what == *models* ]]; then
  echo "== modeller"
  for f in raw/models/*.glb; do
    b=$(basename "$f")
    npx --yes @gltf-transform/cli@4 optimize "$f" $A/models/$b --compress meshopt --texture-compress webp --texture-size 1024 >/dev/null
    echo "  $b $(du -k $A/models/$b | cut -f1) KB"
  done
fi
du -sh $A/* | sed 's/^/  /'
