// referensi.js — data mesin dari referensi/*.md.
// Wajib dibaca mesin sebelum menilai.
// Dimuat sebelum humanizer, dipakai detector saat skor dihitung.
// Sumber: ref-1 ciri AI-vs-manusia, ref-2 contoh dan alur hibrida,
// ref-3 jurnal NLP Inovtek, ref-4 teknik humanisasi,
// ref-5 tata bahasa akademik, ref-6 kalimat efektif Trismanto 2016,
// ref-7 kohesi-koherensi Aquariza 2018, ref-8 diksi Ilham 2025.
// Aturan operasional: detector-rules, humanizer-rules, validation-rules.

// Dokumen aturan yang mengikat perilaku mesin.
const REF_RULE_DOCS = [
  "referensi/detector-rules.md",
  "referensi/humanizer-rules.md",
  "referensi/validation-rules.md",
];

// Provenance jurnal landasan, ditampilkan di laporan export.
const REF_PAPER =
  "Cahyana dkk. (2025). Analisis perbedaan teks AI dan manusia " +
  "(NLP: TF-IDF + Multinomial Naive Bayes, akurasi 99,35% pada data Inggris). " +
  "J. Inovtek Polbeng – Seri Informatika 10(2):1016–1025.";

// Provenance ref-5: 5 diterima, 1 ditolak (Abdulraheem 2024).
const REF_BOOK =
  "Mursalin, A. (2025). Tata Bahasa Itu Penting: Bagaimana Ketepatan Bahasa " +
  "Mempengaruhi Keberhasilan Artikel Ilmiah Internasional. " +
  "CV Angkasa Media Literasi. ISBN: 978-634-96179-2-5.";

// Frasa template generik tambahan dari draf AI di ref-2.
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

// Suara manusia tambahan dari karya manusia di ref-2.
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

// Pola detektor, satu-satunya sumber pola sinyal.
// Detector hanya menyusun regex. Provenance per grup ada di
// detector-rules.md §2/§4 dan referensi-*.

// Kata penghubung formal (detector-rules §2 sinyal 4).
const REF_CONNECTORS = [
  "selain itu",
  "dengan demikian",
  "selanjutnya",
  "furthermore",
  "moreover",
  "however",
  "therefore",
];

// Frasa manfaat generik, template khas model.
// Objeknya kabur dan berpola. Akademik manusia menyebut
// objek konkret disertai data atau sitasi.
const REF_HEDGE_PATS = [
  "memiliki peran yang penting",
  "memiliki peran yang signifikan",
  "memainkan peran penting",
  "memainkan peran yang penting",
  "memegang peranan penting",
  "berperan penting",
  "berperan signifikan",
  "dapat meningkatkan",
  "membantu meningkatkan",
  "meningkatkan kualitas",
  "meningkatkan efektivitas",
  "meningkatkan efisiensi",
  "meningkatkan produktivitas",
  "dapat memberikan",
  "memberikan berbagai",
  "berbagai kemudahan",
  "berbagai manfaat",
  "berbagai fitur",
  "dampak yang positif",
  "manfaat yang positif",
  "diharapkan dapat",
  "diharapkan memberikan",
  "menawarkan berbagai",
  "dirancang untuk membantu",
  "dapat mendukung",
];

// Penanda enumerasi kaku ID/EN (detector-rules §2 sinyal 6).
const REF_ENUM_ID = [
  "pertama",
  "kedua",
  "ketiga",
  "keempat",
  "selanjutnya",
  "terakhir",
];
const REF_ENUM_EN = [
  "first",
  "second",
  "third",
  "fourth",
  "finally",
  "lastly",
];

// S1 ID-Scaffold Dispersion, leksikon union tambahan.
// Union = AI_ID + ACAD_NEUTRAL + array ini. Ordinal
// pertama/kedua/ketiga di awal kalimat ditangani lewat
// regex posisi di detector, bukan substring.
const REF_ID_SCAFFOLD = [
  "pada akhirnya",
  "secara keseluruhan",
  "perlu diingat",
  "diingat bahwa",
  "kesimpulannya",
];

// Istilah metodologi, academic convention bukan bukti AI.
// "bab [1-5]" ditulis sebagai fragmen regex dalam satu entry.
const REF_ACADEMIC_METH = [
  "metode",
  "metodologi",
  "variabel",
  "responden",
  "sampel",
  "populasi",
  "observasi",
  "wawancara",
  "kuesioner",
  "hipotesis",
  "instrumen",
  "jurnal",
  "penelitian",
  "bab [1-5]",
  "skripsi",
  "tesis",
];

// Suara personal atau opini, tanda manusia.
const REF_PERSONAL_VOICE = [
  "saya",
  "aku",
  "gue",
  "kami",
  "kita",
  "menurutku",
  "menurut saya",
  "saya rasa",
  "sejujurnya",
  "terus terang",
  "pengalaman",
  "bagiku",
  "don't",
  "can't",
  "won't",
  "it's",
  "that's",
  "i think",
  "in my opinion",
];

// Frasa generik atau template berulang.
const REF_FLUFFY = [
  "sangat penting",
  "perlu diperhatikan",
  "perlu diketahui",
  "dapat meningkatkan",
  "dapat membantu",
  "membantu meningkatkan",
  "berbagai macam",
  "secara umum",
  "pada umumnya",
  "hal tersebut",
];

// Ekspresi hidup khas manusia, tanpa klaim lolos deteksi.
const REF_VOICE_LIVE = [
  "coba",
  "rasakan",
  "dapatkan",
  "nikmati",
  "bayangkan",
  "jangan lewatkan",
  "gratis",
  "garansi",
  "seperti",
  "bagai",
  "ibarat",
  "laksana",
  "umpama",
  "kisah",
  "ceritaku",
  "jujur",
];

// Level kalimat: metodologi tidak dihukum karena bukti riset manusia.
const REF_SENT_PERSONAL = [
  "saya",
  "gue",
  "aku",
  "dosen saya",
  "pengalaman",
  "menurutku",
  "menurut saya",
  "sejujurnya",
  "terus terang",
  "bayangkan",
  "jujur",
  "kisah",
  "don't",
  "can't",
  "won't",
  "i think",
  "in my opinion",
];

// Frasa template generik per kalimat.
const REF_SENT_TEMPLATE = [
  "sangat penting",
  "dapat meningkatkan",
  "membantu meningkatkan",
  "secara umum",
  "pada umumnya",
  "memainkan peran penting",
  "tidak dapat dipungkiri",
];

// Kata data atau riset per kalimat.
const REF_SENT_DATA = [
  "responden",
  "kasus",
  "mahasiswa",
  "persen",
];

// Pasangan penyederhanaan akademik, formal dipertahankan.
// Sengaja tanpa dapat→bisa atau merupakan→adalah massal.
// Penghapus hanya bila muncul lebih dari sekali. Struktur
// ditangani humanizeText, bukan sinonim.
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

  // Dari ref-6, pemangkasan formal yang aman untuk skripsi.
  // Aturan penghapus tetap lewat frequency guard di humanizeText.
  [/tersebut di atas/gi, "tersebut"],
  [/mau tidak mau[,\s]?/gi, ""],
  [/itu sendiri/gi, "itu"],
  [/beberapa ([a-z]+)-\1/gi, "beberapa $1"],
  [/dalam rangka peningkatan/gi, "untuk meningkatkan"],

  // Dari ref-8, koreksi formal yang maknanya pasti.
  [/sesuai bagi/gi, "sesuai dengan"],
  [/hakekat/gi, "hakikat"],
  [/dilegalisir/gi, "dilegalisasi"],
  [/bukan hanya([\s\S]{0,80}?)melainkan juga/gi, "bukan hanya$1tetapi juga"],
];
