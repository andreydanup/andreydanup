# VESPER H1 — situs produk 3D

Landing page produk headphone fiktif dengan model 3D yang dibangun langsung di Three.js (tanpa file model eksternal) dan dianimasikan mengikuti scroll.

## Isi
- **Hero** — model berputar masuk, mengikuti gerakan mouse.
- **Suara** — tampilan *exploded view*: cangkang, driver, dan bantalan terpisah, dengan label yang menempel di komponen 3D.
- **ANC** — gelombang peredam bising memancar dari cangkang.
- **Kenyamanan** — sudut pandang ke bantalan telinga.
- **Warna** — 4 pilihan warna (Grafit, Gletser, Bara, Lumut), material berubah halus secara real-time.
- **Spesifikasi** dan **Beli**.

Responsif (desktop & ponsel) dan menghormati `prefers-reduced-motion`.

## Menjalankan
Tidak perlu build. Buka `index.html` di browser, atau jalankan server statis:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

## File
- `index.html` — struktur dan konten halaman
- `style.css` — tampilan dan layout
- `main.js` — model 3D prosedural, pencahayaan studio, dan animasi scroll (Three.js r128 dari CDN)
