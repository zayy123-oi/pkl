const state = {
  page: "dashboard",
  editing: null,
  data: {
    attendance: [],
    students: [],
    supervisors: [],
    locations: []
  }
};

const $ = id => document.getElementById(id);

const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );

const badge = status => {
  const value = String(status || "-").toUpperCase();
  const cls =
    value === "HADIR" ? "success" :
    value === "TERLAMBAT" ? "warning" :
    ["ALPHA", "DITOLAK"].includes(value) ? "danger" : "";

  return `<span class="badge ${cls}">${esc(value)}</span>`;
};

const formatDate = value => {
  if (!value) return "-";
  return String(value).slice(0, 10);
};

const formatTime = value => {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const toast = message => {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2600);
};

function normalizeList(data) {
  return Array.isArray(data)
    ? data
    : data?.items || data?.data || data?.results || [];
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!Api.getToken()) {
    location.href = "index.html";
    return;
  }

  const user = Api.getUser();

  $("userName").textContent =
    user.full_name || user.nama || user.name || user.username || "User";

  $("userRole").textContent =
    String(user.role || "user").toUpperCase();

  $("userAvatar").textContent =
    ($("userName").textContent[0] || "U").toUpperCase();

  $("browserInfo").textContent =
    navigator.userAgent.split(" ").slice(-2).join(" ");

  applyRoleVisibility(user);
  bindNavigation();
  bindActions();
  await loadPage("dashboard");
});

function applyRoleVisibility(user) {
  const role = String(user?.role || "").toLowerCase();
  const adminOnlyPages = ["students", "mentors", "locations"];

  if (role !== "admin") {
    document.querySelectorAll(".nav-item").forEach(button => {
      if (adminOnlyPages.includes(button.dataset.page)) {
        button.style.display = "none";
      }
    });

    ["addStudentBtn", "addMentorBtn", "addLocationBtn"].forEach(id => {
      const element = $(id);
      if (element) element.style.display = "none";
    });
  }
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      loadPage(button.dataset.page);
    });
  });

  $("menuBtn").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  $("logoutBtn").addEventListener("click", () => {
  if (typeof Api !== "undefined" && typeof Api.clearSession === "function") {
    Api.clearSession();
  }
  localStorage.removeItem("sessionUser");
  localStorage.removeItem("access_token");
  sessionStorage.clear();
  location.href = "index.html";
});

  $("refreshBtn").addEventListener("click", () => {
    loadPage(state.page);
  });
}

async function loadPage(page) {
  state.page = page;

  document.querySelectorAll(".page")
    .forEach(element => element.classList.remove("active"));

  $("page-" + page).classList.add("active");

  document.querySelectorAll(".nav-item")
    .forEach(element =>
      element.classList.toggle(
        "active",
        element.dataset.page === page
      )
    );

  const titles = {
    dashboard: ["Dashboard", "Ringkasan absensi hari ini"],
    attendance: ["Absensi", "Kelola data kehadiran siswa"],
    students: ["Master Siswa", "Kelola data siswa"],
    mentors: ["Pembimbing", "Kelola data pembimbing"],
    locations: ["Lokasi Absensi", "Kelola geofence absensi"]
  };

  $("pageTitle").textContent = titles[page][0];
  $("pageSubtitle").textContent = titles[page][1];
  $("sidebar").classList.remove("open");

  try {
    if (page === "dashboard") await loadDashboard();
    if (page === "attendance") await loadAttendance();
    if (page === "students") await loadStudents();
    if (page === "mentors") await loadSupervisors();
    if (page === "locations") await loadLocations();

    $("apiStatus").innerHTML = "<i></i> API Online";
  } catch (error) {
    $("apiStatus").innerHTML =
      "<i style='background:#ef4444'></i> API Error";
    toast(error.message);
  }
}

async function loadDashboard() {
  const dashboard = await Api.get("dashboard");

  $("statStudents").textContent =
    dashboard.total_students ?? 0;

  $("statPresent").textContent =
    dashboard.present ?? 0;

  $("statLate").textContent =
    dashboard.late ?? 0;

  $("statAbsent").textContent =
    dashboard.absent ?? 0;

  renderRecent(dashboard.recent || []);

  try {
    const ip = await Api.get("clientIp");
    $("clientIp").textContent =
      ip?.ip || "-";
  } catch {
    $("clientIp").textContent = "-";
  }
}

function renderRecent(rows) {
  $("recentAttendance").innerHTML = rows.length
    ? rows.map(row => `
      <tr>
        <td>${esc(row.student_name || "-")}</td>
        <td>${esc(formatDate(row.attendance_date))}</td>
        <td>${esc(formatTime(row.attendance_time))}</td>
        <td>${badge(row.status)}</td>
        <td>${esc(row.location_name || "-")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Belum ada data.</td></tr>`;
}

async function loadAttendance() {
  if (!state.data.students.length) {
    state.data.students = normalizeList(
      await Api.get("students")
    );
  }

  if (!state.data.locations.length) {
    state.data.locations = normalizeList(
      await Api.get("locations")
    );
  }

  if (!state.data.supervisors.length) {
    state.data.supervisors = normalizeList(
      await Api.get("supervisors")
    );
  }

  const result = await Api.get("attendances");
  const rows = normalizeList(result);

  state.data.attendance = rows;

  $("attendanceTable").innerHTML = rows.length
    ? rows.map(renderAttendanceRow).join("")
    : `<tr><td colspan="8">Belum ada data.</td></tr>`;
}

function renderAttendanceRow(row) {
  const id = row.id;

  const student =
    state.data.students.find(
      item => Number(item.id) === Number(row.student_id)
    );

  const role = String(Api.getUser()?.role || "").toLowerCase();
  const actions = role === "admin"
    ? `
      <button class="btn btn-secondary"
        onclick="editAttendance('${esc(id)}')">
        Edit
      </button>
      <button class="btn btn-secondary"
        onclick="removeRecord('attendance','${esc(id)}')">
        Hapus
      </button>
    `
    : role === "pembimbing"
      ? `
        <button class="btn btn-secondary"
          onclick="editAttendance('${esc(id)}')">
          Edit
        </button>
      `
      : "-";

  return `
    <tr>
      <td>${esc(id)}</td>
      <td>${esc(student?.name || row.student_id || "-")}</td>
      <td>${esc(formatDate(row.attendance_date))}</td>
      <td>${esc(formatTime(row.attendance_time))}</td>
      <td>${badge(row.status)}</td>
      <td>${esc(getLocationName(row.location_id))}</td>
      <td>${esc(row.ip_address || "-")}</td>
      <td>${actions}</td>
    </tr>
  `;
}

async function loadStudents() {
  const rows = normalizeList(
    await Api.get("students")
  );

  state.data.students = rows;

  $("studentsTable").innerHTML = rows.length
    ? rows.map(row => `
      <tr>
        <td>${esc(row.nis)}</td>
        <td>${esc(row.name)}</td>
        <td>${esc(row.class_name || "-")}</td>
        <td>${badge(row.is_active ? "AKTIF" : "NONAKTIF")}</td>
        <td>
          <button class="btn btn-secondary"
            onclick="editStudent('${esc(row.id)}')">
            Edit
          </button>
          <button class="btn btn-secondary"
            onclick="removeRecord('students','${esc(row.id)}')">
            Nonaktifkan
          </button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Belum ada data.</td></tr>`;
}

async function loadSupervisors() {
  const rows = normalizeList(
    await Api.get("supervisors")
  );

  state.data.supervisors = rows;

  $("mentorsTable").innerHTML = rows.length
    ? rows.map(row => `
      <tr>
        <td>${esc(row.id)}</td>
        <td>${esc(row.name)}</td>
        <td>${esc(row.email || "-")}</td>
        <td>${esc(row.phone || "-")}</td>
        <td>
          <button class="btn btn-secondary"
            onclick="editMentor('${esc(row.id)}')">
            Edit
          </button>
          <button class="btn btn-secondary"
            onclick="removeRecord('supervisors','${esc(row.id)}')">
            Nonaktifkan
          </button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Belum ada data.</td></tr>`;
}

async function loadLocations() {
  const rows = normalizeList(
    await Api.get("locations")
  );

  state.data.locations = rows;

  $("locationsTable").innerHTML = rows.length
    ? rows.map(row => `
      <tr>
        <td>${esc(row.name)}</td>
        <td>${esc(row.latitude)}</td>
        <td>${esc(row.longitude)}</td>
        <td>${esc(row.radius_meters)} m</td>
        <td>${badge(row.is_active ? "AKTIF" : "NONAKTIF")}</td>
        <td>
          <button class="btn btn-secondary"
            onclick="editLocation('${esc(row.id)}')">
            Edit
          </button>
          <button class="btn btn-secondary"
            onclick="removeRecord('locations','${esc(row.id)}')">
            Nonaktifkan
          </button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">Belum ada data.</td></tr>`;
}

function getLocationName(id) {
  const location = state.data.locations.find(
    item => Number(item.id) === Number(id)
  );
  return location?.name || "-";
}

function bindActions() {
  $("addAttendanceBtn").onclick =
    () => openForm("attendance");

  $("addStudentBtn").onclick =
    () => openForm("students");

  $("addMentorBtn").onclick =
    () => openForm("supervisors");

  $("addLocationBtn").onclick =
    () => openForm("locations");

  $("modalClose").onclick = closeModal;
  $("modalCancel").onclick = closeModal;
  $("modalForm").onsubmit = submitForm;

  $("attendanceFilterBtn").onclick =
    filterAttendance;
}

function openForm(type, row = null) {
  state.editing = {
    type,
    id: row?.id ?? null
  };

  const form = $("modalForm");
  let html = "";

  if (type === "attendance") {
    const students = state.data.students
      .map(student =>
        `<option value="${student.id}"
          ${Number(student.id) === Number(row?.student_id) ? "selected" : ""}>
          ${esc(student.nis)} - ${esc(student.name)}
        </option>`
      ).join("");

    const supervisors = state.data.supervisors
      .map(supervisor =>
        `<option value="${supervisor.id}"
          ${Number(supervisor.id) === Number(row?.supervisor_id) ? "selected" : ""}>
          ${esc(supervisor.name)}
        </option>`
      ).join("");

    const locations = state.data.locations
      .map(location =>
        `<option value="${location.id}"
          ${Number(location.id) === Number(row?.location_id) ? "selected" : ""}>
          ${esc(location.name)} (${esc(location.radius_meters)} m)
        </option>`
      ).join("");

    html = `
      <label>
        Siswa
        <select name="student_id" required>
          <option value="">Pilih siswa</option>
          ${students}
        </select>
      </label>

      <label>
        Pembimbing
        <select name="supervisor_id">
          <option value="">Tidak ada</option>
          ${supervisors}
        </select>
      </label>

      <label>
        Lokasi
        <select name="location_id">
          <option value="">Tanpa validasi geofence</option>
          ${locations}
        </select>
      </label>

      <label>
        Tipe
        <select name="attendance_type" required>
          <option value="masuk" ${row?.attendance_type === "masuk" ? "selected" : ""}>Masuk</option>
          <option value="pulang" ${row?.attendance_type === "pulang" ? "selected" : ""}>Pulang</option>
        </select>
      </label>

      <label>
        Status
        <select name="status">
          ${["hadir","terlambat","izin","sakit","alpha","ditolak"].map(status =>
            `<option value="${status}" ${row?.status === status ? "selected" : ""}>
              ${status.toUpperCase()}
            </option>`
          ).join("")}
        </select>
      </label>

      <label>
        Latitude
        <input name="latitude" type="number" step="any"
          value="${esc(row?.latitude ?? "")}">
      </label>

      <label>
        Longitude
        <input name="longitude" type="number" step="any"
          value="${esc(row?.longitude ?? "")}">
      </label>

      <label>
        Akurasi GPS (meter)
        <input name="location_accuracy_meters"
          type="number" min="0" step="any"
          value="${esc(row?.location_accuracy_meters ?? "")}">
      </label>

      <label class="full-field">
        Catatan
        <input name="note"
          value="${esc(row?.note ?? "")}">
      </label>

      <div class="full-field">
        <button type="button"
          class="btn btn-secondary"
          id="useMyLocationBtn">
          Gunakan Lokasi Saya
        </button>
        <small id="gpsMessage"></small>
      </div>
    `;
  }

  if (type === "students") {
    html = `
      <label>
        NIS
        <input name="nis" required
          value="${esc(row?.nis ?? "")}">
      </label>

      <label>
        Nama
        <input name="name" required
          value="${esc(row?.name ?? "")}">
      </label>

      <label>
        Kelas
        <input name="class_name"
          value="${esc(row?.class_name ?? "")}">
      </label>

      <label>
        Status
        <select name="is_active">
          <option value="true" ${row?.is_active !== false ? "selected" : ""}>Aktif</option>
          <option value="false" ${row?.is_active === false ? "selected" : ""}>Nonaktif</option>
        </select>
      </label>
    `;
  }

  if (type === "supervisors") {
    html = `
      <label>
        Nomor Pembimbing
        <input name="employee_number" required
          value="${esc(row?.employee_number ?? "")}">
      </label>

      <label>
        Nama
        <input name="name" required
          value="${esc(row?.name ?? "")}">
      </label>

      <label>
        Email
        <input name="email" type="email"
          value="${esc(row?.email ?? "")}">
      </label>

      <label>
        No. HP
        <input name="phone"
          value="${esc(row?.phone ?? "")}">
      </label>

      <label class="full-field">
        Status
        <select name="is_active">
          <option value="true" ${row?.is_active !== false ? "selected" : ""}>Aktif</option>
          <option value="false" ${row?.is_active === false ? "selected" : ""}>Nonaktif</option>
        </select>
      </label>
    `;
  }

  if (type === "locations") {
    html = `
      <label>
        Nama Lokasi
        <input name="name" required
          value="${esc(row?.name ?? "")}">
      </label>

      <label>
        Latitude
        <input name="latitude" type="number"
          step="any" required
          value="${esc(row?.latitude ?? "")}">
      </label>

      <label>
        Longitude
        <input name="longitude" type="number"
          step="any" required
          value="${esc(row?.longitude ?? "")}">
      </label>

      <label>
        Radius (meter)
        <input name="radius_meters" type="number"
          min="1" step="any" required
          value="${esc(row?.radius_meters ?? 150)}">
      </label>

      <label class="full-field">
        Status
        <select name="is_active">
          <option value="true" ${row?.is_active !== false ? "selected" : ""}>Aktif</option>
          <option value="false" ${row?.is_active === false ? "selected" : ""}>Nonaktif</option>
        </select>
      </label>
    `;
  }

  form.innerHTML = html;

  $("modalTitle").textContent =
    (row ? "Edit " : "Tambah ") +
    ({
      attendance: "Absensi",
      students: "Siswa",
      supervisors: "Pembimbing",
      locations: "Lokasi"
    }[type]);

  $("modalError").classList.add("hidden");
  $("modal").classList.remove("hidden");

  const gpsButton = $("useMyLocationBtn");
  if (gpsButton) {
    gpsButton.onclick = useMyLocation;
  }
}

function closeModal() {
  $("modal").classList.add("hidden");
  state.editing = null;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Browser tidak mendukung GPS."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      error => reject(
        new Error(
          error.code === 1
            ? "Izin lokasi ditolak browser."
            : "Lokasi tidak dapat diperoleh."
        )
      ),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

async function useMyLocation() {
  const message = $("gpsMessage");
  message.textContent = "Mengambil lokasi...";

  try {
    const position = await getCurrentPosition();

    $("modalForm").elements.latitude.value =
      position.coords.latitude;

    $("modalForm").elements.longitude.value =
      position.coords.longitude;

    $("modalForm").elements.location_accuracy_meters.value =
      position.coords.accuracy;

    message.textContent = "Lokasi berhasil diambil.";
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitForm(event) {
  event.preventDefault();

  const type = state.editing.type;
  const formData = new FormData(event.target);
  const raw = Object.fromEntries(formData.entries());

  try {
    let payload;

    if (type === "attendance") {
      if (!raw.latitude && raw.location_id) {
        try {
          const position = await getCurrentPosition();
          raw.latitude = position.coords.latitude;
          raw.longitude = position.coords.longitude;
          raw.location_accuracy_meters = position.coords.accuracy;
        } catch (error) {
          throw new Error(
            "GPS diperlukan untuk validasi lokasi: " +
            error.message
          );
        }
      }

      payload = {
        student_id: Number(raw.student_id),
        supervisor_id: raw.supervisor_id
          ? Number(raw.supervisor_id)
          : null,
        location_id: raw.location_id
          ? Number(raw.location_id)
          : null,
        attendance_type: raw.attendance_type,
        status: raw.status,
        latitude: raw.latitude ? Number(raw.latitude) : null,
        longitude: raw.longitude ? Number(raw.longitude) : null,
        location_accuracy_meters:
          raw.location_accuracy_meters
            ? Number(raw.location_accuracy_meters)
            : null,
        note: raw.note || null
      };
    }

    if (type === "students") {
      payload = {
        nis: raw.nis,
        name: raw.name,
        class_name: raw.class_name || null,
        is_active: raw.is_active === "true"
      };
    }

    if (type === "supervisors") {
      payload = {
        employee_number: raw.employee_number || "",
        name: raw.name,
        email: raw.email || null,
        phone: raw.phone || null,
        is_active: raw.is_active === "true"
      };
    }

    if (type === "locations") {
      payload = {
        name: raw.name,
        latitude: Number(raw.latitude),
        longitude: Number(raw.longitude),
        radius_meters: Number(raw.radius_meters),
        is_active: raw.is_active === "true"
      };
    }

    if (state.editing.id) {
      await Api.patch(
        type,
        state.editing.id,
        payload
      );
    } else {
      await Api.post(type, payload);
    }

    closeModal();
    toast("Data berhasil disimpan");
    await loadPage(state.page);
  } catch (error) {
    $("modalError").textContent = error.message;
    $("modalError").classList.remove("hidden");
  }
}

function editAttendance(id) {
  openForm(
    "attendance",
    state.data.attendance.find(
      row => String(row.id) === String(id)
    )
  );
}

function editStudent(id) {
  openForm(
    "students",
    state.data.students.find(
      row => String(row.id) === String(id)
    )
  );
}

function editMentor(id) {
  openForm(
    "supervisors",
    state.data.supervisors.find(
      row => String(row.id) === String(id)
    )
  );
}

function editLocation(id) {
  openForm(
    "locations",
    state.data.locations.find(
      row => String(row.id) === String(id)
    )
  );
}

async function removeRecord(type, id) {
  if (!confirm("Yakin ingin menonaktifkan/menghapus data ini?")) {
    return;
  }

  try {
    await Api.delete(type, id);
    toast("Data berhasil diproses");
    await loadPage(state.page);
  } catch (error) {
    toast(error.message);
  }
}

function filterAttendance() {
  const query =
    $("attendanceSearch").value.toLowerCase();

  const date =
    $("attendanceDate").value;

  const status =
    $("attendanceStatus").value;

  const rows = state.data.attendance.filter(row => {
    const student = state.data.students.find(
      item => Number(item.id) === Number(row.student_id)
    );

    const name =
      student?.name?.toLowerCase() || "";

    return (
      name.includes(query) &&
      (!date ||
        formatDate(row.attendance_date) === date) &&
      (!status ||
        String(row.status).toUpperCase() === status)
    );
  });

  $("attendanceTable").innerHTML = rows.length
    ? rows.map(renderAttendanceRow).join("")
    : `<tr><td colspan="8">Tidak ada data sesuai filter.</td></tr>`;
}