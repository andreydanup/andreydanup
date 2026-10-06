# Apple Music: konsep situs 3D interaktif (tidak resmi)

Konsep desain fan-made bergaya Apple Music untuk portofolio. **Tidak berafiliasi dengan atau didukung oleh Apple Inc.** Halaman ini tidak memakai logo Apple. Semua album, artis, lirik, dan musiknya fiktif dan dibuat secara prosedural.

## Fitur
- **Cover Flow 3D**: rak album dengan pantulan. Bisa digeser (drag/swipe, trackpad horizontal, tombol panah), lalu klik sampul tengah atau tekan Enter untuk memutar. Warna latar mengikuti sampul album.
- **Musik live**: 8 "album" disintesis langsung dengan Web Audio API (synthwave, lo-fi, house, ambient), jadi tidak ada file audio sama sekali.
- **Spatial Audio interaktif**: drum, bass, akor, dan melodi tampil sebagai bola cahaya di sekitar kepala. Seret bolanya dan suaranya ikut berpindah lewat HRTF (pakai headphone). Ada mode Stereo pembanding dan mode orbit otomatis.
- **Lossless**: terrain spektrogram 3D yang dibaca dari analyser audio secara real-time.
- **Lirik real-time**: baris aktif mengikuti ketukan lagu.
- **Mini player** dengan efek kaca buram: play/pause, lagu sebelumnya/berikutnya, progres, dan volume. Tombol Spasi juga berfungsi untuk play/pause.

## Menjalankan
```bash
cd apple-music
python3 -m http.server 8000
# buka http://localhost:8000
```

## File
- `index.html`: struktur halaman
- `style.css`: tampilan gelap ala Now Playing
- `music.js`: data album, sampul prosedural, dan mesin synth Web Audio
- `app.js`: tiga scene Three.js (Cover Flow, panggung Spatial Audio, spektrogram) dan UI pemutar
