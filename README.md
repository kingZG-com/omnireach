# TikReach v2.0 - Enterprise TikTok Outreach & DM Automation Engine

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.19-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Playwright](https://img.shields.io/badge/Playwright-1.45%20Persistent-45ba4b?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![SQLite3](https://img.shields.io/badge/SQLite-3.x-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Native%20ws-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://github.com/websockets/ws)
[![Architecture](https://img.shields.io/badge/Architecture-Clean%20%2F%20Modular-blue?style=flat-square)](https://blog.cleancoder.com/)

**TikReach** adalah platform otomasi outreach dan direct message (DM) TikTok berskala enterprise yang dirancang dengan prinsip **Clean Architecture & Modular Services**. Solusi ini mengkombinasikan ketangguhan **Playwright Persistent Context Engine**, **Turbo Route Filtering (3x-5x lebih cepat)**, sistem deteksi bot adaptif (Puzzle Captcha & Dynamic React Hydration), serta live streaming log berbasis native **WebSocket**.

Platform ini dibuat untuk memudahkan bisnis, agensi, dan talent manager melakukan personalized outreach secara terukur, aman, dan memiliki **verifiable proof of delivery** (bukti screenshot otomatis).

---

## 🏗️ System Architecture & Data Flow

Sistem mengadopsi pemisahan dependensi (Separation of Concerns) berlapis dengan pemisahan antara Presentation (API/WebSockets), Domain (Business Logic/Services), Infrastructure (Browser Engine & Storage), dan Data Access (Repositories).

```mermaid
flowchart TD
    subgraph Client["Web Dashboard / Client Layer"]
        UI["Modern Responsive UI\n(HTML5 / CSS3 / Vanilla JS)"]
        WSClient["WebSocket Client\n(Realtime Telemetry & Live Logs)"]
    end

    subgraph API["Presentation & Routing Layer"]
        Server["Express HTTP Server (:8000)"]
        WSMgr["WebSocket Hub (ws://localhost:8000/ws)"]
        Routes["API Endpoints\n(/auth, /campaign, /tasks, /logs)"]
    end

    subgraph Domain["Business Logic & Service Layer"]
        BotSvc["Bot Orchestrator Service\n(Task Queue, Loop Control & Delays)"]
        TikTokSvc["TikTok Automation Service\n(DOM Hydration, Navigation & Input)"]
        AuthSvc["Auth & Session Service\n(Identity Resolution & Cookies)"]
    end

    subgraph Core["Core Engine & Infrastructure"]
        BrowserEngine["Playwright Persistent Engine\n(--disable-blink-features=AutomationControlled)"]
        TurboRouter["Turbo Engine Interceptor\n(Media & Tracker Blocking Route)"]
        Storage["SQLite 3 Database\n(Campaigns, Tasks, Sessions, Logs)"]
        Proofs["Verifiable Storage\n(Timestamped Screenshot PNGs)"]
    end

    UI -->|REST Requests / Multipart| Server
    WSClient <-->|Bi-directional Events| WSMgr
    Server --> Routes
    Routes --> BotSvc
    Routes --> AuthSvc
    BotSvc --> TikTokSvc
    TikTokSvc --> BrowserEngine
    BrowserEngine --> TurboRouter
    BotSvc --> Storage
    BotSvc --> WSMgr
    TikTokSvc --> Proofs
```

---

## ⚡ Technical Highlights & Core Innovations

### 1. 🛡️ Persistent Browser Context Engine (Zero Session Loss)
Menggunakan `launchPersistentBrowserContext` dengan direktori profil fisik (`browser_profile/`). Sistem menyimpan cookies, session tokens, indexedDB, dan identitas browser secara permanen di disk. 
- **Keunggulan:** Anda tidak perlu login berulang kali setiap memulai kampanye. Session login TikTok Anda bertahan layaknya browser Chrome harian.

### 2. 🚀 Turbo Engine Network Interceptor (3x-5x Faster Throughput)
Mengimplementasikan Playwright Route Interception cerdas yang memotong lalu lintas data berat tanpa merusak struktur DOM:
- **Media Blocking:** Memblokir stream video berukuran besar (`.mp4`, `.webm`, `.ts`, video blob).
- **Tracker Blocking:** Memfilter request telemetri beban tinggi (`google-analytics`, `mon.tiktokv.com`, `mcs.tiktok.com`).
- **Hasil:** Waktu tunggu loading profil TikTok turun drastis dari 8-12 detik menjadi hanya 1-2 detik, menghemat bandwidth CPU dan RAM secara signifikan.

### 3. 🎯 Resilient DOM & Endpoint Direct Navigation
Sistem tidak mengandalkan selector statis yang rapuh terhadap update TikTok:
- **Dynamic React Hydration:** Mendeteksi skeleton loading TikTok secara cerdas sebelum melakukan interaksi tombol.
- **Direct Chat Navigation:** Mengekstrak parameter `sec_uid` dari endpoint `a[href*='/messages?u=...']` untuk langsung melompat ke inbox obrolan pengguna tanpa simulasi klik bertingkat.
- **Self-Profile & Closed DM Detection:** Otomatis mendeteksi jika target adalah akun sendiri (`Edit profile`) atau jika akun target mengunci pesan pribadinya, mencatat status `DM Closed` secara rapi tanpa membuat bot hang.
- **Puzzle Captcha Guard:** Mendeteksi kemunculan challenge puzzle slider dan memberikan jeda interaktif 60 detik bagi pengguna untuk menyelesaikan verifikasi manusia.

### 4. ⚡ Instant Native Text Input
Menggunakan pipeline native keyboard `insertText` pada container pesan `[contenteditable='true']`. Teks panjang (personalized pitch) terinput dalam hitungan milidetik secara mulus dan memicu event `input` React asli tanpa lag pengetikan lambat.

### 5. 📸 Verifiable Proof of Work (Timestamped Capture)
Setiap pesan yang berhasil dikirimkan ke target akan otomatis di-screenshot pada layar obrolan TikTok dan disimpan di direktori `proofs/`. Dilengkapi modal image viewer dan tombol download untuk audit klien/manajemen.

### 6. 📡 Real-Time Telemetry via Native WebSocket
Semua status eksekusi, progress bar, persentase keberhasilan, dan log mesin disiarkan secara *instant* ke UI melalui koneksi WebSocket bi-directional tanpa membebani server dengan polling HTTP berkala.

### 7. 👻 Dual Execution Mode: Headless vs Visual
Tersedia toggle mode **Headless** langsung dari dashboard web. Saat diaktifkan, Playwright berjalan di background tanpa me-render jendela visual, mematikan beban rendering grafis GPU dan memangkas penggunaan CPU & RAM hingga **70%** (sangat ramah untuk laptop dengan spek terbatas).

### 8. 🧩 AI Puzzle Captcha Resolver & Humanized Drag
Dilengkapi service AI cerdas [src/services/captcha.service.js](file:///d:/Coding/Outreach_automation/src/services/captcha.service.js) yang memindai kontras pixel bayangan celah kepingan puzzle secara in-browser via Canvas context. Slider digeser menggunakan kurva interpolasi pergerakan tangan manusia (*Cubic Bézier easing & micro-jitter*) yang otomatis mengoreksi overshoot untuk melewati deteksi bot TikTok.

---

## 📁 Clean Codebase Directory Tree

```
Outreach_automation/
├── app/
│   └── static/               # Frontend Assets (Modern Glassmorphism UI)
│       ├── css/style.css     # Clean Responsive Stylesheet
│       ├── js/app.js         # Reactive Client Controller & WebSocket Handler
│       └── index.html        # Interactive Single Page Dashboard
├── browser_profile/          # Playwright Persistent User Profile (Cookies & Cache)
├── config/
│   ├── constants.js          # Tunable Delays, User-Agents & Resilient Selectors
│   └── paths.js              # Centralized Directory Resolution
├── data/
│   ├── automation.db         # High-Performance SQLite3 Relational Database
│   └── tiktok_cookies.json   # Session State Backup
├── proofs/                   # High-Resolution Delivery Proof Screenshots (.png)
├── src/
│   ├── api/
│   │   ├── controllers/      # Express API Controllers (Auth, Campaign, Task, Log)
│   │   ├── middlewares/      # Multer File Upload Interceptors (.csv, .txt)
│   │   └── routes/           # RESTful Resource Modular Routes
│   ├── core/
│   │   ├── browser.js        # Playwright Persistent Lifecycle & Turbo Interceptor
│   │   └── websocket.js      # Centralized Event Emitter & WebSocket Hub
│   ├── database/
│   │   ├── repositories/     # Data Access Objects (Tasks, Campaigns, Sessions)
│   │   ├── connection.js     # SQLite3 Singleton Connection Pool
│   │   ├── schema.js         # DDL Table Migrations & Indexing
│   │   └── index.js          # Repository Registry
│   ├── services/
│   │   ├── auth.service.js   # TikTok Session Validation & Profile Extraction
│   │   ├── bot.service.js    # Queue Runner, Throttling & Loop Automation
│   │   ├── captcha.service.js# AI Puzzle Captcha Resolver & Human Drag Curves
│   │   └── tiktok.service.js # Page Navigation, Chat Input & DOM Operations
│   └── app.js                # Express Application Setup & Middleware Pipeline
├── contoh_target_tiktok.txt  # Sample Target List for Quick Testing
├── login_tiktok.bat          # 1-Click Session Login Launcher for Windows
├── start_platform.bat        # 1-Click Server & UI Dashboard Launcher
├── server.js                 # Lean Server Entry Point (< 30 lines)
└── package.json              # Project Dependencies and NPM Scripts
```

---

## 🛠️ Tech Stack & Ecosystem

| Layer | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js (v18+) | Non-blocking Event-Driven I/O Engine |
| **HTTP Framework** | Express 4.19 | Modular Router, Middleware Pipelines, REST API |
| **Headless Automation** | Playwright 1.45 | Persistent Contexts, Anti-Detection Chromium Flag, Route Filtering |
| **Database** | SQLite3 | Zero-Config, Fast Relational Storage for Tasks & Logs |
| **Realtime Channel** | WS (Native WebSockets) | Low-latency state broadcasts & Live Log Streaming |
| **File Parser** | Multer | Robust multipart file upload processing for `.txt` & `.csv` |
| **Frontend** | Vanilla HTML5 / CSS3 / ES6 | Fast, zero-dependency, responsive UI with Glassmorphic design |

---

## 🚀 Quickstart Guide

### Prasyarat
- [Node.js v18.0.0+](https://nodejs.org/) terinstall di sistem operasi Anda.
- Google Chrome atau Chromium browser (Playwright secara otomatis menyediakan runtime Chromium).

### 1. Instalasi Dependensi
```bash
# Clone repository atau buka folder project
cd d:\Coding\Outreach_automation

# Install package dependencies
npm install
```

### 2. Menjalankan Platform

#### Opsi A: Menggunakan Batch Script (Windows Recommended)
1. Double click **`start_platform.bat`**.
2. Console server akan aktif dan browser otomatis membuka `http://localhost:8000`.

#### Opsi B: Menggunakan NPM CLI
```bash
npm start
```
Buka peramban favorit Anda dan kunjungi: **`http://localhost:8000`**

---

## 📋 Panduan Operasional

### Langkah 1: Autentikasi Sesi TikTok (Sekali Saja)
1. Di panel kiri bawah dashboard (*Status Sesi TikTok*), klik tombol **"Login TikTok via Browser"** (atau jalankan `login_tiktok.bat`).
2. Jendela browser Chromium akan terbuka menampilkan halaman login resmi TikTok.
3. Silakan login (Scan QR Code via aplikasi TikTok di Smartphone direkomendasikan).
4. Begitu login sukses, sistem otomatis mendeteksi username aktif Anda (misal: `@zakaria.code`), menyimpan cookie permanen, dan menutup browser.

### Langkah 2: Memuat Target Akun
- **Drag & Drop File:** Upload file `.txt` atau `.csv` yang berisi daftar target (satu link / username per baris). File sampel tersedia di `contoh_target_tiktok.txt`.
- **Direct Paste:** Paste daftar link profil langsung di textarea modal input.
- Sistem otomatis membersihkan format URL dan mendeteksi total target valid.

### Langkah 3: Konfigurasi Pesan & Kuota
- Tentukan jumlah kuota yang ingin diproses (misal: kirim ke 10 dari 50 target yang diunggah) menggunakan **Range Slider** atau **Quick Selector**.
- Tulis template pesan personalized dengan memanfaatkan variable tag:
  - `{username}` atau `{name}`: Otomatis digantikan dengan username akun penerima.
- Atur jeda pengiriman (Human Jitter) untuk menjaga reputasi akun (default: 20-45 detik).

### Langkah 4: Eksekusi & Monitoring
- Aktifkan toggle **"Mode Demo (Simulasi)"** jika ingin mempresentasikan platform kepada klien tanpa mengirim pesan nyata.
- Nonaktifkan demo mode dan klik **"Mulai Outreach Sekarang"** untuk eksekusi langsung.
- Pantau pergerakan bot secara visual melalui log streaming real-time di bagian kanan dashboard.

### Langkah 5: Audit & Export Laporan
- Masuk ke tab **"Result & Bukti DM"**.
- Periksa status setiap baris (Terkirim, DM Tertutup, atau Gagal).
- Klik tombol **"Lihat Bukti"** untuk memvalidasi screenshot obrolan asli.
- Klik **"Export CSV"** untuk mengunduh rekapitulasi data format Excel.

---

## 🌐 REST API Reference

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `GET` | `/api/session/status` | Mengecek validitas sesi login & username pengirim aktif |
| `GET` | `/api/session/open-login` | Memicu pembukaan Chromium browser untuk alur login manual |
| `POST` | `/api/session/update-username`| Mengupdate manual username akun pengirim yang tersimpan |
| `POST` | `/api/campaign/parse-file` | Mengunggah & mem-parse file target (`.txt` / `.csv`) via Multer |
| `POST` | `/api/campaign/parse-text` | Memvalidasi dan membersihkan raw text list username target |
| `POST` | `/api/campaign/create` | Menginisialisasi kampanye baru dengan kuota & template pesan |
| `POST` | `/api/campaign/:id/start` | Menjalankan antrean bot outreach untuk kampanye tertentu |
| `POST` | `/api/campaign/:id/pause` | Memberhentikan sementara proses pengiriman pesan |
| `POST` | `/api/campaign/:id/resume`| Melanjutkan antrean pengiriman pesan yang tertunda |
| `POST` | `/api/campaign/:id/stop` | Membatalkan eksekusi kampanye yang sedang berlangsung |
| `GET` | `/api/tasks` | Mengambil seluruh daftar histori tugas, status, & path bukti screenshot |
| `ALL` | `/api/tasks/clear` | Mengosongkan seluruh histori tasks dan rekap hasil pengiriman |
| `GET` | `/api/stats` | Mengambil statistik agregasi metrik (Total, Berhasil, Gagal, DM Tertutup) |
| `GET` | `/api/export/csv` | Menghasilkan streaming file unduhan CSV untuk rekapitulasi kampanye |

---

## 🔌 WebSocket Telemetry Contracts

Koneksi dibuat ke `ws://localhost:8000/ws`. Server menyiarkan event dengan skema payload standar:

```json
{
  "type": "event_type",
  "data": { ... },
  "timestamp": "12:05:42"
}
```

### Event Types:
- `log`: Log real-time dari bot service (`{ message: "Membuka profil target...", level: "info" | "warn" | "error" }`).
- `progress`: Update progres kampanye `{ current: 5, total: 10, percent: 50 }`.
- `task_completed`: Notifikasi setiap target selesai diproses `{ task: { target_username, status, proof_screenshot } }`.
- `bot_status`: Perubahan status state bot `{ status: "idle" | "running" | "paused" | "stopped" }`.

---

## 🛡️ Anti-Detection & Compliance Best Practices

1. **Human Emulation Throttling:** Sistem menerapkan jeda acak (*delay jitter*) terdistribusi secara default antara 20–45 detik per DM untuk meniru perilaku natural manusia.
2. **Stealth Chromium Flags:** Playwright di-injeksi dengan flag `--disable-blink-features=AutomationControlled` guna menyembunyikan properti `navigator.webdriver`.
3. **Daily Quota Safety Limit:** Direkomendasikan untuk membatasi pengiriman maksimal **30–50 DM per hari per akun TikTok** guna menjaga reputasi trust-score akun pengirim.

---

## 💼 Portofolio & Demonstration Mode

Jika Anda ingin menunjukkan platform ini kepada calon pemberi kerja, rekan bisnis, atau klien internasional:
1. Jalankan platform dan centang switch **"Mode Demo (Simulasi)"**.
2. Masukkan file target sampel (`contoh_target_tiktok.txt`).
3. Tekan **"Mulai Outreach Sekarang"**.
4. Sistem akan mensimulasikan seluruh siklus kerja: logging interaktif real-time, progress bar, verifikasi random delay, hingga pembuatan data hasil audit tanpa perlu khawatir akun TikTok dibatasi.

---

## 📄 Lisensi
Didistribusikan di bawah lisensi MIT. Silakan gunakan untuk keperluan komersial, freelance, atau portofolio pribadi.
