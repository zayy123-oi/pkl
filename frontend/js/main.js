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
      if (data.user.role === "siswa") location.href = "dashboard_siswa.html";
      else if (data.user.role === "pembimbing") location.href = "dashboard_pembimbing.html";
      else if (data.user.role === "admin") location.href = "dashboard_admin.html";
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

  const [attPage, reports, tasks] = await Promise.all([
    Api.attendances({ page: 1, page_size: 100 }),
    Api.reports(),
    Api.tasks()
  ]);

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
    // Determine student ID for filtering
    const studentId = Number(user.student_id || user.id_siswa || user.id);

    // Filter reports so students only see their own submissions
    const studentReports = (reports || []).filter(
      item => Number(item.id_siswa || item.student_id) === studentId
    );

    tbodyLaporan.innerHTML = studentReports.map(item => `
      <tr>
        <td>${formatDate(item.tanggal_laporan || item.report_date || item.created_at)}</td>
        <td>${item.isi_laporan || item.judul_kegiatan || item.title || "-"}</td>
        <td>
          <span class="status-review">
            ${(item.status_review === "pending" || item.review_status === "menunggu_review") ? "Menunggu Review" : (item.status_review === "disetujui" || item.review_status === "disetujui") ? "Disetujui" : "Ditolak"}
          </span>
        </td>
        <td>${item.komentar_pembimbing || item.review_comment || "-"}</td>
      </tr>`).join("") || `<tr><td colspan="4">Belum ada laporan.</td></tr>`;
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
    ${progress === "selesai" ? "disabled" : ""}
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
  formLaporan.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const user = getSessionUser();
      const studentId = Number(user?.student_id || user?.id_siswa || user?.id);

      if (!studentId) {
        alert("ID Siswa tidak ditemukan. Silakan logout lalu login kembali.");
        return;
      }

      await Api.createReport({
        id_siswa: studentId,
        id_tugas: 1, // Diisi default ID Tugas (misal: 1) agar tidak NULL di database
        isi_laporan: document.getElementById("isiLaporan").value.trim()
      });

      
showAttendancePopup(
  "success",
  "Laporan Berhasil!",
  "Laporan berhasil dikirim ke server."
);

formLaporan.reset();
await renderSiswa();

    } catch (e) { showError(e); }
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
  const students = await Api.students(false);

  selectSiswaPkl.innerHTML = `
    <option value="">-- Pilih Siswa --</option>
    ${(students || []).map(student => `
      <option value="${student.id}">
        ${student.nama}
      </option>
    `).join("")}
  `;

  // Tabel daftar periode PKL siswa
  const tabelPeriodePkl = document.getElementById("tabelPeriodePkl");

  if (tabelPeriodePkl) {
    tabelPeriodePkl.innerHTML = "";

    (students || []).forEach(student => {
      const mulai = student.startPkl
        ? formatDate(student.startPkl)
        : "-";

      const selesai = student.endPkl
        ? formatDate(student.endPkl)
        : "-";

      let status = "-";

      if (student.startPkl && student.endPkl) {
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

      tabelPeriodePkl.innerHTML += `
        <tr>
          <td>${student.nama || "-"}</td>
          <td>${mulai}</td>
          <td>${selesai}</td>
          <td>${status}</td>
        </tr>
      `;
    });
  }

  selectSiswaPkl.onchange = async function () {
  const studentId = this.value;

  if (!studentId) {
    if (startPkl) startPkl.value = "";
    if (endPkl) endPkl.value = "";
    return;
  }

  try {
    const student = await Api.student(studentId);

    if (startPkl) startPkl.value = student.startPkl || "";
    if (endPkl) endPkl.value = student.endPkl || "";
  } catch (error) {
    showError(error);
  }
};
  }
  
  const selectSiswaTugas = document.getElementById("siswaTugas");

if (selectSiswaTugas) {
  const students = await Api.students(false);

  selectSiswaTugas.innerHTML = `
    <option value="">-- Pilih Siswa --</option>
    ${(students || []).map(student => `
      <option value="${student.id}">
        ${student.nama}
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
      // Ambil ID Laporan secara presisi
      const reportId = item.id_laporan || item.id || item.report_id;

      // Ambil status review
      const status = item.status_review || item.review_status || "pending";
      const isPending = status === "pending" || status === "menunggu_review";
      const statusText = isPending ? "Menunggu Review" : (status === "disetujui" ? "Disetujui" : status);

      // Ambil nama siswa
      const namaSiswa = item.siswa?.nama || item.student?.nama || item.siswa?.name || `Siswa ID: ${item.id_siswa || item.student_id || "-"}`;

      return `
        <tr>
          <td>${formatDate(item.tanggal_laporan || item.report_date || item.created_at)}</td>
          <td><strong>${namaSiswa}</strong></td>
          <td>${item.isi_laporan || item.content || "-"}</td>
          <td><strong>${statusText}</strong><br><small class="text-muted">${item.komentar_pembimbing || ""}</small></td>
          <td>
            ${isPending ? `<button class="btn btn-sm btn-success" onclick="reviewLaporan(${reportId}, 'disetujui')">Setujui</button>` : "-"}
          </td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="5">Belum ada laporan.</td></tr>`;
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
        <td><strong>${statusText}</strong></td>
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
// Page guards + initial load
(async function initPage() {
  const path = window.location.pathname;
  if (!path.includes("dashboard_siswa.html") && !path.includes("dashboard_pembimbing.html")) return;
  const user = getSessionUser();
  if (!user) { location.href = "index.html"; return; }
  try {
    const serverUser = await Api.me();
    saveSessionUser(serverUser);
    if (path.includes("dashboard_siswa.html") && serverUser.role !== "siswa") { location.href = "index.html"; return; }
    if (path.includes("dashboard_pembimbing.html") && serverUser.role !== "pembimbing") { location.href = "index.html"; return; }
    if (serverUser.role === "siswa") await renderSiswa();
    if (serverUser.role === "pembimbing") await renderPembimbing();
  } catch (e) { showError(e); }
})();

// ============================================================
// ADMIN DASHBOARD - CRUD MASTER KE SQL SERVER VIA API
// ============================================================

async function loadAdmin() {
  const user = getSessionUser();
  if (!user || user.role !== "admin") { location.href = "index.html"; return; }
  const name = document.getElementById("userNama"); if (name) name.textContent = user.full_name || "Administrator";
  const [students, supervisors, locations, att] = await Promise.all([
    Api.students(false), Api.supervisors(false), Api.locations(false), Api.attendances({ page: 1, page_size: 100 })
  ]);
  window.adminCache = { students, supervisors, locations };
  renderAdminStudents(students); renderAdminSupervisors(supervisors); renderAdminLocations(locations); renderAdminAttendances(att.items);
}

function renderAdminStudents(items) {
  const el = document.getElementById("adminStudents"); if (!el) return;
  el.innerHTML = items.map(x => `<tr><td>${x.id}</td><td>${x.nis}</td><td>${x.name}</td><td>${x.class_name || "-"}</td><td>${x.is_active ? "Ya" : "Tidak"}</td><td><button class="btn btn-sm btn-primary" onclick="editStudent(${x.id})">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteStudentAdmin(${x.id})">Nonaktifkan</button></td></tr>`).join("");
}
function renderAdminSupervisors(items) {
  const el = document.getElementById("adminSupervisors"); if (!el) return;
  el.innerHTML = items.map(x => `<tr><td>${x.id}</td><td>${x.employee_number}</td><td>${x.name}</td><td>${x.email || "-"}</td><td>${x.phone || "-"}</td><td>${x.is_active ? "Ya" : "Tidak"}</td><td><button class="btn btn-sm btn-primary" onclick="editSupervisor(${x.id})">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteSupervisorAdmin(${x.id})">Nonaktifkan</button></td></tr>`).join("");
}
function renderAdminLocations(items) {
  const el = document.getElementById("adminLocations"); if (!el) return;
  el.innerHTML = items.map(x => `<tr><td>${x.id}</td><td>${x.nama || x.name}</td><td>${x.latitude}</td><td>${x.longitude}</td><td>${x.radius_meter || x.radius_meters || 100}</td><td>${(x.is_aktif == 1 || x.is_active) ? "Ya" : "Tidak"}</td><td><button class="btn btn-sm btn-primary" onclick="editLocation(${x.id})">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteLocationAdmin(${x.id})">Nonaktifkan</button></td></tr>`).join("");
}
function renderAdminAttendances(items) {
  const el = document.getElementById("adminAttendances"); if (!el) return;
  el.innerHTML = items.map(x => `<tr><td>${x.id}</td><td>${x.student_id}</td><td>${x.attendance_type}</td><td>${formatTime(x.attendance_time)}</td><td>${displayStatus(x.status)}</td><td>${x.ip_address || "-"}</td><td><button class="btn btn-sm btn-danger" onclick="deleteAttendanceAdmin(${x.id})">Hapus</button></td></tr>`).join("") || `<tr><td colspan="7">Belum ada data.</td></tr>`;
}

window.editStudent = function(id) { 
  const x = adminCache.students.find(v => v.id === id); 
  if (!x) return; 
  document.getElementById("studentId").value = x.id; 
  document.getElementById("studentNis").value = x.nis; 
  document.getElementById("studentName").value = x.name; 
  document.getElementById("studentClass").value = x.class_name || ""; 
  document.getElementById("studentActive").value = String(x.is_active); 
  document.getElementById("startPkl").value = x.startPkl || "";
  document.getElementById("endPkl").value = x.endPkl || "";
};

window.resetStudentForm = function(){ 
  document.getElementById("formStudent")?.reset(); 
  document.getElementById("studentId").value = ""; 
};

window.editSupervisor = function(id) { 
  const x = adminCache.supervisors.find(v => v.id === id); 
  if (!x) return; 
  document.getElementById("supervisorId").value = x.id; 
  document.getElementById("supervisorNumber").value = x.employee_number; 
  document.getElementById("supervisorName").value = x.name; 
  document.getElementById("supervisorEmail").value = x.email || ""; 
  document.getElementById("supervisorPhone").value = x.phone || ""; 
  document.getElementById("supervisorActive").value = String(x.is_active); 
};

window.resetSupervisorForm = function(){ 
  document.getElementById("formSupervisor")?.reset(); 
  document.getElementById("supervisorId").value = ""; 
};

window.editLocation = function(id) { 
  const x = adminCache.locations.find(v => v.id === id); 
  if (!x) return; 
  document.getElementById("locationId").value = x.id; 
  document.getElementById("locationName").value = x.nama || x.name; 
  document.getElementById("locationLat").value = x.latitude; 
  document.getElementById("locationLng").value = x.longitude; 
  document.getElementById("locationRadius").value = x.radius_meter || x.radius_meters || 100; 
  document.getElementById("locationActive").value = String(x.is_aktif == 1 || x.is_active); 
};

window.resetLocationForm = function(){ 
  document.getElementById("formLocation")?.reset(); 
  document.getElementById("locationId").value = ""; 
};

window.deleteStudentAdmin = async function(id){ 
  if(!confirm("Nonaktifkan siswa ini?")) return; 
  try { await Api.deleteStudent(id); await loadAdmin(); } catch(e) { showError(e); } 
};

window.deleteSupervisorAdmin = async function(id){ 
  if(!confirm("Nonaktifkan pembimbing ini?")) return; 
  try { await Api.deleteSupervisor(id); } catch(e) { showError(e); } finally { await loadAdmin(); } 
};

window.deleteLocationAdmin = async function(id){ 
  if(!confirm("Nonaktifkan lokasi ini?")) return; 
  try { await Api.deleteLocation(id); } catch(e) { showError(e); } finally { await loadAdmin(); } 
};

window.deleteAttendanceAdmin = async function(id){ 
  if(!confirm("Hapus absensi ini dari database?")) return; 
  try { await Api.deleteAttendance(id); await loadAdmin(); } catch(e) { showError(e); } 
};

// Form Student Admin
const formStudent = document.getElementById("formStudent");
if (formStudent) {
  formStudent.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById("studentId").value;
      const payload = {
        nis: document.getElementById("studentNis").value.trim(),
        name: document.getElementById("studentName").value.trim(),
        class_name: document.getElementById("studentClass").value.trim() || null,
        is_active: document.getElementById("studentActive").value === "true"
      };
      if (id) await Api.updateStudent(id, payload);
      else await Api.createStudent(payload);
      
      alert("Data siswa tersimpan di database.");
      resetStudentForm();
      await loadAdmin();
    } catch (e) {
      showError(e);
    }
  });
}

// Form Supervisor Admin
const formSupervisor = document.getElementById("formSupervisor");
if (formSupervisor) {
  formSupervisor.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById("supervisorId").value;
      const payload = {
        employee_number: document.getElementById("supervisorNumber").value.trim(),
        name: document.getElementById("supervisorName").value.trim(),
        email: document.getElementById("supervisorEmail").value.trim() || null,
        phone: document.getElementById("supervisorPhone").value.trim() || null,
        is_active: document.getElementById("supervisorActive").value === "true"
      };
      if (id) await Api.updateSupervisor(id, payload);
      else await Api.createSupervisor(payload);
      
      alert("Data pembimbing tersimpan di database.");
      resetSupervisorForm();
      await loadAdmin();
    } catch (e) {
      showError(e);
    }
  });
}

// Form Location Admin
const formLocation = document.getElementById("formLocation");
if (formLocation) {
  formLocation.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById("locationId").value;
      const payload = {
        name: document.getElementById("locationName").value.trim(),
        latitude: Number(document.getElementById("locationLat").value),
        longitude: Number(document.getElementById("locationLng").value),
        radius_meters: Number(document.getElementById("locationRadius").value),
        is_active: document.getElementById("locationActive").value === "true"
      };
      if (id) await Api.updateLocation(id, payload);
      else await Api.createLocation(payload);
      
      alert("Lokasi tersimpan di database.");
      resetLocationForm();
      await loadAdmin();
    } catch (e) {
      showError(e);
    }
  });
}

if (window.location.pathname.includes("dashboard_admin.html")) {
  (async()=>{ try { await Api.me(); await loadAdmin(); } catch(e){showError(e);} })();
}

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