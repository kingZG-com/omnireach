// TikReach - Frontend Client Application
let loadedTargets = [];
let activeCampaignId = null;
let ws = null;
let allTasks = [];

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initWebSocket();
  initBrowserLogin();
  checkSessionStatus();
  initFileUploader();
  initLimitControls();
  initCampaignActions();
  initResultsPage();
  loadLatestCampaign();
  loadStats();
});

// 1. Navigation
function initNavigation() {
  const tabs = [
    { nav: "nav-dashboard", pane: "tab-dashboard", title: "Dashboard & Outreach Campaign", sub: "Otomatisasi pengiriman pesan TikTok langsung ke target list Anda" },
    { nav: "nav-results", pane: "tab-results", title: "Result & Bukti Pengiriman DM", sub: "Bukti screenshot obrolan terkirim dan ringkasan target selesai", onShow: loadResultsTable },
    { nav: "nav-logs", pane: "tab-logs", title: "Live Logs & Audit Trail", sub: "Pantau setiap aktivitas robot browser secara mendalam", onShow: loadFullLogs }
  ];

  tabs.forEach(tab => {
    const navEl = document.getElementById(tab.nav);
    if (!navEl) return;
    navEl.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"));

      navEl.classList.add("active");
      const targetPane = document.getElementById(tab.pane);
      if (targetPane) targetPane.classList.add("active");

      document.getElementById("page-title").textContent = tab.title;
      document.getElementById("page-subtitle").textContent = tab.sub;

      if (tab.onShow) tab.onShow();
    });
  });

  // Upload Tabs switch (Upload File vs Paste Manual)
  const btnTabUpload = document.getElementById("btn-tab-upload");
  const btnTabPaste = document.getElementById("btn-tab-paste");
  const dropZone = document.getElementById("drop-zone");
  const pasteZone = document.getElementById("paste-zone");

  btnTabUpload.addEventListener("click", () => {
    btnTabUpload.classList.add("active");
    btnTabPaste.classList.remove("active");
    dropZone.style.display = "block";
    pasteZone.style.display = "none";
  });

  btnTabPaste.addEventListener("click", () => {
    btnTabPaste.classList.add("active");
    btnTabUpload.classList.remove("active");
    pasteZone.style.display = "block";
    dropZone.style.display = "none";
  });

  // Refresh status button
  document.getElementById("btn-refresh-status").addEventListener("click", () => {
    checkSessionStatus();
    loadLatestCampaign();
    loadStats();
    appendLog("INFO", "Status sistem dimuat ulang.");
  });
}

// 2. WebSocket Real-time Updates
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected to TikReach server");
    // Heartbeat
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 25000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    } catch (e) {
      // not JSON (e.g. pong)
    }
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected, reconnecting in 3s...");
    setTimeout(initWebSocket, 3000);
  };
}

function handleWsMessage(msg) {
  if (msg.type === "live_reload") {
    console.log("[OmniReach] Realtime change detected in", msg.data?.file, "- Auto-refreshing...");
    window.location.reload();
    return;
  }
  if (msg.type === "log") {
    appendLog(msg.data.level, msg.data.message);
  } else if (msg.type === "task_updated") {
    const { task_id, username, status, processed, total } = msg.data;
    updateProgress(processed, total);
    appendLog(status === "sent" ? "SUCCESS" : (status === "dm_closed" ? "WARN" : "ERROR"), 
              `Target @${username} diperbarui: status = ${status}`);
    loadStats();
    // Refresh table if visible
    if (document.getElementById("tab-results").classList.contains("active")) {
      loadResultsTable();
    }
  } else if (msg.type === "campaign_status") {
    updateCampaignUIStatus(msg.data.status);
  } else if (msg.type === "login_success") {
    checkSessionStatus();
    const uname = msg.data.username || "Aktif";
    appendLog("SUCCESS", `Berhasil Login ke TikTok! Akun @${uname} telah tersimpan dan siap digunakan.`);
    alert(`🎉 Login Berhasil!\n\nAkun TikTok @${uname} telah berhasil terhubung.`);
  } else if (msg.type === "tasks_cleared") {
    allTasks = [];
    filterAndRenderResults();
    loadStats();
  }
}

function appendLog(level, message) {
  const consoleBox = document.getElementById("console-logs");
  if (!consoleBox) return;

  const now = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = `log-line ${level.toLowerCase()}`;
  line.innerHTML = `<span style="opacity:0.6">[${now}]</span> [${level}] ${escapeHtml(message)}`;
  consoleBox.appendChild(line);
  consoleBox.scrollTop = consoleBox.scrollHeight;

  // Also add to full log if element exists
  const fullLog = document.getElementById("full-log-viewer");
  if (fullLog) {
    const fullLine = line.cloneNode(true);
    fullLog.appendChild(fullLine);
    fullLog.scrollTop = fullLog.scrollHeight;
  }
}

// 3. TikTok Session Management & Browser Login
function initBrowserLogin() {
  const btnLogin = document.getElementById("btn-login-browser");
  if (!btnLogin) return;

  btnLogin.addEventListener("click", async () => {
    appendLog("INFO", "Membuka jendela browser Chrome untuk login TikTok...");
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Membuka Browser...';

    try {
      const res = await fetch("/api/session/open-login", { method: "GET" });
      const data = await res.json();
      appendLog("SUCCESS", "Jendela browser login TikTok telah dibuka! Silakan scan QR / login di jendela tersebut.");
    } catch (err) {
      appendLog("ERROR", "Gagal membuka browser: " + err.message);
      alert("Gagal membuka browser login: " + err.message);
    } finally {
      setTimeout(() => {
        btnLogin.disabled = false;
        btnLogin.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Login / Ganti Akun';
      }, 3500);
    }
  });

  const btnEditUser = document.getElementById("btn-edit-username");
  if (btnEditUser) {
    btnEditUser.addEventListener("click", async () => {
      const current = (document.getElementById("session-username").textContent || "").replace(/^@+/, "");
      const input = prompt(
        "Masukkan username TikTok akun Anda yang sedang terhubung:",
        current === "Akun Aktif" || current === "Akun TikTok Aktif" ? "" : current
      );
      if (input !== null && input.trim()) {
        try {
          const res = await fetch("/api/session/update-username", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: input.trim() })
          });
          const result = await res.json();
          if (result.success) {
            appendLog("INFO", `Username pengirim disetel menjadi: ${result.username}`);
            checkSessionStatus();
          }
        } catch (e) {
          alert("Gagal mengupdate username: " + e.message);
        }
      }
    });
  }
}

async function checkSessionStatus() {
  const dot = document.getElementById("session-dot");
  const label = document.getElementById("session-label");
  const usernameEl = document.getElementById("session-username");
  const hintEl = document.getElementById("session-hint");
  const btnEditUser = document.getElementById("btn-edit-username");
  const senderDisplay = document.getElementById("sender-account-display");
  const senderStatus = document.getElementById("sender-account-status");

  label.textContent = "Mengecek sesi...";
  try {
    const res = await fetch("/api/session/status");
    const data = await res.json();

    if (data.is_logged_in) {
      dot.className = "pulse-dot online";
      label.textContent = "TikTok Terhubung";

      let uname = data.username ? data.username.trim() : "";
      if (uname && !uname.startsWith("@") && uname !== "Akun TikTok Aktif" && uname !== "Akun Aktif") {
        uname = `@${uname}`;
      }
      const finalName = uname || "Akun Aktif";

      usernameEl.textContent = finalName;
      usernameEl.style.color = "var(--text-main)";

      if (hintEl) {
        hintEl.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> Pengirim DM aktif: <strong>${finalName}</strong>`;
      }
      if (btnEditUser) {
        btnEditUser.style.display = "inline-block";
      }

      if (senderDisplay) {
        senderDisplay.textContent = finalName;
        senderDisplay.style.color = "var(--brand-primary)";
      }
      if (senderStatus) {
        senderStatus.className = "badge badge-success";
        senderStatus.textContent = "Siap Digunakan";
      }
    } else {
      dot.className = "pulse-dot";
      label.textContent = "Belum Login TikTok";
      usernameEl.textContent = "Belum Terhubung";
      usernameEl.style.color = "var(--text-muted)";

      if (hintEl) {
        hintEl.textContent = "Klik tombol di bawah untuk login";
      }
      if (btnEditUser) {
        btnEditUser.style.display = "none";
      }

      if (senderDisplay) {
        senderDisplay.textContent = "Belum ada akun terhubung";
        senderDisplay.style.color = "var(--text-muted)";
      }
      if (senderStatus) {
        senderStatus.className = "badge badge-warning";
        senderStatus.textContent = "Perlu Login";
      }
    }
  } catch (err) {
    label.textContent = "Status Offline";
    usernameEl.textContent = "Tidak dapat terhubung";
    if (senderDisplay) {
      senderDisplay.textContent = "Server offline";
    }
  }
}

// 4. File Upload & Link Parsing
function initFileUploader() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("target-file-input");
  const fileInfo = document.getElementById("file-info");
  const fileName = document.getElementById("file-name");

  ["dragenter", "dragover"].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length) uploadFile(files[0]);
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) uploadFile(fileInput.files[0]);
  });

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    appendLog("INFO", `Memproses file ${file.name}...`);
    try {
      const res = await fetch("/api/campaign/parse-file", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      fileInfo.style.display = "inline-flex";
      fileName.textContent = `${data.filename} (${data.total_found} akun terdeteksi)`;
      setTargets(data.targets);
      appendLog("SUCCESS", `Berhasil memuat ${data.total_found} target akun unik dari ${file.name}.`);
    } catch (err) {
      alert("Gagal membaca file: " + err.message);
    }
  }

  // Paste Manual Text
  document.getElementById("btn-parse-text").addEventListener("click", async () => {
    const rawText = document.getElementById("manual-links-text").value.trim();
    if (!rawText) return alert("Silakan masukkan minimal 1 link TikTok.");

    try {
      const res = await fetch("/api/campaign/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: rawText })
      });
      const data = await res.json();
      setTargets(data.targets);
      appendLog("SUCCESS", `Berhasil memuat ${data.total_found} target akun dari input teks.`);
    } catch (err) {
      alert("Gagal memproses teks: " + err.message);
    }
  });

  document.getElementById("btn-clear-targets").addEventListener("click", () => {
    setTargets([]);
    fileInfo.style.display = "none";
    document.getElementById("manual-links-text").value = "";
    appendLog("INFO", "Daftar target dibersihkan.");
  });
}

function setTargets(targets) {
  loadedTargets = Array.isArray(targets) ? targets : [];
  const count = loadedTargets.length;
  
  document.getElementById("target-count-badge").textContent = `${count} Target`;
  document.getElementById("preview-count").textContent = count;
  
  const previewWrapper = document.getElementById("targets-preview-wrapper");
  const scrollList = document.getElementById("targets-scroll-list");

  if (count === 0) {
    previewWrapper.style.display = "none";
    scrollList.innerHTML = "";
    updateLimitSlider(0);
    return;
  }

  previewWrapper.style.display = "block";
  scrollList.innerHTML = targets.map((t, idx) => `
    <div class="target-item">
      <span><strong>#${idx + 1}</strong> @${escapeHtml(t.username)}</span>
      <a href="${escapeHtml(t.target_url)}" target="_blank" rel="noreferrer">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka Profil
      </a>
    </div>
  `).join("");

  updateLimitSlider(count);
}

// 5. Limit Controls & Slider
function initLimitControls() {
  const slider = document.getElementById("limit-slider");
  const display = document.getElementById("limit-display");

  slider.addEventListener("input", () => {
    display.textContent = slider.value;
    updateChipActiveState(slider.value);
  });

  // Quick chips (5, 10, 20, 50, all)
  document.querySelectorAll(".btn-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const val = chip.getAttribute("data-limit");
      if (val === "all") {
        slider.value = loadedTargets.length || 10;
      } else {
        const num = parseInt(val);
        slider.value = Math.min(num, loadedTargets.length || num);
      }
      display.textContent = slider.value;
      updateChipActiveState(slider.value);
    });
  });
}

function updateLimitSlider(total) {
  const slider = document.getElementById("limit-slider");
  const display = document.getElementById("limit-display");
  const totalDisplay = document.getElementById("limit-total-display");

  totalDisplay.textContent = `/ ${total} akun`;

  if (total > 0) {
    slider.max = total;
    slider.value = Math.min(10, total);
    display.textContent = slider.value;
  } else {
    slider.max = 100;
    slider.value = 10;
    display.textContent = "10";
  }
}

function updateChipActiveState(currentVal) {
  document.querySelectorAll(".btn-chip").forEach(chip => {
    const val = chip.getAttribute("data-limit");
    if (val === "all" && parseInt(currentVal) === loadedTargets.length && loadedTargets.length > 0) {
      chip.classList.add("active");
    } else if (parseInt(val) === parseInt(currentVal)) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
}

window.insertVariable = function(varName) {
  const textarea = document.getElementById("message-template");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + varName + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + varName.length;
};

// 6. Campaign Execution (Start, Pause, Resume, Stop)
function initCampaignActions() {
  const btnStart = document.getElementById("btn-start-campaign");
  const btnPause = document.getElementById("btn-pause-campaign");
  const btnResume = document.getElementById("btn-resume-campaign");
  const btnStop = document.getElementById("btn-stop-campaign");
  const btnClearConsole = document.getElementById("btn-clear-console");

  btnStart.addEventListener("click", async () => {
    if (loadedTargets.length === 0) {
      alert("Silakan masukkan file atau paste link target TikTok terlebih dahulu.");
      return;
    }

    const template = document.getElementById("message-template").value.trim();
    if (!template) {
      alert("Silakan tulis template pesan DM yang ingin dikirim.");
      return;
    }

    const campaignName = document.getElementById("campaign-name").value.trim() || "Batch Outreach";
    const limitCount = parseInt(document.getElementById("limit-slider").value);
    const delayMin = parseInt(document.getElementById("delay-min").value) || 20;
    const delayMax = parseInt(document.getElementById("delay-max").value) || 45;
    const isSim = document.getElementById("toggle-simulation").checked;
    const isHeadless = document.getElementById("toggle-headless")?.checked || false;
    const isCaptchaSolver = document.getElementById("toggle-captcha-solver")?.checked !== false;

    appendLog("INFO", `Membuat campaign '${campaignName}' dengan kuota: ${limitCount} akun...`);
    
    try {
      btnStart.disabled = true;
      const createRes = await fetch("/api/campaign/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          message_template: template,
          targets: loadedTargets,
          limit_count: limitCount,
          delay_min: delayMin,
          delay_max: delayMax
        })
      });
      const createData = await createRes.json();
      activeCampaignId = createData.campaign_id;

      // Start queue
      appendLog(
        "INFO",
        `Menjalankan antrean pengiriman... [Simulasi: ${isSim} | Headless: ${isHeadless} | Auto-Solve Captcha: ${isCaptchaSolver}]`
      );
      const startRes = await fetch(
        `/api/campaign/${activeCampaignId}/start?simulation=${isSim}&headless=${isHeadless}&auto_solve_captcha=${isCaptchaSolver}`,
        { method: "POST" }
      );
      const startData = await startRes.json();

      if (startData.success) {
        updateCampaignUIStatus("running");
        updateProgress(0, limitCount);
        appendLog("SUCCESS", "Robot outreach berhasil dijalankan!");
      } else {
        alert(startData.message);
        btnStart.disabled = false;
      }
    } catch (err) {
      alert("Gagal memulai campaign: " + err.message);
      btnStart.disabled = false;
    }
  });

  btnPause.addEventListener("click", async () => {
    if (!activeCampaignId) return;
    await fetch(`/api/campaign/${activeCampaignId}/pause`, { method: "POST" });
    updateCampaignUIStatus("paused");
  });

  btnResume.addEventListener("click", async () => {
    if (!activeCampaignId) return;
    await fetch(`/api/campaign/${activeCampaignId}/resume`, { method: "POST" });
    updateCampaignUIStatus("running");
  });

  btnStop.addEventListener("click", async () => {
    if (!activeCampaignId) return;
    if (confirm("Apakah Anda yakin ingin menghentikan campaign ini?")) {
      await fetch(`/api/campaign/${activeCampaignId}/stop`, { method: "POST" });
      updateCampaignUIStatus("stopped");
    }
  });

  btnClearConsole.addEventListener("click", () => {
    document.getElementById("console-logs").innerHTML = "";
  });
}

function updateCampaignUIStatus(status) {
  const pill = document.getElementById("campaign-status-pill");
  const indicator = pill.querySelector(".status-indicator");
  const text = document.getElementById("campaign-status-text");

  const btnStart = document.getElementById("btn-start-campaign");
  const btnPause = document.getElementById("btn-pause-campaign");
  const btnResume = document.getElementById("btn-resume-campaign");
  const btnStop = document.getElementById("btn-stop-campaign");

  indicator.className = `status-indicator ${status}`;

  if (status === "running") {
    text.textContent = "Status: Mengirim DM...";
    btnStart.style.display = "none";
    btnPause.style.display = "inline-flex";
    btnResume.style.display = "none";
    btnStop.style.display = "inline-flex";
  } else if (status === "paused") {
    text.textContent = "Status: Dijeda (Paused)";
    btnStart.style.display = "none";
    btnPause.style.display = "none";
    btnResume.style.display = "inline-flex";
    btnStop.style.display = "inline-flex";
  } else {
    // idle / completed / stopped
    text.textContent = status === "completed" ? "Status: Selesai ✓" : (status === "stopped" ? "Status: Dihentikan" : "Status: Siap (Idle)");
    btnStart.style.display = "inline-flex";
    btnStart.disabled = false;
    btnPause.style.display = "none";
    btnResume.style.display = "none";
    btnStop.style.display = "none";
  }
}

function updateProgress(processed, total) {
  const ratio = document.getElementById("progress-ratio");
  const percentEl = document.getElementById("progress-percent");
  const bar = document.getElementById("progress-bar-fill");

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  ratio.textContent = `${processed} / ${total} Target`;
  percentEl.textContent = `${pct}%`;
  bar.style.width = `${pct}%`;
}

// 7. Results & Proof Page
function initResultsPage() {
  const searchInput = document.getElementById("search-results-input");
  const filterSelect = document.getElementById("filter-status-select");
  const btnExport = document.getElementById("btn-export-csv");

  searchInput.addEventListener("input", filterAndRenderResults);
  filterSelect.addEventListener("change", filterAndRenderResults);

  btnExport.addEventListener("click", () => {
    window.location.href = "/api/export/csv";
  });

  const btnClear = document.getElementById("btn-clear-results");
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      const confirmed = confirm(
        "Apakah Anda yakin ingin menghapus SEMUA hasil DM dan riwayat pengiriman?\nTabel hasil akan dikosongkan."
      );
      if (!confirmed) return;

      try {
        const res = await fetch("/api/tasks/clear", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          appendLog("INFO", "Semua hasil DM berhasil dibersihkan dari database.");
          allTasks = [];
          filterAndRenderResults();
          loadStats();
        } else {
          alert("Gagal menghapus: " + (data.error || "Terjadi kesalahan"));
        }
      } catch (err) {
        alert("Gagal menghapus hasil DM: " + err.message);
      }
    });
  }

  // Modal Proof elements
  const modal = document.getElementById("proof-modal");
  const closeBtn = document.getElementById("btn-close-modal");
  const closeActionBtn = document.getElementById("btn-modal-close-action");
  const backdrop = document.getElementById("modal-backdrop");

  [closeBtn, closeActionBtn, backdrop].forEach(el => {
    el.addEventListener("click", () => {
      modal.classList.remove("active");
    });
  });
}

async function loadResultsTable() {
  try {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    allTasks = data.tasks || [];
    filterAndRenderResults();
    loadStats();
  } catch (err) {
    console.error("Error loading tasks:", err);
  }
}

function filterAndRenderResults() {
  const search = document.getElementById("search-results-input").value.toLowerCase().trim();
  const statusFilter = document.getElementById("filter-status-select").value;
  const tbody = document.getElementById("results-table-body");

  let filtered = allTasks;

  if (statusFilter !== "all") {
    filtered = filtered.filter(t => t.status === statusFilter);
  }

  if (search) {
    filtered = filtered.filter(t => 
      (t.username && t.username.toLowerCase().includes(search)) ||
      (t.target_url && t.target_url.toLowerCase().includes(search))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5" class="text-center py-5">
          <i class="fa-regular fa-folder-open empty-icon"></i>
          <p>Tidak ada data yang cocok dengan filter atau belum ada riwayat pengiriman.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const statusBadge = getStatusBadge(t.status);
    const proofButton = t.proof_path ? `
      <button class="btn-proof-preview" onclick="openProofModal('${escapeHtml(t.username)}', '${escapeHtml(t.proof_path)}', '${escapeHtml(t.sent_at || '')}')">
        <i class="fa-solid fa-camera"></i> Lihat Bukti
      </button>
    ` : `<span class="no-proof">Belum ada</span>`;

    return `
      <tr>
        <td>
          <div class="user-cell">
            <a href="${escapeHtml(t.target_url)}" target="_blank" class="user-username">@${escapeHtml(t.username)}</a>
            <span class="user-url">${escapeHtml(t.target_url)}</span>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div class="message-snippet" title="${escapeHtml(t.message_sent || '')}">
            ${escapeHtml(t.message_sent || '-')}
          </div>
        </td>
        <td><small class="text-muted">${escapeHtml(t.sent_at || '-')}</small></td>
        <td class="text-center">${proofButton}</td>
      </tr>
    `;
  }).join("");
}

function getStatusBadge(status) {
  if (status === "sent") {
    return `<span class="status-tag sent"><i class="fa-solid fa-check"></i> Terkirim</span>`;
  } else if (status === "dm_closed") {
    return `<span class="status-tag dm_closed"><i class="fa-solid fa-lock"></i> DM Tertutup</span>`;
  } else if (status === "failed") {
    return `<span class="status-tag failed"><i class="fa-solid fa-triangle-exclamation"></i> Gagal</span>`;
  } else {
    return `<span class="status-tag pending"><i class="fa-regular fa-clock"></i> Pending</span>`;
  }
}

window.openProofModal = function(username, proofPath, sentAt) {
  const modal = document.getElementById("proof-modal");
  const img = document.getElementById("modal-proof-img");
  const title = document.getElementById("modal-target-name");
  const time = document.getElementById("modal-sent-time");
  const downloadBtn = document.getElementById("btn-download-proof");

  const fullUrl = `/${proofPath}`;
  img.src = fullUrl;
  title.innerHTML = `<i class="fa-solid fa-image text-primary"></i> Bukti Screenshot DM: <strong>@${escapeHtml(username)}</strong>`;
  time.innerHTML = `<i class="fa-regular fa-clock"></i> Terkirim pada: ${escapeHtml(sentAt || '-')}`;
  downloadBtn.href = fullUrl;
  downloadBtn.download = `bukti_dm_${username}.png`;

  modal.classList.add("active");
};

// 8. Stats & Full Logs
async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    const s = data.stats;

    document.getElementById("stat-total").textContent = s.total;
    document.getElementById("stat-sent").textContent = s.sent;
    document.getElementById("stat-closed").textContent = s.dm_closed;
    document.getElementById("stat-failed").textContent = s.failed;

    document.getElementById("results-count-badge").textContent = s.total;
  } catch (err) {
    console.error("Error loading stats:", err);
  }
}

async function loadFullLogs() {
  const viewer = document.getElementById("full-log-viewer");
  try {
    const res = await fetch("/api/logs?limit=100");
    const data = await res.json();
    if (!data.logs || data.logs.length === 0) {
      viewer.innerHTML = `<div class="text-muted p-3">Belum ada riwayat log aktivitas.</div>`;
      return;
    }
    viewer.innerHTML = data.logs.map(l => `
      <div class="log-line ${l.level.toLowerCase()}">
        <span style="opacity:0.5">[${l.created_at}]</span> [${l.level}] ${escapeHtml(l.message)}
      </div>
    `).join("");
    viewer.scrollTop = viewer.scrollHeight;
  } catch (err) {
    console.error("Error loading logs:", err);
  }
}

async function loadLatestCampaign() {
  try {
    const res = await fetch("/api/campaign/latest");
    const data = await res.json();
    if (data.campaign) {
      activeCampaignId = data.campaign.id;
      document.getElementById("campaign-name").value = data.campaign.name || "Outreach Batch";
      if (data.campaign.message_template) {
        document.getElementById("message-template").value = data.campaign.message_template;
      }
      if (data.is_running) {
        updateCampaignUIStatus("running");
      } else if (data.is_paused) {
        updateCampaignUIStatus("paused");
      } else {
        updateCampaignUIStatus(data.campaign.status || "idle");
      }
    }
  } catch (err) {
    console.error("Error loading latest campaign:", err);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
