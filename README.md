# Faraz Detector AI

**AI Detector Mahasiswa — deteksi pola AI untuk teks akademik Bahasa Indonesia & Inggris.**

Faraz Detector AI adalah aplikasi pendeteksi pola tulisan berbasis AI yang dirancang untuk membantu mahasiswa meninjau teks akademik. Sistem menggunakan pendekatan **local-first**, dengan opsi **model lokal** dan **Hybrid API**.

> **Catatan:** Hasil deteksi merupakan **indikasi pola**, bukan bukti pasti bahwa sebuah teks ditulis oleh AI dan bukan persentase probabilitas kepengarangan.

## ✨ Fitur

* 🔍 **Detect** — analisis pola tulisan AI
* 🧠 **Local Analysis** — analisis langsung di browser
* 🤖 **Model Lokal** — model tambahan secara opsional
* 🌐 **Hybrid API** — analisis melalui backend secara opsional
* ✍️ **Humanizer** — membantu membuat tulisan lebih natural tanpa mengubah maksud
* 📝 **Summarize** — membuat ringkasan dari teks
* 💡 **Explain** — menampilkan alasan dan evidence dari hasil deteksi
* 📄 **Upload** — TXT, MD, PDF, dan DOCX
* 📋 **Copy & Export** — salin atau ekspor hasil analisis
* 📱 **Responsive** — mendukung desktop dan mobile

## 🔄 Alur Sistem

```text
Input Teks
   ↓
Validasi & Preprocessing
   ↓
Deteksi Sinyal
   ↓
Analisis Heuristik
   ↓
Model Lokal (opsional)
   ↓
Hybrid API (opsional)
   ↓
Gabungkan Hasil
   ↓
Validasi Hasil
   ↓
Tampilkan Score & Evidence
```

## 🔍 Detection

Sistem menganalisis beberapa karakteristik teks, seperti:

* Struktur kalimat
* Pola repetitif
* Variasi panjang kalimat
* Distribusi kata
* Pola transisi
* Konsistensi gaya
* Sinyal statistik lainnya

Hasil ditampilkan dalam bentuk **score, kategori, dan evidence** agar pengguna dapat meninjau alasan di balik hasil analisis.

## 🔒 Privacy

### Local Mode

Analisis berjalan di browser tanpa mengirim teks ke server.

### Hybrid Mode

Jika Hybrid API digunakan, teks dapat dikirim ke backend untuk diproses. Mode ini harus dipahami berbeda dari Local Mode.

Jangan memasukkan data sensitif atau dokumen pribadi ke mode Hybrid jika tidak diperlukan.

## 📊 Interpretasi Score

Score digunakan sebagai **indikator pola tulisan**, bukan probabilitas bahwa teks dibuat oleh AI.

Hasil sebaiknya digunakan sebagai bahan evaluasi bersama konteks tulisan, sumber referensi, dan pemeriksaan manusia.

## 🧪 Evaluation

Pengujian dilakukan menggunakan dataset dan test harness yang tersedia di repository.

```bash
node tests/faraztest.js
```

Hasil evaluasi dapat berubah mengikuti dataset, rule, dan versi detector yang digunakan.

## 🛠️ Menjalankan Secara Lokal

Clone repository:

```bash
git clone https://github.com/frzz969/ai-detector-mahasiswa.git
cd ai-detector-mahasiswa
```

Jalankan static server:

```bash
npx serve .
```

atau:

```bash
python -m http.server 8000
```

Kemudian buka alamat localhost yang diberikan oleh server.

## 📁 Struktur Repository

```text
ai-detector-mahasiswa/
├── api/              # Hybrid API
├── dataset/          # Dataset pengujian
├── docs/             # Dokumentasi
├── img/              # Asset gambar
├── js/               # Source JavaScript
├── referensi/        # Referensi detector
├── tests/            # Test harness
├── index.html        # Main interface
├── style.css         # Desktop styles
├── mobile.css        # Mobile styles
├── .env.example      # Environment example
└── README.md
```

## 🧩 Arsitektur

| Komponen          | Fungsi                  |
| ----------------- | ----------------------- |
| `index.html`      | Struktur aplikasi       |
| `style.css`       | Styling utama           |
| `mobile.css`      | Responsive layout       |
| `js/main.js`      | Entry point & UI        |
| `js/core.js`      | Core processing         |
| `js/detector.js`  | Detection logic         |
| `js/referensi.js` | Reference analysis      |
| `api/`            | Hybrid API              |
| `tests/`          | Regression & evaluation |

## 🚧 Status

| Komponen       | Status         |
| -------------- | -------------- |
| Frontend       | ✅ Active       |
| Local Detector | ✅ Active       |
| Humanizer      | ✅ Active       |
| Summarize      | ✅ Active       |
| Explain        | ✅ Active       |
| Export         | ✅ Active       |
| Upload         | ✅ Active       |
| GitHub Pages   | ✅ Active       |
| Local Model    | 🟡 Optional    |
| Hybrid API     | 🟡 Development |

## 🗺️ Roadmap

* [ ] Penyempurnaan dataset
* [ ] Peningkatan regression test
* [ ] Penyempurnaan model lokal
* [ ] Implementasi Hybrid API production
* [ ] Peningkatan akurasi pada teks akademik
* [ ] Penyempurnaan evidence dan explainability

## 📚 Dokumentasi

Dokumentasi pengembangan tersedia di:

```text
docs/
referensi/
AGENTS.md
```

## ⚠️ Limitasi

AI detector tidak dapat menentukan secara mutlak siapa yang menulis sebuah teks.

Hasil dapat dipengaruhi oleh:

* Gaya penulisan pengguna
* Bahasa dan struktur teks
* Panjang teks
* Proses editing
* Jenis dokumen
* Karakteristik dataset

Karena itu, hasil detector sebaiknya digunakan sebagai **alat bantu review**, bukan sebagai satu-satunya dasar penilaian akademik.

## 📌 Prinsip Proyek

> **Detect patterns. Review the evidence. Keep the final judgment human.**
