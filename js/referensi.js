// referensi.js — Data mesin dari referensi/*.md. WAJIB dibaca mesin sebelum menilai.
// File 3 dari 4 (dimuat sebelum humanizer; dipakai detector saat skor dihitung).
// Sumber: ref-1 ciri AI-vs-manusia (ciri 1-5); ref-2 contoh & alur hibrida;
// ref-3 jurnal NLP Inovtek (validasi sinyal, batas EN); ref-4 teknik humanisasi
// (tanpa klaim "jaminan lolos"); ref-5 tata bahasa akademik (error pembelajar =
// manusia non-native, bukan AI); ref-6 kalimat efektif Trismanto 2016 (kualitas,
// bukan vonis AI); ref-7 kohesi-koherensi Aquariza 2018; ref-8 diksi Ilham 2025.
// Aturan operasional (WAJIB dibaca code agent sebelum ubah mesin):
//         referensi/detector-rules.md   (skor, sinyal, FP protection)
//         referensi/humanizer-rules.md  (register akademik, minimal edit)
//         referensi/validation-rules.md (gates, rescan, regresi, jujur UI)
// Muat SETELAH detector.js. Cek error: sinyal 10 / humanizer aneh → buka file ini.

// Dokumen aturan yang mengikat perilaku mesin (lihat folder referensi).
const REF_RULE_DOCS = [
  "referensi/detector-rules.md",
  "referensi/humanizer-rules.md",
  "referensi/validation-rules.md",
];

// Provenance: sitasi jurnal yang dipakai sebagai landasan
// (ditampilkan di laporan export agar sumber jelas)
const REF_PAPER = "Cahyana dkk. (2025). Analisis perbedaan teks AI dan manusia (NLP: TF-IDF + Multinomial Naive Bayes, akurasi 99,35% pada data Inggris). J. Inovtek Polbeng – Seri Informatika 10(2):1016–1025.";

// Provenance ref-5: 5 diterima (Adalia 2025; Aboras 2024; Abendan dkk. 2024;
// Abdulla & Al-Azawi 2024; Adawiyah & Yani 2024), 1 ditolak (Abdulraheem 2024).
const REF_BOOK = "Mursalin, A. (2025). Tata Bahasa Itu Penting: Bagaimana Ketepatan Bahasa Mempengaruhi Keberhasilan Artikel Ilmiah Internasional. CV Angkasa Media Literasi. ISBN: 978-634-96179-2-5.";

// Frasa template generik tambahan dari draf AI di Ref-2 (faktual tapi umum).
const REF_FLUFF_EXTRA = [
  "semakin populer",
  "kini menawarkan",
  "telah mengubah",
  "membantu bisnis",
  "gunakan dasbor",
  "membuat keputusan yang lebih baik",
  "sempurna untuk",
  "menjaga minuman",
];

// Suara manusia tambahan dari karya manusia di Ref-2 (ajakan/CTA konkret).
const REF_VOICE_EXTRA = [
  "perkenalkan",
  "berangkatlah",
  "masukkan ke dalam",
  "lebih sedikit",
  "lebih banyak",
  "hubungi",
  "segera",
  "tanpa perlu",
  "risiko",
  "kampanye",
];

// POLA DETEKTOR (data-driven) — satu-satunya sumber pola sinyal; detector hanya
// menyusun regex. Provenance per grup: detector-rules.md §2/§4 + referensi-*.

// Kata penghubung formal (detector-rules §2 sinyal 4; ref-7: konjungsi = syarat kohesi).
const REF_CONNECTORS = [
  "selain itu", "dengan demikian", "selanjutnya",
  "furthermore", "moreover", "however", "therefore",
];

// Frasa "manfaat generik" — template khas model (detector-rules §2 sinyal 2/9).
// Objek kabur + berpola; akademik manusia menyebut objek konkret + data/sitasi.
const REF_HEDGE_PATS = [
  "memiliki peran yang penting", "memiliki peran yang signifikan",
  "memainkan peran penting", "memainkan peran yang penting",
  "memegang peranan penting", "berperan penting", "berperan signifikan",
  "dapat meningkatkan", "membantu meningkatkan",
  "meningkatkan kualitas", "meningkatkan efektivitas", "meningkatkan efisiensi", "meningkatkan produktivitas",
  "dapat memberikan", "memberikan berbagai", "berbagai kemudahan", "berbagai manfaat", "berbagai fitur",
  "dampak yang positif", "manfaat yang positif",
  "diharapkan dapat", "diharapkan memberikan", "menawarkan berbagai",
  "dirancang untuk membantu", "dapat mendukung",
];

// Penanda enumerasi kaku ID/EN (detector-rules §2 sinyal 6).
const REF_ENUM_ID = ["pertama", "kedua", "ketiga", "keempat", "selanjutnya", "terakhir"];
const REF_ENUM_EN = ["first", "second", "third", "fourth", "finally", "lastly"];

// Istilah metodologi — academic convention, BUKAN bukti AI (detector-rules §4).
// "bab [1-5]" fragmen regex agar satu entry.
const REF_ACADEMIC_METH = [
  "metode", "metodologi", "variabel", "responden", "sampel", "populasi",
  "observasi", "wawancara", "kuesioner", "hipotesis", "instrumen",
  "jurnal", "penelitian", "bab [1-5]", "skripsi", "tesis",
];

// Suara personal/opini — tanda manusia (detector-rules §2 sinyal 7).
const REF_PERSONAL_VOICE = [
  "saya", "aku", "gue", "kami", "kita", "menurutku", "menurut saya",
  "saya rasa", "sejujurnya", "terus terang", "pengalaman", "bagiku",
  "don't", "can't", "won't", "it's", "that's", "i think", "in my opinion",
];

// Frasa generik/template berulang (detector-rules §2 sinyal 2/9).
const REF_FLUFFY = [
  "sangat penting", "perlu diperhatikan", "perlu diketahui",
  "dapat meningkatkan", "dapat membantu", "membantu meningkatkan",
  "berbagai macam", "secara umum", "pada umumnya", "hal tersebut",
];

// Ekspresi "hidup" manusia (detector-rules §2 sinyal 8; tanpa klaim "lolos deteksi").
const REF_VOICE_LIVE = [
  "coba", "rasakan", "dapatkan", "nikmati", "bayangkan",
  "jangan lewatkan", "gratis", "garansi", "seperti", "bagai",
  "ibarat", "laksana", "umpama", "kisah", "ceritaku", "jujur",
];

// Level kalimat (validation-rules §4): metodologi TIDAK dihukum (bukti riset manusia).
const REF_SENT_PERSONAL = [
  "saya", "gue", "aku", "dosen saya", "pengalaman", "menurutku",
  "menurut saya", "sejujurnya", "terus terang", "bayangkan", "jujur",
  "kisah", "don't", "can't", "won't", "i think", "in my opinion",
];
// Frasa template generik per kalimat.
const REF_SENT_TEMPLATE = [
  "sangat penting", "dapat meningkatkan", "membantu meningkatkan",
  "secara umum", "pada umumnya", "memainkan peran penting",
  "tidak dapat dipungkiri",
];
// Kata data/riset per kalimat.
const REF_SENT_DATA = ["responden", "kasus", "mahasiswa", "persen"];

// Pasangan penyederhanaan akademik — formal dipertahankan (SENGAJA tanpa
// dapat→bisa / merupakan→adalah massal). Penghapus ("") hanya bila muncul >1x;
// formal→formal; struktur ditangani humanizeText, bukan sinonim.
const REF_HUMANIZE_EXTRA = [
  [/pada dasarnya/gi, ""],
  [/secara keseluruhan/gi, ""],
  [/dapat dikatakan bahwa/gi, ""],
  [/perlu diketahui bahwa/gi, ""],
  [/perlu diperhatikan bahwa/gi, ""],
  [/sebagaimana telah dijelaskan sebelumnya/gi, ""],
  [/berdasarkan uraian tersebut/gi, "berdasarkan uraian"],
  [/dalam konteks ini/gi, ""],

  [/memiliki peran penting dalam/gi, "berperan dalam"],
  [/memberikan dampak yang signifikan terhadap/gi, "berpengaruh terhadap"],
  [/memberikan berbagai manfaat/gi, "memberikan manfaat"],
  [/memberikan kontribusi yang signifikan/gi, "berkontribusi"],
  [/dapat memberikan manfaat/gi, "memberikan manfaat"],
  [/dapat membantu dalam/gi, "membantu"],
  [/dapat digunakan untuk/gi, "digunakan untuk"],

  [/berbagai macam/gi, "berbagai"],
  [/pada saat ini/gi, "saat ini"],
  [/terdapat adanya/gi, "terdapat"],
  [/adanya suatu/gi, "adanya"],

  [/dalam rangka untuk/gi, "untuk"],
  [/dalam rangka/gi, "untuk"],
  [/bertujuan untuk dapat/gi, "bertujuan untuk"],
  [/digunakan sebagai sarana untuk/gi, "digunakan untuk"],
  [/memiliki kemampuan untuk/gi, "mampu"],
  [/melakukan upaya untuk/gi, "berupaya untuk"],

  [/oleh karena itu maka/gi, "oleh karena itu"],
  [/dengan demikian maka/gi, "dengan demikian"],
  [/sehingga dengan demikian/gi, "sehingga"],
  [/selain daripada itu/gi, "selain itu"],

  [/hal ini menunjukkan bahwa/gi, "temuan ini menunjukkan bahwa"],
  [/hal tersebut menunjukkan bahwa/gi, "temuan tersebut menunjukkan bahwa"],
  [/hal ini dapat dilihat dari/gi, "hal ini terlihat dari"],

  [/merupakan salah satu faktor yang penting/gi, "menjadi salah satu faktor penting"],
  [/merupakan hal yang penting/gi, "penting"],
  [/merupakan suatu hal yang/gi, "merupakan hal yang"],
  [/dalam hal melakukan/gi, "dalam melakukan"],
  [/terkait dengan hal tersebut/gi, "terkait hal tersebut"],
  [/berkaitan dengan hal tersebut/gi, "berkaitan dengan hal tersebut"],

  // Dari referensi-6 (Trismanto 2016: kehematan/kelugasan) —
  // pemangkasan formal; aman untuk skripsi. Aturan "" / berulang
  // tetap lewat frequency guard di humanizeText (muncul 1x → dilewati).
  [/tersebut di atas/gi, "tersebut"],
  [/mau tidak mau[,\s]?/gi, ""],
  [/itu sendiri/gi, "itu"],
  [/beberapa ([a-z]+)-\1/gi, "beberapa $1"],
  [/dalam rangka peningkatan/gi, "untuk meningkatkan"],

  // Dari referensi-8 (Ilham dkk. 2025: idiom baku) — koreksi formal
  // yang maknanya pasti; tetap lewat frequency guard bila berulang.
  [/sesuai bagi/gi, "sesuai dengan"],
  // Dari referensi-8 lanjutan (ejaan baku) — hanya pasangan yang
  // maknanya pasti; yang ambigu (interferensi/inferensi, sarat/syarat)
  // SENGAJA tidak dijadikan aturan agar mesin tidak menebak.
  [/hakekat/gi, "hakikat"],
  [/dilegalisir/gi, "dilegalisasi"],
  [/bukan hanya([\s\S]{0,80}?)melainkan juga/gi, "bukan hanya$1tetapi juga"],
];
