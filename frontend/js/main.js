function getSessionUser() {
  try { return JSON.parse(localStorage.getItem("sessionUser")); } catch { return null; }
}

function saveSessionUser(user) {
  localStorage.setItem("sessionUser", JSON.stringify(user));
}


function showError(err) {
  console.error(err);

  const message = err?.message || "Terjadi kesalahan.";
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("absensi dengan tipe yang sama sudah ada untuk hari ini")
  ) {
    showAttendancePopup(
      "warning",
      "Sudah Absen",
      "Kamu sudah melakukan absensi dengan tipe yang sama hari ini."
    );
    return;
  }

  if (
    lowerMessage.includes("radius") ||
    lowerMessage.includes("lokasi di luar") ||
    lowerMessage.includes("di luar area")
  ) {
    showAttendancePopup(
      "warning",
      "Lokasi di Luar Radius",
      "Kamu belum berada di area absensi yang ditentukan. Silakan lakukan absensi saat berada di lokasi PKL."
    );
    return;
  }

  showAttendancePopup(
    "error",
    "Absensi Gagal",
    message
  );
}


function showAttendancePopup(type, title, message) {
  const oldPopup = document.querySelector(".absen-popup");
  if (oldPopup) oldPopup.remove();

  const icon =
  type === "success"
    ? (title.includes("Keluar") ? "↪" : "✓")
    : type === "warning"
      ? "!"
      : "×";

  const popup = document.createElement("div");
  popup.className = `absen-popup ${type}`;

  popup.innerHTML = `
    <div class="absen-popup-content">
      <div class="absen-popup-icon">${icon}</div>

      <div class="absen-popup-text">
        <strong>${title}</strong>
        <span>${message}</span>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 4000);
}

function formatTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString("id-ID");
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("id-ID");
}

function normalizeStatus(status) {
  const map = { Hadir: "hadir", Terlambat: "terlambat", Izin: "izin", Sakit: "sakit", Alpha: "alpha", Ditolak: "ditolak" };
  return map[status] || String(status || "hadir").toLowerCase();
}

function displayStatus(status) {
  const map = { hadir: "Hadir", terlambat: "Terlambat", izin: "Izin", sakit: "Sakit", alpha: "Alpha", ditolak: "Ditolak" };
  return map[status] || status || "-";
}

async function getCurrentLocation() {
  if (!navigator.geolocation) throw new Error("Browser tidak mendukung geolocation.");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => reject(new Error(`Lokasi GPS tidak dapat diperoleh: ${e.message}`)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

async function getDefaultLocation() {
  // Panggil tanpa parameter boolean agar tidak menambah ?active_only=true
  const locations = await Api.locations();

  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    throw new Error("Belum ada lokasi absensi aktif di database.");
  }

  // Cari yang aktif (memeriksa nama properti is_aktif maupun is_active), 
  // JIKA TIDAK ADA yang cocok, otomatis ambil lokasi pertama (locations[0])
  const activeLoc = locations.find(loc => loc.is_aktif == 1 || loc.is_aktif === true || loc.is_active == 1 || loc.is_active === true) || locations[0];
  
  if (!activeLoc) {
    throw new Error("Data lokasi kosong atau format tidak sesuai.");
  }

  return activeLoc;
}

async function submitAttendance(type) {
  const user = getSessionUser();
  if (!user?.student_id) throw new Error("Akun siswa belum terhubung ke student_id.");

  const statusEl = document.getElementById("statusAbsen");
  const noteEl = document.getElementById("keteranganAbsen");
  
  // Ganti kondisi check dari "pulang" menjadi "keluar"
  const status = type === "keluar" ? "hadir" : normalizeStatus(statusEl?.value || "Hadir");
  const note = noteEl?.value?.trim() || null;

  const [gps, location] = await Promise.all([getCurrentLocation(), getDefaultLocation()]);

  const payload = {
    student_id: Number(user.student_id),
    supervisor_id: user.supervisor_id ? Number(user.supervisor_id) : null,
    location_id: Number(location.id),
    attendance_type: type, // Akan bernilai 'masuk' atau 'keluar'
    status,
    latitude: gps.latitude,
    longitude: gps.longitude,
    location_accuracy_meters: gps.accuracy,
    note
  };

  const result = await Api.createAttendance(payload);
  showAttendancePopup(
  "success",
  type === "masuk" ? "Absen Masuk Berhasil" : "Absen Keluar Berhasil",
  `Absensi berhasil dicatat. Jarak: ${
    result.distance_from_target_meters == null
      ? "-"
      : result.distance_from_target_meters.toFixed(1) + " m"
  }`
);
  if (document.getElementById("tabelAbsensiSiswa")) await renderSiswa();
}

window.absenMasuk = async function() {
  try {
    await submitAttendance("masuk");
  } catch (e) {
    if (e?.message?.includes("Absensi dengan tipe yang sama sudah ada untuk hari ini")) {
      showAttendancePopup(
        "warning",
        "Sudah Absen",
        "Kamu sudah melakukan absen masuk hari ini."
      );
      return;
    }

    showError(e);
  }
};

window.absenKeluar = async function() {
  try {
    await submitAttendance("keluar");
  } catch (e) {
    if (e?.message?.includes("Absensi dengan tipe yang sama sudah ada untuk hari ini")) {
      showAttendancePopup(
        "warning",
        "Sudah Absen",
        "Kamu sudah melakukan absen keluar hari ini."
      );
      return;
    }

    showError(e);
  }
};

window.logout = function() {
  localStorage.removeItem("sessionUser");
  localStorage.removeItem("access_token");
  sessionStorage.clear();
  location.href = "index.html";
};

// Login page
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const username = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const btn = loginForm.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    try {
      const data = await Api.login(username, password);
      localStorage.setItem("access_token", data.access_token);
      saveSessionUser(data.user);
     
if (data.user.role === "siswa") {
  location.href = "dashboard_siswa.html";
} else if (data.user.role === "pembimbing") {
  location.href = "dashboard_pembimbing.html";
} else if (data.user.role === "admin") {
  location.href = "dashboard_admin.html";
} else {
  localStorage.removeItem("access_token");
  localStorage.removeItem("sessionUser");

  const loginError = document.getElementById("loginError");
  if (loginError) {
    loginError.textContent = "Role akun tidak diizinkan";
    loginError.style.display = "block";
  }
}

    } catch (e) {
  const loginError = document.getElementById("loginError");

  if (loginError) {
    loginError.textContent = "Username atau password salah";
    loginError.style.display = "block";
  }
}
finally {
  if (btn) btn.disabled = false;
}
  });
}

async function renderSiswa() {
  const user = getSessionUser();
  if (!user) return;
  const name = document.getElementById("userNama");
  if (name) name.textContent = user.full_name || "Siswa";
  const student = await Api.student(user.student_id);
  console.log("DATA SISWA:", student);

  const tanggalHariIni = new Date(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date())
);

const tanggalSelesaiPKL = student.endPkl
  ? new Date(student.endPkl + "T00:00:00")
  : null;

const pklSudahSelesai =
  tanggalSelesaiPKL !== null &&
  tanggalHariIni > tanggalSelesaiPKL;

if (pklSudahSelesai) {
  // Nonaktifkan tombol absensi
  document.querySelectorAll(".absen-actions button").forEach(button => {
    button.disabled = true;
  });

  // Nonaktifkan form absensi
  document.querySelectorAll("#formAbsensi input, #formAbsensi select").forEach(input => {
    input.disabled = true;
  });

  // Nonaktifkan form laporan
  document.querySelectorAll("#formLaporan input, #formLaporan textarea, #formLaporan button").forEach(input => {
    input.disabled = true;
  });

  // Tampilkan pemberitahuan
  const pemberitahuan = document.createElement("div");
  pemberitahuan.className = "periode-warning";
  pemberitahuan.textContent =
    "Periode PKL kamu sudah berakhir. Fitur absensi dan pengiriman laporan dinonaktifkan.";

  const menuAbsensi = document.getElementById("formAbsensi");
  if (menuAbsensi) {
    menuAbsensi.parentElement.prepend(pemberitahuan);
  }
}

  const startPkl = document.getElementById("startPkl");
  const endPkl = document.getElementById("endPkl");

  if (startPkl) startPkl.textContent = formatDate(student.startPkl);
  if (endPkl) endPkl.textContent = formatDate(student.endPkl);
  const statusPeriode = document.getElementById("statusPeriode");

if (statusPeriode && student.startPkl && student.endPkl) {
  const hariIni = new Date();
  const mulai = new Date(student.startPkl);
  const selesai = new Date(student.endPkl);

  hariIni.setHours(0, 0, 0, 0);
  mulai.setHours(0, 0, 0, 0);
  selesai.setHours(0, 0, 0, 0);

  if (hariIni < mulai) {
    statusPeriode.textContent = "● Belum Mulai";
    statusPeriode.className = "periode-status belum-mulai";
  } else if (hariIni > selesai) {
    statusPeriode.textContent = "● Selesai";
    statusPeriode.className = "periode-status selesai";
  } else {
    statusPeriode.textContent = "● Berjalan";
    statusPeriode.className = "periode-status berjalan";
  }
}


  
  // Notifikasi pengingat menjelang PKL berakhir
  const notifikasiPkl = document.getElementById("notifikasiPeriodePkl");
  const judulNotifikasiPkl = document.getElementById("judulNotifikasiPkl");
  const pesanNotifikasiPkl = document.getElementById("pesanNotifikasiPkl");

  if (notifikasiPkl && judulNotifikasiPkl && pesanNotifikasiPkl) {
    notifikasiPkl.style.display = "none";

    if (student.endPkl) {
      const bagianTanggal = String(student.endPkl).slice(0, 10).split("-");
      const selesai = new Date(
        Number(bagianTanggal[0]),
        Number(bagianTanggal[1]) - 1,
        Number(bagianTanggal[2])
      );

      const sekarang = new Date();
      sekarang.setHours(0, 0, 0, 0);

      const selisihHari = Math.round(
        (selesai.getTime() - sekarang.getTime()) / 86400000
      );

      if (selisihHari === 2) {
        judulNotifikasiPkl.textContent = "Pengingat: H-2 PKL Berakhir";
        pesanNotifikasiPkl.textContent =
          "PKL kamu akan berakhir 2 hari lagi. Selesaikan tugas dan laporan yang masih tertunda.";
        notifikasiPkl.style.display = "flex";
      } else if (selisihHari === 1) {
        judulNotifikasiPkl.textContent = "Pengingat: Besok PKL Berakhir";
        pesanNotifikasiPkl.textContent =
          "PKL kamu berakhir besok. Pastikan tugas, laporan, dan persyaratan PKL sudah diselesaikan.";
        notifikasiPkl.style.display = "flex";
      } else if (selisihHari === 0) {
        judulNotifikasiPkl.textContent = "Hari Terakhir PKL";
        pesanNotifikasiPkl.textContent =
          "Hari ini adalah hari terakhir PKL kamu. Pastikan semua kegiatan dan laporan sudah diselesaikan.";
        notifikasiPkl.style.display = "flex";
      }
    }
  }



  const [attPage, reports, tasks] = await Promise.all([
    Api.attendances({ page: 1, page_size: 100 }),
    Api.reports(),
    Api.tasks()
  ]);
  console.log("DATA LAPORAN SISWA:", reports);

  const tbodyAbsen = document.getElementById("tabelAbsensiSiswa");
  if (tbodyAbsen) {
    const byDate = {};

    // Filter absensi agar hanya menampilkan data milik siswa yang sedang login
    const studentAttendances = (attPage.items || []).filter(
      item => Number(item.student_id) === Number(user.student_id)
    );

    studentAttendances.forEach(item => {
      console.log("ATTENDANCE TIME:", item.attendance_time);
      const key = item.attendance_date;
      byDate[key] ||= { masuk: null, keluar: null, status: item.status, note: item.note };
      byDate[key][item.attendance_type] = item;
      if (item.attendance_type === "masuk") { 
        byDate[key].status = item.status; 
        byDate[key].note = item.note; 
      }
    });
    

    tbodyAbsen.innerHTML = Object.entries(byDate).map(([date, row]) => `
      <tr>
        <td>${formatDate(date)}<br>${row.masuk ? formatTime(row.masuk.attendance_time) : "-"}</td>
        <td>${row.keluar ? formatTime(row.keluar.attendance_time) : "-"}</td>
        <td><strong>${displayStatus(row.status)}</strong></td>
        <td>${row.note || "-"}</td>
      </tr>`).join("") || `<tr><td colspan="4">Belum ada data absensi.</td></tr>`;
  }

 
  const tbodyLaporan = document.getElementById("tabelLaporanSiswa");

  if (tbodyLaporan) {
    const studentId = Number(user.student_id || user.id_siswa || user.id);

    const studentReports = (reports || []).filter(
      item => Number(item.id_siswa || item.student_id) === studentId
    );

    tbodyLaporan.innerHTML = studentReports.map(item => {
      const fotoHtml = item.foto_laporan
  ? `
    <a
      href="http://127.0.0.1:8000/uploads/laporan/${encodeURIComponent(item.foto_laporan)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      Lihat Foto
    </a>
  `
  : "-";

      const status = item.status_review || item.review_status || "pending";
      const statusText =
        status === "pending" || status === "menunggu_review"
          ? "Menunggu Review"
          : status === "disetujui"
            ? "Disetujui"
            : "Ditolak";

      return `
        <tr>
          <td>${formatDate(item.tanggal_laporan || item.report_date || item.created_at)}</td>
          <td>${item.isi_laporan || item.judul_kegiatan || item.title || "-"}</td>
          <td>${fotoHtml}</td>
          <td><span class="status-review">${statusText}</span></td>
          <td>${item.komentar_pembimbing || item.review_comment || "-"}</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="5">Belum ada laporan.</td></tr>`;
  }


  const tbodyTugas = document.getElementById("tabelTugasSiswa");
  if (tbodyTugas) {
    // Ambil supervisor_id dari user yang sedang login (Abdul)
    const supervisorId = Number(user.supervisor_id || user.id_pembimbing);
    const studentId = Number(user.student_id || user.id_siswa || user.id);

    // Filter hanya tugas dari pembimbing Abdul ATAU tugas yang khusus ditujukan ke ID siswa Abdul
    const studentTasks = (tasks || []).filter(item => {
  const taskStudent = Number(item.id_siswa || item.student_id);

  return taskStudent === studentId;
});

    tbodyTugas.innerHTML = studentTasks.map(item => {
  const progress = item.status_progress || "pending";
 
let peringatanDeadline = "";

if (progress !== "selesai" && item.deadline) {
  const sekarang = new Date();
  sekarang.setHours(0, 0, 0, 0);

  const deadline = new Date(item.deadline);
  deadline.setHours(0, 0, 0, 0);

  const selisihHari = Math.round(
    (deadline - sekarang) / (1000 * 60 * 60 * 24)
  );

  if (selisihHari < 0) {
    peringatanDeadline = `
      <span class="deadline-badge deadline-lewat">
        Terlambat
      </span>
    `;
  } else if (selisihHari === 0) {
    peringatanDeadline = `
      <span class="deadline-badge deadline-lewat">
        Deadline hari ini
      </span>
    `;
  } else if (selisihHari <= 2) {
    peringatanDeadline = `
      <span class="deadline-badge deadline-dekat">
        ${selisihHari} hari lagi
      </span>
    `;
  } else {
    peringatanDeadline = `
      <span class="deadline-badge deadline-aman">
        ${selisihHari} hari lagi
      </span>
    `;
  }
}

  return `
    <tr>
      <td>${item.judul_tugas || item.title || "-"}</td>
      <td>${item.deskripsi_tugas || item.description || "-"}</td>
      <td>${item.deadline ? new Date(item.deadline).toLocaleString("id-ID") : "-"} ${peringatanDeadline}</td>
      <td>${item.startTugas ? new Date(item.startTugas).toLocaleDateString("id-ID") : "-"}</td>
      <td>
        
<select
    class="status-progress status-${progress}"
    onchange="ubahProgressTugas(${item.id}, this.value)"
    ${pklSudahSelesai || progress === "selesai" ? "disabled" : ""}
>
    <option value="pending"
        ${progress === "pending" ? "selected" : ""}
        ${progress !== "pending" ? "disabled" : ""}>
        ◯ Belum Mulai
    </option>

    <option value="proses"
        ${progress === "proses" ? "selected" : ""}
        ${progress === "selesai" ? "disabled" : ""}>
        ◷ Sedang Dikerjakan
    </option>

    <option value="selesai"
        ${progress === "selesai" ? "selected" : ""}
        ${progress === "pending" ? "disabled" : ""}>
        ✓ Selesai
    </option>
</select>

      </td>
    </tr>
  `;
}).join("") || `<tr><td colspan="5">Belum ada tugas dari pembimbing.</td></tr>`;
  }
}

function tampilkanNotifikasi(pesan) {
    const lama = document.querySelector(".toast-notifikasi");

    if (lama) {
        lama.remove();
    }

    const toast = document.createElement("div");
    toast.className = "toast-notifikasi";

    const ikon = document.createElement("span");
    ikon.className = "toast-icon";
    ikon.textContent = "✓";

    const teks = document.createElement("span");
    teks.className = "toast-teks";
    teks.textContent = pesan;

    toast.appendChild(ikon);
    toast.appendChild(teks);

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}



window.ubahProgressTugas = async function(id, status) {
  try {
    await Api.patch("tasks", id, {
      status_progress: status
    });

    tampilkanNotifikasi("Status progress tugas berhasil diperbarui.");

    await renderSiswa();
  } catch (e) {
    showError(e);
  }
};

const formLaporan = document.getElementById("formLaporan");

if (formLaporan) {
  formLaporan.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const user = getSessionUser();
      const studentId = Number(
        user?.student_id || user?.id_siswa || user?.id
      );

      if (!studentId) {
        alert("ID siswa tidak ditemukan. Silakan login ulang.");
        return;
      }

      const isiLaporan = document
        .getElementById("isiLaporan")
        .value.trim();

      const inputFoto = document.getElementById("fotoLaporan");
      const foto = inputFoto?.files?.[0];

      const formData = new FormData();
      formData.append("id_siswa", String(studentId));
      formData.append("isi_laporan", isiLaporan);
      formData.append("id_tugas", "1");

      if (foto) {
        formData.append("foto_laporan", foto);
      }

      const hasilLaporan = await Api.createReportWithPhoto(formData);

      console.log("HASIL KIRIM LAPORAN:", hasilLaporan);

     showAttendancePopup(
     "success",
     "Laporan Berhasil",
     "Laporan harian berhasil dikirim."
     );

      formLaporan.reset();

      const previewContainer = document.getElementById(
        "previewFotoContainer"
      );
      const previewImage = document.getElementById(
        "previewFotoLaporan"
      );

      if (previewContainer) {
        previewContainer.style.display = "none";
      }

      if (previewImage) {
        previewImage.removeAttribute("src");
      }

      await renderSiswa();
    } catch (e) {
      showError(e);
    }
  });
}


function showKonfirmasiNonaktif(namaSiswa) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "konfirmasi-nonaktif-overlay";

    overlay.innerHTML = `
      <div class="konfirmasi-nonaktif-modal">
        <div class="konfirmasi-nonaktif-heading">
          <div class="konfirmasi-nonaktif-icon">!</div>
          <div>
            <h3>Nonaktifkan Siswa</h3>
            <p>Konfirmasi tindakan akun siswa.</p>
          </div>
        </div>

        <p class="konfirmasi-nonaktif-nama">
          Yakin ingin menonaktifkan
          <strong>${namaSiswa}</strong>?
        </p>

        <div class="konfirmasi-nonaktif-info">
          Akun siswa akan dinonaktifkan. Riwayat absensi
          dan tugas tetap disimpan.
        </div>

        <div class="konfirmasi-nonaktif-actions">
          <button type="button" class="btn-batal-nonaktif">
            Batal
          </button>
          <button type="button" class="btn-setuju-nonaktif">
            Ya, Nonaktifkan
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    let selesai = false;

    function tutup(nilai) {
      if (selesai) return;
      selesai = true;
      overlay.remove();
      resolve(nilai);
    }

    overlay.querySelector(".btn-batal-nonaktif")
      .addEventListener("click", () => tutup(false));

    overlay.querySelector(".btn-setuju-nonaktif")
      .addEventListener("click", () => tutup(true));

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) tutup(false);
    });

    document.addEventListener("keydown", function escape(e) {
      if (e.key === "Escape" && !selesai) {
        document.removeEventListener("keydown", escape);
        tutup(false);
      }
    });
  });
}


async function renderPembimbing() {
  const user = getSessionUser();
  if (!user) return;
  const name = document.getElementById("userNama");
  if (name) name.textContent = user.full_name || "Pembimbing";
    // Data periode PKL siswa
  const selectSiswaPkl = document.getElementById("siswaPkl");
  const startPkl = document.getElementById("startPkl");
  const endPkl = document.getElementById("endPkl");

  
if (selectSiswaPkl) {
    // Ambil semua siswa, termasuk siswa nonaktif.
    const students = await Api.students(false);

    // Isi dropdown siswa.
    selectSiswaPkl.innerHTML = `
        <option value="">-- Pilih Siswa --</option>
        ${(students || []).map(student => `
            <option value="${student.id}">
                ${student.nama || "-"}${student.is_active === false ? " (Nonaktif)" : ""}
            </option>
        `).join("")}
    `;

    const tabelPeriodePkl = document.getElementById("tabelPeriodePkl");

    // Tampilkan tabel periode PKL.
    if (tabelPeriodePkl) {
        tabelPeriodePkl.innerHTML = "";

        (students || []).forEach(student => {
            const nonaktif = student.is_active === false;
            const mulai = student.startPkl
                ? formatDate(student.startPkl)
                : "-";
            const selesai = student.endPkl
                ? formatDate(student.endPkl)
                : "-";

            let status = nonaktif ? "Nonaktif" : "-";

            if (!nonaktif && student.startPkl && student.endPkl) {
                const hariIni = new Date();
                const tanggalMulai = new Date(student.startPkl);
                const tanggalSelesai = new Date(student.endPkl);

                hariIni.setHours(0, 0, 0, 0);
                tanggalMulai.setHours(0, 0, 0, 0);
                tanggalSelesai.setHours(0, 0, 0, 0);

                if (hariIni < tanggalMulai) {
                    status = "Belum Mulai";
                } else if (hariIni > tanggalSelesai) {
                    status = "Selesai";
                } else {
                    status = "Berjalan";
                }
            }

            const baris = document.createElement("tr");

            baris.innerHTML = `
                <td>${student.nama || "-"}</td>
                <td>${mulai}</td>
                <td>${selesai}</td>
                <td>${status}</td>
                <td>
                    <div class="aksi-periode">
                        <button
                            type="button"
                            class="btn btn-primary btn-edit-periode"
                            data-id="${student.id}">
                            ${nonaktif ? "Aktifkan / Update" : "Update"}
                        </button>

                        ${nonaktif ? "" : `
                            <button
                                type="button"
                                class="btn btn-danger btn-hapus-periode"
                                data-id="${student.id}">
                                Delete
                            </button>
                        `}
                    </div>
                </td>
            `;

            tabelPeriodePkl.appendChild(baris);
        });
    }

    // Tombol Update atau Aktifkan.
    document.querySelectorAll(".btn-edit-periode").forEach(button => {
        button.onclick = async function () {
            const studentId = this.dataset.id;

            selectSiswaPkl.value = studentId;

            try {
                const student = await Api.student(studentId);

                if (startPkl) {
                    startPkl.value = student.startPkl || "";
                }

                if (endPkl) {
                    endPkl.value = student.endPkl || "";
                }

                document.getElementById("startPkl")?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                if (student.is_active === false) {
                    showAttendancePopup(
                        "warning",
                        "Siswa Nonaktif",
                        "Atur tanggal PKL, lalu tekan Simpan Periode PKL untuk mengaktifkan kembali siswa."
                    );
                }
            } catch (error) {
                showError(error);
            }
        };
    });

    
    // Tombol Delete: menonaktifkan siswa.
    document.querySelectorAll(".btn-hapus-periode").forEach(button => {
        button.onclick = async function () {
            const studentId = this.dataset.id;

            const namaSiswa =
                this.closest("tr")?.querySelector("td")?.textContent.trim()
                || "siswa ini";

            const yakin = await showKonfirmasiNonaktif(namaSiswa);

            if (!yakin) {
                return;
            }

            try {
                await Api.deleteStudent(studentId);

                showAttendancePopup(
                    "success",
                    "Berhasil",
                    `${namaSiswa} berhasil dinonaktifkan.`
                );

                await renderPembimbing();
            } catch (error) {
                showError(error);
            }
        };
    });

    // Saat pilihan siswa berubah, isi tanggal PKL.
    selectSiswaPkl.onchange = async function () {
        const studentId = this.value;

        if (!studentId) {
            if (startPkl) startPkl.value = "";
            if (endPkl) endPkl.value = "";
            return;
        }

        try {
            const student = await Api.student(studentId);

            if (startPkl) {
                startPkl.value = student.startPkl || "";
            }

            if (endPkl) {
                endPkl.value = student.endPkl || "";
            }
        } catch (error) {
            showError(error);
        }
    };
}

  
  
    // Dropdown siswa untuk pemberian tugas.
    const selectSiswaTugas = document.getElementById("siswaTugas");
    
    // Dropdown siswa untuk penilaian sertifikat PKL.
    const selectSiswaPenilaian = document.getElementById("siswaPenilaian");

    if (selectSiswaPenilaian) {
      const siswaPenilaian = await Api.students(true);

      selectSiswaPenilaian.innerHTML = `
        <option value="">-- Pilih Siswa --</option>
        ${(siswaPenilaian || []).map(student => `
          <option value="${student.id}">
            ${student.nama || student.name || "-"}
          </option>
        `).join("")}
      `;
    }


    if (selectSiswaTugas) {
      const students = await Api.students(true);

      selectSiswaTugas.innerHTML = `
        <option value="">-- Pilih Siswa --</option>
        ${(students || []).map(student => `
          <option value="${student.id}">
            ${student.nama || "-"}
          </option>
        `).join("")}
      `;
    }




    const btnSimpanPkl = document.getElementById("btnSimpanPkl");

  if (btnSimpanPkl) {
    btnSimpanPkl.addEventListener("click", async function () {
      const studentId = selectSiswaPkl?.value;
      const start = startPkl?.value;
      const end = endPkl?.value;

      
if (!studentId) {
  showAttendancePopup(
    "warning",
    "Siswa Belum Dipilih",
    "Silakan pilih siswa terlebih dahulu untuk menyimpan Periode PKL."
  );
  return;
}


      if (!start || !end) {
        alert("Tanggal mulai dan selesai PKL harus diisi.");
        return;
      }

      if (start > end) {
        alert("Tanggal selesai PKL tidak boleh sebelum tanggal mulai.");
        return;
      }

      try {
        await Api.updateStudentPkl(studentId, {
          startPkl: start,
          endPkl: end
        });

        showAttendancePopup(
        "success",
        "Berhasil!",
        "Periode PKL berhasil disimpan."
       );

        await renderPembimbing();
      } catch (error) {
        showError(error);
      }
    });
  }

 const [attPage, reports, tasks, daftarSiswaTugas] = await Promise.all([
  Api.attendances({ page: 1, page_size: 100 }),
  Api.reports(),
  Api.tasks(),
  Api.students(false)
]);

  const tbodyAbsen = document.getElementById("tabelAbsensiPembimbing");
  if (tbodyAbsen) {
    const byStudentDate = {};
    attPage.items.forEach(item => {
      const namaSiswa = item.student?.nama?.trim() || "Tanpa Nama";
      const key = `${item.student_id}-${item.attendance_date}`;

    // 3. Inisialisasi data grup jika belum ada
    byStudentDate[key] ||= {
      nama: namaSiswa,
      date: item.attendance_date,
      masuk: null,
      keluar: null,
      status: item.status,
      note: item.note
    };

    // 4. Masukkan item absensi sesuai jenisnya (masuk / pulang)
    byStudentDate[key][item.attendance_type] = item;

    // Prioritaskan status & catatan dari absensi masuk
    if (item.attendance_type === "masuk") {
      byStudentDate[key].status = item.status;
      byStudentDate[key].note = item.note;
    }
  });

  // 5. Render ke tabel HTML
  tbodyAbsen.innerHTML = Object.values(byStudentDate).map(row => `
    <tr>
      <td><strong>${row.nama}</strong></td>
      <td>${row.masuk ? formatTime(row.masuk.attendance_time) : "-"}</td>
      <td>${row.keluar ? formatTime(row.keluar.attendance_time) : "-"}</td>
      <td>${displayStatus(row.status)}</td>
      <td>${row.note || "-"}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">Belum ada absensi siswa.</td></tr>`;
  }

  
const tbodyLaporan = document.getElementById("tabelReviewPembimbing");

if (tbodyLaporan) {
  tbodyLaporan.innerHTML = reports.map(item => {
    const reportId = item.id_laporan || item.id || item.report_id;
    const status = item.status_review || item.review_status || "pending";
    const isPending =
      status === "pending" || status === "menunggu_review";

    const statusText = isPending
      ? "Menunggu Review"
      : status === "disetujui"
        ? "Disetujui"
        : status === "ditolak"
          ? "Ditolak"
          : status;

    const namaSiswa =
      item.siswa?.nama ||
      item.student?.nama ||
      item.siswa?.name ||
      `Siswa ID: ${item.id_siswa || item.student_id || "-"}`;

    const fotoHtml = item.foto_laporan
  ? `
    <a
      href="http://127.0.0.1:8000/uploads/laporan/${encodeURIComponent(item.foto_laporan)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      Lihat Foto
    </a>
  `
  : "-";

    return `
      <tr>
        <td>${formatDate(item.tanggal_laporan || item.report_date || item.created_at)}</td>
        <td><strong>${namaSiswa}</strong></td>
        <td>${item.isi_laporan || item.content || "-"}</td>
        <td>${fotoHtml}</td>
        <td>
          <strong>${statusText}</strong><br>
          <small class="text-muted">${item.komentar_pembimbing || ""}</small>
        </td>
        <td>
          ${isPending
            ? `<button class="btn btn-sm btn-success" onclick="reviewLaporan(${reportId}, 'disetujui')">Setujui</button>`
            : "-"}
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="6">Belum ada laporan.</td></tr>`;
}

    
const tbodyTugasPembimbing = document.getElementById("tabelTugasPembimbing");

if (tbodyTugasPembimbing) {
  const supervisorId = Number(
    user.supervisor_id ||
    user.id_pembimbing ||
    user.id
  );

  const tugasPembimbing = (tasks || []).filter(item => {
    const taskSupervisor = Number(
      item.id_pembimbing ||
      item.supervisor_id
    );

    return taskSupervisor === supervisorId;
  });

  tbodyTugasPembimbing.innerHTML = tugasPembimbing.map(item => {
    const progress = item.status_progress || "pending";

    let statusText = "Belum Mulai";

    if (progress === "proses") {
      statusText = "Sedang Dikerjakan";
    } else if (progress === "selesai") {
      statusText = "Selesai";
    }

    const studentId = Number(item.id_siswa || item.student_id);

const dataSiswa = (daftarSiswaTugas || []).find(
  siswa => Number(siswa.id) === studentId
);

const namaSiswa =
  item.siswa?.nama ||
  item.student?.nama ||
  item.siswa?.name ||
  item.student?.name ||
  dataSiswa?.nama ||
  dataSiswa?.name ||
  "-";

    return `
      <tr>
        <td><strong>${namaSiswa}</strong></td>
        <td>${item.judul_tugas || item.title || "-"}</td>
        <td>${item.deskripsi_tugas || item.description || "-"}</td>
        <td>${item.deadline ? new Date(item.deadline).toLocaleString("id-ID") : "-"}</td>
        <td>${item.startTugas ? new Date(item.startTugas).toLocaleString("id-ID") : "-"}</td>
                <td>
          <strong>${statusText}</strong>
          ${
            progress === "selesai"
              ? `
                <br>
                <button
                  type="button"
                  class="btn btn-warning btn-sm"
                  onclick="mintaRevisiTugas(${item.id})"
                >
                  Minta Revisi
                </button>
              `
              : ""
          }
        </td>
      </tr>
    `;
  }).join("") || `
    <tr>
      <td colspan="6">Belum ada tugas.</td>
    </tr>
  `;
}

}


function showKomentarModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "komentar-modal-overlay";

    overlay.innerHTML = `
      <div class="komentar-modal">
        <div class="komentar-modal-heading">
          <div class="komentar-modal-icon">✉</div>
          <div>
            <h3>Review Laporan</h3>
            <p>Berikan komentar untuk siswa.</p>
          </div>
        </div>

        <label for="komentarPembimbingInput">
          Komentar Pembimbing
        </label>
        <textarea id="komentarPembimbingInput"
          placeholder="Tuliskan komentar di sini..."
          rows="4"></textarea>

        <div class="komentar-modal-actions">
          <button type="button" class="komentar-cancel">Batal</button>
          <button type="button" class="komentar-submit">
            Simpan Komentar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#komentarPembimbingInput");
    let selesai = false;

    function tutup(nilai) {
      if (selesai) return;
      selesai = true;
      overlay.remove();
      resolve(nilai);
    }

    overlay.querySelector(".komentar-cancel")
      .addEventListener("click", () => tutup(null));

    overlay.querySelector(".komentar-submit")
      .addEventListener("click", () => tutup(input.value.trim()));

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) tutup(null);
    });

    input.focus();
  });
}

window.mintaRevisiTugas = async function(taskId) {
  const yakin = confirm(
    "Apakah kamu yakin ingin meminta revisi tugas ini?"
  );

  if (!yakin) return;

  try {
    const token = localStorage.getItem("access_token");

    const response = await fetch(
      `http://127.0.0.1:8000/api/tasks/${taskId}/revisi`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      throw new Error(
        errorData.detail || "Gagal meminta revisi tugas."
      );
    }

    showAttendancePopup(
      "success",
      "Revisi Diminta",
      "Progres tugas siswa telah dikembalikan menjadi Sedang Dikerjakan."
    );

    await renderPembimbing();
  } catch (error) {
    console.error("Gagal meminta revisi:", error);
    showError(error);
  }
};


window.reviewLaporan = async function(id, status) {
  if (!id || id === "undefined") {
    alert("Error: ID Laporan tidak ditemukan!");
    return;
  }

  const komentar = await showKomentarModal();
  if (komentar === null) return;
  try {
    const token = localStorage.getItem("access_token");

    const response = await fetch(`http://127.0.0.1:8000/api/reports/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        status_review: status,
        komentar_pembimbing: komentar || "Disetujui oleh pembimbing"
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Gagal menyimpan komentar.");
    }

    showAttendancePopup(
     "success",
     "Review Berhasil!",
     "Komentar dan status review berhasil disimpan."
     );
    await renderPembimbing(); // Refresh tabel
  } catch (e) {
    showError(e);
  }
};

const formBeriTugas = document.getElementById("formBeriTugas");

if (formBeriTugas) {
  formBeriTugas.addEventListener("submit", async e => {
    e.preventDefault();

    try {
      const siswaId = document.getElementById("siswaTugas").value;

      
if (!siswaId) {
  showAttendancePopup(
    "warning",
    "Siswa Belum Dipilih",
    "Silakan pilih siswa terlebih dahulu untuk memberikan tugas."
  );
  return;
}

      console.log("SISWA YANG DIPILIH:", siswaId);

      await Api.createTask({
        id_siswa: Number(siswaId),
        judul_tugas: document.getElementById("judulTugasBaru").value.trim(),
        deskripsi_tugas: document.getElementById("deskripsiTugas").value.trim(),
        deadline: document.getElementById("deadlineTugas").value
      });

      
       showAttendancePopup(
        "success",
        "Tugas Berhasil!",
        "Tugas berhasil diberikan kepada siswa."
       );


      
      formBeriTugas.reset();

      await renderPembimbing();

    } catch (e) {
      showError(e);
    }
  });
}


const formPenilaianSertifikat = document.getElementById(
  "formPenilaianSertifikat"
);

if (formPenilaianSertifikat) {
  formPenilaianSertifikat.addEventListener("submit", async function (e) {
    e.preventDefault();

    const siswaId = document.getElementById("siswaPenilaian").value;

    if (!siswaId) {
      alert("Silakan pilih siswa terlebih dahulu.");
      return;
    }

    const nilaiDisiplin = Number(
      document.getElementById("nilaiDisiplin").value
    );
    const nilaiAdaptasi = Number(
      document.getElementById("nilaiAdaptasi").value
    );
    const nilaiKualitas = Number(
      document.getElementById("nilaiKualitas").value
    );
    const nilaiKomunikasi = Number(
      document.getElementById("nilaiKomunikasi").value
    );
    const nilaiInisiatif = Number(
      document.getElementById("nilaiInisiatif").value
    );

    const nilai = [
      nilaiDisiplin,
      nilaiAdaptasi,
      nilaiKualitas,
      nilaiKomunikasi,
      nilaiInisiatif
    ];

    if (nilai.some(n => !Number.isFinite(n) || n < 0 || n > 100)) {
      alert("Semua nilai harus di antara 0 sampai 100.");
      return;
    }

    const token = localStorage.getItem("access_token");

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/api/mentors/students/${siswaId}/certificate-assessment`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            disiplin_tanggung_jawab: nilaiDisiplin,
            kemampuan_adaptasi: nilaiAdaptasi,
            kualitas_hasil_kerja: nilaiKualitas,
            komunikasi_kerja_sama: nilaiKomunikasi,
            inisiatif_etika: nilaiInisiatif,
            catatan: document.getElementById("catatanPenilaian").value.trim() || null
          })
        }
      );

      const hasil = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          hasil.detail || `Gagal menyimpan penilaian (${response.status}).`
        );
      }

      showAttendancePopup(
        "success",
        "Penilaian Berhasil",
        "Nilai pembimbing berhasil disimpan."
      );

      formPenilaianSertifikat.reset();
    } catch (error) {
      showError(error);
    }
  });
}


 // Page guards + initial load
(async function initPage() {
  const path = window.location.pathname;

  const halamanSiswa = path.includes("dashboard_siswa.html");
  const halamanPembimbing = path.includes("dashboard_pembimbing.html");
  const halamanAdmin = path.includes("dashboard_admin.html");

  // Jalankan hanya pada halaman dashboard
  if (!halamanSiswa && !halamanPembimbing && !halamanAdmin) return;

  const user = getSessionUser();

  if (!user) {
    location.href = "index.html";
    return;
  }

  try {
    const serverUser = await Api.me();

    saveSessionUser(serverUser);

    // Pastikan role sesuai dengan halaman yang dibuka
    if (halamanSiswa && serverUser.role !== "siswa") {
      location.href = "index.html";
      return;
    }

    if (halamanPembimbing && serverUser.role !== "pembimbing") {
      location.href = "index.html";
      return;
    }

    if (halamanAdmin && serverUser.role !== "admin") {
      location.href = "index.html";
      return;
    }

    // Muat data sesuai dashboard
    if (serverUser.role === "siswa") {
      await renderSiswa();
    }

    if (serverUser.role === "pembimbing") {
  await renderPembimbing();
}

if (serverUser.role === "admin") {
  await renderAdmin();
}

    // Dashboard admin akan kita sambungkan berikutnya
  } catch (e) {
    showError(e);
  }
})();




// Fungsi penanganan logout langsung
function handleLogout(e) {
  if (e) e.preventDefault();
  localStorage.removeItem("sessionUser");
  localStorage.removeItem("access_token");
  sessionStorage.clear();
  window.location.href = "index.html";
}

// Gunakan Event Delegation (Menangkap klik di seluruh dokumen)
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "btnLogout") {
    handleLogout(e);
  }
});


function adminEscape(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "-");
  return element.innerHTML;
}




function tampilkanDataSiswaAdmin(siswa) {
  const tbody = document.getElementById("tabelDataSiswa");
  if (!tbody) return;

  tbody.innerHTML = siswa.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${adminEscape(item.nama || "-")}</td>
      <td>${adminEscape(item.nis || "-")}</td>
      <td>${adminEscape(item.kelas || "-")}</td>
    </tr>
  `).join("") || `
    <tr><td colspan="4">Belum ada data siswa.</td></tr>
  `;
}

function tampilkanDataPembimbingAdmin(pembimbing) {
  const tbody = document.getElementById("tabelDataPembimbing");
  if (!tbody) return;

  tbody.innerHTML = pembimbing.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${adminEscape(item.nama || "-")}</td>
      <td>${adminEscape(item.asal_daerah || "-")}</td>
      <td>${adminEscape(item.nomer_telepon || "-")}</td>
    </tr>
  `).join("") || `
    <tr><td colspan="4">Belum ada data pembimbing.</td></tr>
  `;
}



async function renderAdmin() {
  const user = getSessionUser();

  const namaAdmin = document.getElementById("adminNama");
const namaAdminDashboard = document.getElementById("adminNamaDashboard");

if (namaAdmin) {
  namaAdmin.textContent = user?.full_name || "Admin";
}

if (namaAdminDashboard) {
  namaAdminDashboard.textContent = user?.full_name || "Admin";
}
  const [
    students,
    supervisors,
    tasks
  ] = await Promise.all([
    Api.students(false),
    Api.supervisors(false),
    Api.tasks()
  ]);

  const daftarSiswa = Array.isArray(students) ? students : [];
  const daftarPembimbing = Array.isArray(supervisors) ? supervisors : [];
  const daftarTugas = Array.isArray(tasks) ? tasks : [];

  console.log("DATA TUGAS ADMIN:", tasks);
  console.log("JUMLAH TUGAS:", daftarTugas.length);
  console.log("STATUS TUGAS:", daftarTugas.map(tugas => ({
  id: tugas.id,
  judul: tugas.judul_tugas || tugas.title,
  status: tugas.status_progress
})));

  const totalSiswa = document.getElementById("totalSiswa");
  const totalPembimbing = document.getElementById("totalPembimbing");
  const totalTugas = document.getElementById("totalTugas");
  const tugasSelesai = document.getElementById("tugasSelesai");

  if (totalSiswa) totalSiswa.textContent = daftarSiswa.length;
  if (totalPembimbing) totalPembimbing.textContent = daftarPembimbing.length;
  if (totalTugas) totalTugas.textContent = daftarTugas.length;

  if (tugasSelesai) {
    tugasSelesai.textContent = daftarTugas.filter(
      tugas => tugas.status_progress === "selesai"
    ).length;
  }

   // Simpan data agar bisa dipakai untuk rekap admin
  window.dataAdmin = {
    students: daftarSiswa,
    supervisors: daftarPembimbing,
    tasks: daftarTugas
  };

tampilkanDataSiswaAdmin(daftarSiswa);
tampilkanDataPembimbingAdmin(daftarPembimbing);
renderRekapAdmin();
await renderStatistikAbsensiDashboard();
await renderRekapAbsensiAdmin();
await renderSertifikatAdmin();
}


async function renderStatistikAbsensiDashboard() {
    const tbody = document.getElementById(
        "tabelStatistikAbsensiDashboard"
    );

    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6">Memuat statistik absensi...</td>
        </tr>
    `;

    try {
       const [hasilAbsensi, hasilSiswa] = await Promise.all([
    ambilSemuaAbsensi(),
    Api.students(false)
]);

const daftarAbsensi = Array.isArray(hasilAbsensi)
    ? hasilAbsensi
    : [];

const daftarSiswa = Array.isArray(hasilSiswa)
    ? hasilSiswa
    : [];

        const statistik = daftarSiswa.map(siswa => ({
            id: Number(siswa.id),
            nama: siswa.nama || siswa.name || `Siswa ID: ${siswa.id}`,
            izin: 0,
            terlambat: 0,
            sakit: 0,
            bekerja: 0
        }));

        const statistikById = new Map(
            statistik.map(item => [item.id, item])
        );

        daftarAbsensi.forEach(absensi => {
            // Hitung absensi masuk saja, bukan absensi keluar.
            if (absensi.attendance_type !== "masuk") return;

            const idSiswa = Number(absensi.student_id);
            const dataSiswa = statistikById.get(idSiswa);

            if (!dataSiswa) return;

            const status = String(absensi.status || "")
                .trim()
                .toLowerCase();

            if (status === "izin") {
                dataSiswa.izin++;
            } else if (status === "terlambat") {
                dataSiswa.terlambat++;
            } else if (status === "sakit") {
                dataSiswa.sakit++;
            } else if (status === "bekerja") {
                dataSiswa.bekerja++;
            }
        });

        statistik.sort((a, b) =>
            a.nama.localeCompare(b.nama, "id")
        );

        tbody.innerHTML = statistik.map((siswa, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${adminEscape(siswa.nama)}</td>
                <td>${siswa.izin}</td>
                <td>${siswa.terlambat}</td>
                <td>${siswa.sakit}</td>
                <td>${siswa.bekerja}</td>
            </tr>
        `).join("") || `
            <tr>
                <td colspan="6">Belum ada data siswa.</td>
            </tr>
        `;

    } catch (error) {
        console.error(
            "Gagal memuat statistik absensi dashboard:",
            error
        );

        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    Gagal memuat statistik absensi.
                </td>
            </tr>
        `;
    }
}



async function renderRekapAbsensiAdmin() {
    const tbody = document.getElementById("tabelRekapAbsensi");
    if (!tbody) return;

    const filterPeriode = document.getElementById("filterPeriodeAbsensi");
    const filterBulan = document.getElementById("filterBulanAbsensi");
    const filterNama = document.getElementById("filterNamaAbsensi");

    const periode = filterPeriode?.value || "semua";
    const bulanDipilih = filterBulan?.value || "";
    const namaDipilih = filterNama?.value || "semua";

    if (filterBulan) {
        filterBulan.disabled = periode !== "bulan";
    }

    if (periode === "bulan" && !bulanDipilih) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">Pilih bulan terlebih dahulu.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="6">Memuat data absensi...</td>
        </tr>
    `;

    try {
      const [daftarAbsensi, hasilSiswa] = await Promise.all([
    ambilSemuaAbsensi(),
    Api.students(false)
]);

const daftarSiswa = Array.isArray(hasilSiswa)
    ? hasilSiswa
    : [];
        // Isi pilihan nama siswa.
        if (filterNama) {
            const pilihanLama = filterNama.value;
            const pilihanSiswa = daftarSiswa
                .map(siswa => ({
                    id: String(siswa.id),
                    nama: siswa.nama || siswa.name || `Siswa ID: ${siswa.id}`
                }))
                .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

            filterNama.innerHTML =
                '<option value="semua">Semua Siswa</option>' +
                pilihanSiswa.map(siswa => `
                    <option value="${adminEscape(siswa.id)}">
                        ${adminEscape(siswa.nama)}
                    </option>
                `).join("");

            if (
                pilihanLama === "semua" ||
                pilihanSiswa.some(siswa => siswa.id === pilihanLama)
            ) {
                filterNama.value = pilihanLama;
            }
        }

        // Gabungkan absensi masuk dan keluar pada tanggal yang sama.
        const grup = {};

        daftarAbsensi.forEach(item => {
            const idSiswa = Number(item.student_id);
            const tanggal = String(item.attendance_date || "").slice(0, 10);

            if (!idSiswa || !tanggal) return;

            if (namaDipilih !== "semua" &&
                String(idSiswa) !== namaDipilih) {
                return;
            }

            if (periode === "bulan" &&
                tanggal.slice(0, 7) !== bulanDipilih) {
                return;
            }

            const kunci = `${idSiswa}-${tanggal}`;
            const dataSiswa = daftarSiswa.find(
                siswa => Number(siswa.id) === idSiswa
            );

            if (!grup[kunci]) {
                grup[kunci] = {
                    idSiswa,
                    nama:
                        item.student?.nama ||
                        item.student?.name ||
                        dataSiswa?.nama ||
                        dataSiswa?.name ||
                        `Siswa ID: ${idSiswa}`,
                    tanggal,
                    masuk: null,
                    keluar: null,
                    status: item.status
                };
            }

            if (item.attendance_type === "masuk") {
                grup[kunci].masuk = item;
                grup[kunci].status = item.status;
            }

            if (item.attendance_type === "keluar") {
                grup[kunci].keluar = item;
            }
        });

        const rekap = Object.values(grup).sort((a, b) =>
            String(b.tanggal).localeCompare(String(a.tanggal)) ||
            a.nama.localeCompare(b.nama, "id")
        );

        tbody.innerHTML = rekap.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${adminEscape(item.nama)}</td>
                <td>${adminEscape(formatDate(item.tanggal))}</td>
                <td>${adminEscape(
                    item.masuk
                        ? formatTime(item.masuk.attendance_time)
                        : "-"
                )}</td>
                <td>${adminEscape(
                    item.keluar
                        ? formatTime(item.keluar.attendance_time)
                        : "-"
                )}</td>
                <td>${adminEscape(displayStatus(item.status))}</td>
            </tr>
        `).join("") || `
            <tr>
                <td colspan="6">Tidak ada absensi pada filter tersebut.</td>
            </tr>
        `;

        console.log("REKAP ABSENSI ADMIN:", rekap);

    } catch (error) {
        console.error("Gagal memuat rekap absensi admin:", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="6">Gagal memuat data absensi. Periksa Console.</td>
            </tr>
        `;
    }
}



async function ambilSemuaAbsensi() {
  const semuaAbsensi = [];
  const ukuranHalaman = 100;
  let halaman = 1;
  let totalData = Infinity;

  while (semuaAbsensi.length < totalData) {
    const hasil = await Api.attendances({
      page: halaman,
      page_size: ukuranHalaman
    });

    const items = Array.isArray(hasil?.items)
      ? hasil.items
      : Array.isArray(hasil)
        ? hasil
        : [];

    semuaAbsensi.push(...items);

    if (typeof hasil?.total === "number") {
      totalData = hasil.total;
    } else {
      if (items.length < ukuranHalaman) break;
    }

    if (items.length === 0) break;

    halaman++;
  }

  return semuaAbsensi;
}


// ==========================================
// SERTIFIKAT PKL - HITUNG NILAI SISWA
// ==========================================

async function renderSertifikatAdmin() {
  const tbody = document.getElementById("tabelSertifikat");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="13">Memuat data sertifikat...</td></tr>`;

  try {
   const [
  daftarAbsensi,
  hasilTugas,
  hasilPenilaian
] = await Promise.all([
  ambilSemuaAbsensi(),
  Api.tasks(),
  Api.certificateAssessments()
]);

    const daftarSiswa = window.dataAdmin?.students || [];
    
    const daftarTugas = Array.isArray(hasilTugas) ? hasilTugas : [];
    const daftarPenilaian = Array.isArray(hasilPenilaian)
   ? hasilPenilaian
   : [];

    // Perbarui daftar ini setiap tahun berdasarkan kalender resmi.
    // Format: YYYY-MM-DD
    const tanggalMerah = new Set([
      "2026-01-01",
      "2026-02-17",
      "2026-03-19",
      "2026-03-20",
      "2026-03-23",
      "2026-03-24",
      "2026-04-03",
      "2026-05-01",
      "2026-05-14",
      "2026-05-27",
      "2026-05-31",
      "2026-06-01",
      "2026-06-16",
      "2026-08-17",
      "2026-08-25",
      "2026-12-25"
    ]);

    // Bobot status absensi.
    const bobotStatus = {
  bekerja: 10,
  hadir: 10,
  terlambat: 10,
  sakit: 5,
  izin: 3,
  alpa: 0
 };

    function aman(nilai) {
      const elemen = document.createElement("span");
      elemen.textContent = String(nilai ?? "-");
      return elemen.innerHTML;
    }

    function tanggalLokal(nilai) {
      if (!nilai) return null;

      const bagian = String(nilai).slice(0, 10).split("-");
      if (bagian.length !== 3) return null;

      const [tahun, bulan, hari] = bagian.map(Number);
      const tanggal = new Date(tahun, bulan - 1, hari);

      if (
        Number.isNaN(tanggal.getTime()) ||
        tanggal.getFullYear() !== tahun ||
        tanggal.getMonth() !== bulan - 1 ||
        tanggal.getDate() !== hari
      ) return null;

      return tanggal;
    }

    function formatTanggal(nilai) {
      const tanggal = tanggalLokal(nilai);
      return tanggal
        ? tanggal.toLocaleDateString("id-ID")
        : "-";
    }

    function formatISO(tanggal) {
      const tahun = tanggal.getFullYear();
      const bulan = String(tanggal.getMonth() + 1).padStart(2, "0");
      const hari = String(tanggal.getDate()).padStart(2, "0");
      return `${tahun}-${bulan}-${hari}`;
    }

    function hariWajibMasuk(mulai, akhir) {
      const awal = tanggalLokal(mulai);
      const batas = tanggalLokal(akhir);
      if (!awal || !batas || awal > batas) return [];

      const daftar = [];
      const tanggal = new Date(awal);

      while (tanggal <= batas) {
        const hari = tanggal.getDay();
        const iso = formatISO(tanggal);

        if (
          hari !== 0 &&
          hari !== 6 &&
          !tanggalMerah.has(iso)
        ) {
          daftar.push(iso);
        }

        tanggal.setDate(tanggal.getDate() + 1);
      }

      return daftar;
    }

     const sekarang = new Date();
     sekarang.setHours(0, 0, 0, 0);

    tbody.innerHTML = daftarSiswa.map((siswa, index) => {
      const idSiswa = Number(siswa.id);
      const mulai = siswa.startPkl;
      const selesai = siswa.endPkl;
      const penilaian = daftarPenilaian.find(
  item => Number(item.student_id) === idSiswa
);

const nilaiDisiplin = penilaian?.disiplin_tanggung_jawab ?? null;
const nilaiAdaptasi = penilaian?.kemampuan_adaptasi ?? null;
const nilaiKualitas = penilaian?.kualitas_hasil_kerja ?? null;
const nilaiKomunikasi = penilaian?.komunikasi_kerja_sama ?? null;
const nilaiInisiatif = penilaian?.inisiatif_etika ?? null;

const nilaiPembimbing = [
  nilaiDisiplin,
  nilaiAdaptasi,
  nilaiKualitas,
  nilaiKomunikasi,
  nilaiInisiatif
];

const penilaianLengkap = nilaiPembimbing.every(
  nilai => nilai !== null && Number.isFinite(Number(nilai))
);
      const tanggalMulai = tanggalLokal(mulai);
      const tanggalSelesai = tanggalLokal(selesai);

      const periodeValid = Boolean(
        tanggalMulai &&
        tanggalSelesai &&
        tanggalMulai <= tanggalSelesai
      );
      const periodeBerakhir = Boolean(
  tanggalSelesai && tanggalSelesai < sekarang
);

      let batasAkhir = null;

      if (periodeValid && tanggalMulai <= sekarang) {
        batasAkhir = new Date(
          Math.min(tanggalSelesai.getTime(), sekarang.getTime())
        );
      }

      
const seluruhHariPKL = periodeValid
  ? hariWajibMasuk(mulai, selesai)
  : [];

const hariBerjalan = periodeValid && tanggalMulai <= sekarang
  ? hariWajibMasuk(
      mulai,
      formatISO(
        new Date(
          Math.min(
            tanggalSelesai.getTime(),
            sekarang.getTime()
          )
        )
      )
    )
  : [];



// Setelah PKL berakhir, gunakan seluruh periode.
// Selama PKL berlangsung, gunakan hari yang sudah berjalan.


const hariUntukNilai = periodeBerakhir
  ? seluruhHariPKL
  : hariBerjalan;


// Ambil absensi masuk per tanggal.
const absensiPerTanggal = new Map();

daftarAbsensi.forEach(item => {
  if (
    Number(item.student_id) !== idSiswa ||
    item.attendance_type !== "masuk"
  ) return;

  const tanggal = String(item.attendance_date || "").slice(0, 10);
  if (!hariUntukNilai.includes(tanggal)) return;

  const status = String(item.status || "")
    .trim()
    .toLowerCase();

  if (["ditolak", "di tolak", "ditolak pembimbing"].includes(status)) {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(bobotStatus, status)) {
    return;
  }

  if (!absensiPerTanggal.has(tanggal)) {
    absensiPerTanggal.set(tanggal, status);
  }
});


let totalPoin = 0;
let jumlahHariHadir = 0;

hariUntukNilai.forEach(tanggal => {
  const status = absensiPerTanggal.get(tanggal) || "alpa";

  totalPoin += bobotStatus[status] ?? 0;

  if (["bekerja", "hadir", "terlambat"].includes(status)) {
    jumlahHariHadir++;
  }
});


const nilaiKehadiran =
  periodeBerakhir && hariUntukNilai.length > 0
    ? Math.round(
        (totalPoin / (hariUntukNilai.length * 10)) * 100
      )
    : null;



      const tugasSiswa = daftarTugas.filter(item =>
        Number(item.id_siswa ?? item.student_id) === idSiswa
      );

      const jumlahTugas = tugasSiswa.length;
      const tugasSelesai = tugasSiswa.filter(item =>
        String(item.status_progress || "").toLowerCase() === "selesai"
      ).length;

      const nilaiTugas =
     periodeBerakhir && jumlahTugas > 0
    ? Math.round((tugasSelesai / jumlahTugas) * 100)
    : null;

      const nilaiAkhir =
  periodeBerakhir &&
  nilaiKehadiran !== null &&
  nilaiTugas !== null &&
  penilaianLengkap
    ? Math.round(
        nilaiKehadiran * 0.15 +
        nilaiTugas * 0.15 +
        Number(nilaiDisiplin) * 0.15 +
        Number(nilaiAdaptasi) * 0.15 +
        Number(nilaiKualitas) * 0.15 +
        Number(nilaiKomunikasi) * 0.15 +
        Number(nilaiInisiatif) * 0.10
      )
    : null;

      

         const keyPersetujuan = `sertifikat_pkl_disetujui_${idSiswa}`;
         const sudahDisetujui = localStorage.getItem(keyPersetujuan) === "true";

          let statusSertifikat = "Data belum lengkap";

         if (periodeBerakhir && nilaiAkhir !== null) {
         statusSertifikat = sudahDisetujui
         ? "Disetujui admin"
         : "Siap diperiksa admin";
          } else if (periodeBerakhir) {
         statusSertifikat = "Periksa data nilai";
         } else if (periodeValid) {
         statusSertifikat = "PKL berlangsung";
         }
      const nama = siswa.nama || siswa.name || siswa.full_name || "-";

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${aman(nama)}</td>
          <td>${aman(formatTanggal(mulai))} s.d. ${aman(formatTanggal(selesai))}</td>
          
          <td>
              ${periodeBerakhir
              ? (nilaiKehadiran === null
              ? "-"
               : `${nilaiKehadiran} (${totalPoin}/${hariUntukNilai.length * 10})`)
               : `${jumlahHariHadir}/${hariUntukNilai.length}`}
            </td>

          
            
<td>
  ${periodeBerakhir
    ? (nilaiTugas === null
      ? "Belum tersedia"
      : `${nilaiTugas} (${tugasSelesai}/${jumlahTugas})`)
    : `${tugasSelesai}/${jumlahTugas}`}
</td>

<td>${nilaiDisiplin ?? "Belum dinilai"}</td>
<td>${nilaiAdaptasi ?? "Belum dinilai"}</td>
<td>${nilaiKualitas ?? "Belum dinilai"}</td>
<td>${nilaiKomunikasi ?? "Belum dinilai"}</td>
<td>${nilaiInisiatif ?? "Belum dinilai"}</td>

<td>${nilaiAkhir === null ? "-" : nilaiAkhir}</td>


<td>${aman(statusSertifikat)}</td>

<td>
  ${
    !periodeBerakhir
      ? `<button type="button" disabled>PKL berlangsung</button>`
      : nilaiAkhir === null
        ? `<button type="button" disabled>Data belum lengkap</button>`
        : !sudahDisetujui
          ? `<button
              type="button"
              data-action="approve"
              data-student-id="${idSiswa}">
              Periksa &amp; Setujui
            </button>`
          
          : `<button
              type="button"
              data-action="print"
              data-student-id="${idSiswa}"
              data-name="${aman(nama)}"
              data-start="${aman(formatTanggal(mulai))}"
              data-end="${aman(formatTanggal(selesai))}"
              data-attendance="${nilaiKehadiran}"
              data-task="${nilaiTugas}"
              data-disiplin="${nilaiDisiplin}"
              data-adaptasi="${nilaiAdaptasi}"
              data-kualitas="${nilaiKualitas}"
              data-komunikasi="${nilaiKomunikasi}"
              data-inisiatif="${nilaiInisiatif}"
              data-final="${nilaiAkhir}">
              Cetak Sertifikat
            </button>`
  }
</td>
        </tr>
      `;

    }).join("") || `<tr><td colspan="13">Belum ada data siswa.</td></tr>`;

  } catch (error) {
    console.error("Gagal memuat sertifikat:", error);
    tbody.innerHTML = `
      <tr><td colspan="13">Gagal memuat data. Periksa koneksi backend.</td></tr>
    `;
  }
}


document.addEventListener("click", async function (e) {
  const tombol = e.target.closest("button[data-action]");
  if (!tombol) return;

  const aksi = tombol.dataset.action;
  const idSiswa = tombol.dataset.studentId;

  if (!idSiswa) return;

  if (aksi === "approve") {
    const yakin = confirm(
      "Apakah kamu yakin ingin menyetujui sertifikat siswa ini?"
    );

    if (!yakin) return;

    localStorage.setItem(
      `sertifikat_pkl_disetujui_${idSiswa}`,
      "true"
    );

    alert("Sertifikat berhasil disetujui.");

    await renderSertifikatAdmin();
    return;
  }

  if (aksi === "print") {
    const nama = tombol.dataset.name || "Siswa";
    const mulai = tombol.dataset.start || "-";
    const selesai = tombol.dataset.end || "-";
    
    const kehadiran = tombol.dataset.attendance || "-";
    const tugas = tombol.dataset.task || "-";
    const disiplin = tombol.dataset.disiplin || "-";
    const adaptasi = tombol.dataset.adaptasi || "-";
    const kualitas = tombol.dataset.kualitas || "-";
    const komunikasi = tombol.dataset.komunikasi || "-";
    const inisiatif = tombol.dataset.inisiatif || "-";
    const nilaiAkhir = tombol.dataset.final || "-";

    

    const jendela = window.open("", "_blank");

    if (!jendela) {
      alert("Popup diblokir. Izinkan popup untuk halaman ini.");
      return;
    }

    jendela.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Sertifikat PKL - ${nama}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 35px;
            text-align: center;
          }

          .sertifikat {
            border: 6px double #333;
            padding: 45px 30px;
            min-height: 400px;
          }

          h1 {
            margin-bottom: 10px;
          }

          .nama {
            font-size: 28px;
            font-weight: bold;
            margin: 25px 0;
          }

          .nilai {
            margin-top: 25px;
            line-height: 2;
          }

          @page {
            size: A4 landscape;
            margin: 15mm;
          }
        </style>
      </head>
      <body>
        <div class="sertifikat">
          <h1>SERTIFIKAT PRAKTIK KERJA LAPANGAN</h1>
          <p>Diberikan kepada:</p>

          <div class="nama">${nama}</div>

          <p>
            Telah menyelesaikan kegiatan Praktik Kerja Lapangan
            pada periode ${mulai} sampai ${selesai}.
          </p>

          
          <div class="nilai">
            Nilai Kehadiran: ${kehadiran}<br>
            Nilai Penyelesaian Tugas: ${tugas}<br>
            Disiplin dan Tanggung Jawab: ${disiplin}<br>
            Kemampuan Kerja dan Adaptasi Operasional: ${adaptasi}<br>
            Kualitas dan Ketepatan Hasil Kerja: ${kualitas}<br>
            Komunikasi dan Kerja Sama Tim: ${komunikasi}<br>
            Inisiatif dan Etika Kerja: ${inisiatif}<br>
            <strong>Nilai Akhir: ${nilaiAkhir}</strong>
          </div>

          <p style="margin-top: 45px;">
            Admin PKL
          </p>
        </div>

        <script>
          window.onload = function () {
            window.print();
          };
        <\/script>
      </body>
      </html>
    `);

    jendela.document.close();
  }
});



function renderRekapAdmin() {
  const data = window.dataAdmin || {};
  const semuaTugas = data.tasks || [];
  const siswa = data.students || [];

  const periode = document.getElementById("periodeRekap")?.value || "semua";
  const tanggalMulai = document.getElementById("tanggalMulaiRekap")?.value || "";
  const tanggalAkhir = document.getElementById("tanggalAkhirRekap")?.value || "";

  const sekarang = new Date();
  sekarang.setHours(0, 0, 0, 0);

  // Tentukan tanggal yang digunakan untuk filter tugas
  function tanggalTugas(tugas) {
    const nilai =
      tugas.startTugas ||
      tugas.tanggal_mulai ||
      tugas.created_at ||
      tugas.tanggal_dibuat ||
      tugas.deadline;

    if (!nilai) return null;

    const tanggal = new Date(nilai);
    if (Number.isNaN(tanggal.getTime())) return null;

    tanggal.setHours(0, 0, 0, 0);
    return tanggal;
  }

  const awalMinggu = new Date(sekarang);
  const hari = awalMinggu.getDay();
  awalMinggu.setDate(awalMinggu.getDate() - (hari === 0 ? 6 : hari - 1));

  const awalBulan = new Date(
    sekarang.getFullYear(),
    sekarang.getMonth(),
    1
  );

  const tugasTerfilter = semuaTugas.filter(tugas => {
    const tanggal = tanggalTugas(tugas);

    // Filter hari, minggu, atau bulan
    if (periode !== "semua") {
      if (!tanggal) return false;

      if (periode === "hari" && tanggal.toDateString() !== sekarang.toDateString()) {
  return false;
}

      if (periode === "minggu" && tanggal < awalMinggu) {
        return false;
      }

      if (periode === "bulan" && tanggal < awalBulan) {
        return false;
      }
    }

    // Filter tambahan tanggal mulai dan akhir
    if (tanggalMulai) {
      const mulai = new Date(tanggalMulai + "T00:00:00");
      if (!tanggal || tanggal < mulai) return false;
    }

    if (tanggalAkhir) {
      const akhir = new Date(tanggalAkhir + "T00:00:00");
      if (!tanggal || tanggal > akhir) return false;
    }

    return true;
  });

  function tanggalID(nilai) {
    if (!nilai) return "-";

    const tanggal = new Date(nilai);
    return Number.isNaN(tanggal.getTime())
      ? "-"
      : tanggal.toLocaleDateString("id-ID");
  }

  function aman(nilai) {
    const elemen = document.createElement("span");
    elemen.textContent = String(nilai ?? "-");
    return elemen.innerHTML;
  }

  function statusTugas(tugas) {
    const status = String(tugas.status_progress || "pending").toLowerCase();

    if (status === "selesai") return "selesai";
    if (status === "proses") return "proses";
    return "pending";
  }

  function namaSiswa(tugas) {
    const idSiswa = Number(tugas.id_siswa ?? tugas.student_id);
    const siswaTerkait = siswa.find(item => Number(item.id) === idSiswa);

    return (
      tugas.siswa?.nama ||
      tugas.student?.nama ||
      siswaTerkait?.nama ||
      "-"
    );
  }

  console.log("SEMUA TUGAS:", semuaTugas.length);
  console.log("TUGAS SETELAH FILTER:", tugasTerfilter.length);
  console.log("PERIODE DIPILIH:", periode);
  console.log("STATUS TUGAS TERFILTER:", tugasTerfilter.map(tugas => ({
  judul: tugas.judul_tugas || tugas.title,
  status: tugas.status_progress,
  tanggal: tanggalTugas(tugas)
})));

  const jumlahPending = semuaTugas.filter(
  tugas => statusTugas(tugas) === "pending"
).length;

const jumlahProses = semuaTugas.filter(
  tugas => statusTugas(tugas) === "proses"
).length;

const jumlahSelesai = semuaTugas.filter(
  tugas => statusTugas(tugas) === "selesai"
).length;

  console.log("JUMLAH TUGAS SELESAI:", jumlahSelesai);
console.log(
  "STATUS SEMUA TUGAS:",
  tugasTerfilter.map(tugas => ({
    id: tugas.id,
    judul: tugas.judul_tugas || tugas.title,
    status: tugas.status_progress
  }))
);

  const elPending = document.getElementById("jumlahPending");
  const elProses = document.getElementById("jumlahProses");
  const elSelesai = document.getElementById("jumlahSelesai");

  if (elPending) elPending.textContent = jumlahPending;
  if (elProses) elProses.textContent = jumlahProses;
  if (elSelesai) elSelesai.textContent = jumlahSelesai;

  const tabelRekap = document.getElementById("tabelRekapTugas");

  if (tabelRekap) {
    tabelRekap.innerHTML = tugasTerfilter.map((tugas, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${aman(namaSiswa(tugas))}</td>
        <td>${aman(tugas.judul_tugas || tugas.title || "-")}</td>
        <td>${aman(tanggalID(tugas.startTugas || tugas.tanggal_mulai))}</td>
        <td>${aman(tanggalID(tugas.deadline))}</td>
        <td>${aman(
          statusTugas(tugas) === "selesai"
            ? "Selesai"
            : statusTugas(tugas) === "proses"
              ? "Sedang Dikerjakan"
              : "Belum Mulai"
        )}</td>
      </tr>
    `).join("") || `
      <tr>
        <td colspan="6">Tidak ada tugas pada periode ini.</td>
      </tr>
    `;
  }

  const tabelStatus = document.getElementById("tabelStatusTugas");

  if (tabelStatus) {
    const daftarStatus = [
      ["Belum Mulai", jumlahPending],
      ["Sedang Dikerjakan", jumlahProses],
      ["Selesai", jumlahSelesai]
    ];

    tabelStatus.innerHTML = daftarStatus.map(item => `
      <tr>
        <td>${aman(item[0])}</td>
        <td>${item[1]}</td>
      </tr>
    `).join("");
  }
}


function cetakDaftarTugasAdmin() {
  const data = window.dataAdmin || {};
  const semuaTugas = data.tasks || [];
  const siswa = data.students || [];
  const pembimbing = data.supervisors || [];

  const periode =
    document.getElementById("periodeRekap")?.value || "semua";
  const tanggalMulai =
    document.getElementById("tanggalMulaiRekap")?.value || "";
  const tanggalAkhir =
    document.getElementById("tanggalAkhirRekap")?.value || "";

  const sekarang = new Date();
  sekarang.setHours(0, 0, 0, 0);

  function tanggalTugas(tugas) {
    const nilai =
      tugas.startTugas ||
      tugas.tanggal_mulai ||
      tugas.created_at ||
      tugas.tanggal_dibuat ||
      tugas.deadline;

    if (!nilai) return null;

    const tanggal = new Date(nilai);
    if (Number.isNaN(tanggal.getTime())) return null;

    tanggal.setHours(0, 0, 0, 0);
    return tanggal;
  }

  const awalMinggu = new Date(sekarang);
  const hari = awalMinggu.getDay();
  awalMinggu.setDate(
    awalMinggu.getDate() - (hari === 0 ? 6 : hari - 1)
  );

  const awalBulan = new Date(
    sekarang.getFullYear(),
    sekarang.getMonth(),
    1
  );

  const tugasTerfilter = semuaTugas.filter(tugas => {
    const tanggal = tanggalTugas(tugas);

    if (periode !== "semua") {
      if (!tanggal) return false;

      if (
        periode === "hari" &&
        tanggal.getTime() !== sekarang.getTime()
      ) {
        return false;
      }

      if (periode === "minggu" && tanggal < awalMinggu) {
        return false;
      }

      if (periode === "bulan" && tanggal < awalBulan) {
        return false;
      }
    }

    if (tanggalMulai) {
      const mulai = new Date(tanggalMulai + "T00:00:00");
      if (!tanggal || tanggal < mulai) return false;
    }

    if (tanggalAkhir) {
      const akhir = new Date(tanggalAkhir + "T00:00:00");
      if (!tanggal || tanggal > akhir) return false;
    }

    return true;
  });

  function aman(nilai) {
    const el = document.createElement("span");
    el.textContent = String(nilai ?? "-");
    return el.innerHTML;
  }

  function tanggalID(nilai) {
    if (!nilai) return "-";

    const tanggal = new Date(nilai);

    return Number.isNaN(tanggal.getTime())
      ? "-"
      : tanggal.toLocaleDateString("id-ID");
  }

  function namaSiswa(tugas) {
    const idSiswa = Number(tugas.id_siswa ?? tugas.student_id);

    const dataSiswa = siswa.find(
      item => Number(item.id) === idSiswa
    );

    return (
      tugas.siswa?.nama ||
      tugas.student?.nama ||
      tugas.siswa?.name ||
      tugas.student?.name ||
      dataSiswa?.nama ||
      dataSiswa?.name ||
      "-"
    );
  }

  function namaPembimbing(tugas) {
    const idPembimbing = Number(
      tugas.id_pembimbing ?? tugas.supervisor_id
    );

    const dataPembimbing = pembimbing.find(
      item => Number(item.id) === idPembimbing
    );

    return (
      tugas.pembimbing?.nama ||
      tugas.pembimbing?.name ||
      tugas.supervisor?.nama ||
      tugas.supervisor?.name ||
      dataPembimbing?.nama ||
      dataPembimbing?.name ||
      "-"
    );
  }

  const isiTabel = tugasTerfilter.map((tugas, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${aman(namaSiswa(tugas))}</td>
      <td>${aman(tugas.judul_tugas || tugas.title || "-")}</td>
      <td>${aman(namaPembimbing(tugas))}</td>
      <td>${aman(tanggalID(tugas.startTugas || tugas.tanggal_mulai))}</td>
      <td>${aman(tanggalID(tugas.deadline))}</td>
    </tr>
  `).join("");

  const namaPeriode = {
    semua: "Semua Periode",
    hari: "Hari Ini",
    minggu: "Minggu Ini",
    bulan: "Bulan Ini"
  };

  const rentangTanggal =
    tanggalMulai || tanggalAkhir
      ? `${tanggalMulai ? tanggalID(tanggalMulai) : "Awal"} sampai ${
          tanggalAkhir ? tanggalID(tanggalAkhir) : "Sekarang"
        }`
      : "Tidak dibatasi tanggal khusus";

  const jendelaCetak = window.open("", "_blank");

  if (!jendelaCetak) {
    alert("Popup cetak diblokir browser. Izinkan popup untuk halaman ini.");
    return;
  }

  jendelaCetak.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Daftar Tugas PKL</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #222;
          padding: 20px;
        }

        h2 {
          text-align: center;
          margin-bottom: 6px;
        }

        .info {
          margin: 4px 0;
          font-size: 12px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 18px;
          font-size: 11px;
        }

        th, td {
          border: 1px solid #555;
          padding: 8px 6px;
          text-align: left;
        }

        th {
          background: #eee;
        }

        .kosong {
          text-align: center;
        }

        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          body {
            padding: 0;
          }

          th {
            background: #eee !important;
            print-color-adjust: exact;
          }
        }
      </style>
    </head>
    <body>
      <h2>Laporan Daftar Tugas PKL</h2>

      <p class="info">
        Periode: ${aman(namaPeriode[periode] || periode)}
      </p>

      <p class="info">
        Rentang tanggal: ${aman(rentangTanggal)}
      </p>

      <p class="info">
        Tanggal cetak: ${aman(new Date().toLocaleDateString("id-ID"))}
      </p>

      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Nama Siswa</th>
            <th>Nama Tugas</th>
            <th>Pemberi Tugas</th>
            <th>Tanggal Mulai</th>
            <th>Deadline</th>
          </tr>
        </thead>
        <tbody>
          ${isiTabel || `
            <tr>
              <td colspan="6" class="kosong">
                Tidak ada tugas pada periode ini.
              </td>
            </tr>
          `}
        </tbody>
      </table>

      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);

  jendelaCetak.document.close();
}


// Tombol untuk menampilkan rekap tugas
document.getElementById("btnTampilkanRekap")
  ?.addEventListener("click", renderRekapAdmin);

  
document.getElementById("filterPeriodeAbsensi")
    ?.addEventListener("change", renderRekapAbsensiAdmin);

document.getElementById("filterBulanAbsensi")
    ?.addEventListener("change", renderRekapAbsensiAdmin);

document.getElementById("filterNamaAbsensi")
    ?.addEventListener("change", renderRekapAbsensiAdmin);


  
document.getElementById("btnCetakDaftarTugas")
  ?.addEventListener("click", cetakDaftarTugasAdmin);


// Perbarui rekap ketika periode berubah
document.getElementById("periodeRekap")
  ?.addEventListener("change", renderRekapAdmin);

// Perbarui rekap ketika tanggal berubah
document.getElementById("tanggalMulaiRekap")
  ?.addEventListener("change", renderRekapAdmin);

document.getElementById("tanggalAkhirRekap")
  ?.addEventListener("change", renderRekapAdmin);

  
/* Navigasi sidebar dashboard admin */
function bukaHalamanAdmin(namaHalaman) {
  const semuaHalaman = document.querySelectorAll(".admin-halaman");
  const semuaMenu = document.querySelectorAll(".sidebar-link");

  // Sembunyikan semua halaman
  semuaHalaman.forEach(halaman => {
    halaman.hidden = true;
  });

  // Hilangkan status aktif dari semua menu
  semuaMenu.forEach(menu => {
    menu.classList.remove("active");
  });

  // Tampilkan halaman yang dipilih
  const halamanDipilih = document.getElementById(
    `halaman-${namaHalaman}`
  );

  if (halamanDipilih) {
    halamanDipilih.hidden = false;
  }

  // Tandai menu yang sedang aktif
  const menuDipilih = document.querySelector(
    `.sidebar-link[data-halaman="${namaHalaman}"]`
  );

  if (menuDipilih) {
    menuDipilih.classList.add("active");
  }

  // Ubah judul bagian atas
  const judul = document.getElementById("judulHalaman");

  const daftarJudul = {
    dashboard: "Dashboard Admin",
    "rekap-absensi": "Rekap Absensi",
    "data-siswa": "Data Siswa",
    "data-pembimbing": "Data Pembimbing",
    "rekap-tugas": "Rekap Tugas",
    sertifikat: "Sertifikat PKL"
  };

  if (judul) {
    judul.textContent = daftarJudul[namaHalaman] || "Dashboard Admin";
  }
}

// Aktifkan fungsi klik menu sidebar
document.querySelectorAll(".sidebar-link").forEach(menu => {
  menu.addEventListener("click", () => {
    bukaHalamanAdmin(menu.dataset.halaman);
  });
});

// Tampilkan dashboard saat halaman pertama kali dibuka
if (document.querySelector(".admin-sidebar")) {
  bukaHalamanAdmin("dashboard");
}

/* Jam dan tanggal realtime khusus dashboard admin */
function jalankanJamAdmin() {
  const elemenJam = document.getElementById("clock-time");
  const elemenTanggal = document.getElementById("clock-date");

  // Berhenti jika bukan halaman admin
  if (!elemenJam || !elemenTanggal) return;

  function perbaruiJam() {
    const sekarang = new Date();

    elemenJam.textContent =
      sekarang.toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }) + " WIB";

    elemenTanggal.textContent =
      sekarang.toLocaleDateString("id-ID", {
        timeZone: "Asia/Jakarta",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      });
  }

  perbaruiJam();
  setInterval(perbaruiJam, 1000);
}

jalankanJamAdmin();
