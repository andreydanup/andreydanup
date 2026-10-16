# Higgsfield: iklan motion design 15 detik

Konsep iklan tidak resmi untuk Higgsfield dalam format vertikal 9:16 (1080×1920, 60 fps) untuk Reels, TikTok, dan Stories. Semuanya dibuat dengan kode: animasinya di HTML Canvas, musik dan efek suaranya disintesis dengan Python. Tidak ada footage dan tidak memakai AI video generator.

**Hasil akhir:** [`higgsfield-ad.mp4`](higgsfield-ad.mp4), 15 detik, H.264 + AAC.

## Alur (mengikuti storyboard)

| Detik | Adegan | Isi |
|---|---|---|
| 0–2 | 01 Spark | Garis neon lime menyala dan menggambar bentuk squiggle logo, disertai percikan dan *crash zoom* |
| 2–4 | 02 Prompt | Kolom prompt kaca dengan teks yang diketik, lalu tombol Generate ditekan. Pita lime menebas kolom dan hurufnya meledak jadi konfeti piksel |
| 4–6,5 | 03 Worlds | Terbang menembus puluhan kartu dunia (kota neon, laut, gurun, galaksi, aurora). Satu kata kinetik muncul di tiap ketukan |
| 6,5–9 | 04 Motion | Foto diam retak lalu pecah, dan cipratan cat membuka versi yang bergerak |
| 9–12 | 05 Create | Terowongan spiral dari kartu-kartu, teks "CREATE ANYTHING", efek glitch, lalu implosi |
| 12–15 | 06 Logo lock | Logo digambar, wordmark dan tagline muncul, lalu semuanya diam total sekitar 2,5 detik terakhir |

Palet warnanya diambil dari logo: lime `#D1FE17` dan hitam, dengan aksen magenta, cyan, oranye, dan ungu.

## File

- `index.html`: preview interaktif (play/pause, scrub, audio).
- `motion.js`: seluruh animasi. `HF.render(ctx, t)` adalah fungsi murni dari waktu, jadi frame mana pun bisa dirender dalam urutan apa pun.
- `logo-geom.js`: geometri logo hasil tracing dari file PNG logo, berupa outline (diisi dengan aturan even-odd) dan centerline untuk animasi menggambar.
- `soundtrack.py` → `soundtrack.wav`: 120 BPM, Em–C–G–D lalu naik ke E mayor. Semua bunyi disintesis dengan numpy/scipy dan setiap cut, ledakan, serta logo lock jatuh di ketukannya.
- `render.cjs`: mengekspor frame lewat Chromium headless (Playwright) lalu mengirimnya ke ffmpeg.

## Render ulang

```bash
pip install numpy scipy
python3 soundtrack.py soundtrack.wav
npm i -D playwright            # atau gunakan playwright yang terpasang global
node render.cjs video video-silent.mp4 60
ffmpeg -i video-silent.mp4 -i soundtrack.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 256k \
  -shortest -movflags +faststart higgsfield-ad.mp4
```

Untuk melihat frame tertentu: `node render.cjs stills ./stills 2.5,7.1,12.6`.

Preview di browser: jalankan `python3 -m http.server 8000` dari root repo, lalu buka http://localhost:8000/higgsfield-ad/.

Fontnya Inter Display / Inter. Kalau Inter Display tidak terpasang, preview memakai Inter dari Google Fonts.
