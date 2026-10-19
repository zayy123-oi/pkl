// Base URL Backend FastAPI (Sudah ditambahkan /api)
const API_BASE_URL = "http://127.0.0.1:8000/api";

// Helper untuk mengambil token JWT dari LocalStorage
function getToken() {
  return localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
}
function clearSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("sessionUser");
  sessionStorage.clear();
}
async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(options.headers || {});
  const token = getToken();

  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    console.error("ERROR API:", err);
    throw new Error(`Tidak dapat terhubung ke API ${API_BASE_URL}. Pastikan FastAPI berjalan di port 8000.`);
  }

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (response.status === 401) {
    clearSession();
    if (!location.pathname.endsWith("index.html") && !location.pathname.endsWith("/")) {
      location.href = "index.html";
    }
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    if (data?.detail) {
      message = typeof data.detail === "string" ? data.detail : (data.detail.message || JSON.stringify(data.detail));
    }
    throw new Error(message);
  }
  return data;
}

const Api = {
  async login(username, password) {
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    return apiRequest("/auth/login", { method: "POST", body: form });
  },
  saveSession(token, user = {}, remember = false) {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem("access_token", token);
    storage.setItem("sessionUser", JSON.stringify(user));
  },
  getToken() {
    return localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  },
  // --- Tambahkan helper generik untuk app.js ---
  get: (endpoint) => apiRequest(`/${endpoint}`),
  post: (endpoint, payload) => apiRequest(`/${endpoint}`, { method: "POST", body: JSON.stringify(payload) }),
  patch: (endpoint, id, payload) => apiRequest(`/${endpoint}/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  delete: (endpoint, id) => apiRequest(`/${endpoint}/${id}`, { method: "DELETE" }),
  getUser: () => JSON.parse(localStorage.getItem("sessionUser") || sessionStorage.getItem("sessionUser") || "{}"),
  me: () => apiRequest("/auth/me"),
  dashboard: () => apiRequest("/attendances/dashboard"),
  clientIp: () => apiRequest("/attendances/client-ip"),
  attendances: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== "") q.set(k, v); });
    return apiRequest(`/attendances${q.toString() ? `?${q}` : ""}`);
  },
  todayAttendance: (studentId) => apiRequest(`/attendances/today/${studentId}`),
  createAttendance: (payload) => apiRequest("/attendances", { method: "POST", body: JSON.stringify(payload) }),
  updateAttendance: (id, payload) => apiRequest(`/attendances/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAttendance: (id) => apiRequest(`/attendances/${id}`, { method: "DELETE" }),
  students: (activeOnly = true) => apiRequest(`/students?active_only=${activeOnly}`),
  student: (id) => apiRequest(`/students/${id}`),
  updateStudentPkl: (id, payload) =>apiRequest(`/students/${id}/pkl`, { method: "PATCH",body: JSON.stringify(payload)}),
  deleteStudentPkl: (id) =>
  apiRequest(`/students/${id}/pkl`, {method: "DELETE"}),
  createStudent: (payload) => apiRequest("/students", { method: "POST", body: JSON.stringify(payload) }),
  updateStudent: (id,payload) => apiRequest(`/students/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteStudent: (id) => apiRequest(`/students/${id}`, { method: "DELETE" }),
  createSupervisor: (payload) => apiRequest("/supervisors", { method: "POST", body: JSON.stringify(payload) }),
  updateSupervisor: (id,payload) => apiRequest(`/supervisors/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteSupervisor: (id) => apiRequest(`/supervisors/${id}`, { method: "DELETE" }),
  createLocation: (payload) => apiRequest("/location", { method: "POST", body: JSON.stringify(payload) }),
  updateLocation: (id,payload) => apiRequest(`/location/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteLocation: (id) => apiRequest(`/location/${id}`, { method: "DELETE" }),
  supervisors: () => apiRequest("/mentors"),
  locations: () => apiRequest("/location"),
  reports: () => apiRequest("/reports"),
  createReport: (payload) => apiRequest("/reports", { method: "POST", body: JSON.stringify(payload) }),
  createReportWithPhoto: (formData) =>
  apiRequest("/reports/upload", { method: "POST",body: formData}),
  reviewReport: (id,payload) => apiRequest(`/reports/${id}/review`, { method: "PATCH", body: JSON.stringify(payload) }),
  tasks: () => apiRequest("/tasks"),
  createTask: (payload) => apiRequest("/tasks", { method: "POST", body: JSON.stringify(payload) }),
  updateTask: (id, payload) => apiRequest(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
};

// TAMBAHKAN BARIS INI DI BARIS PALING AKHIR FILE api.js
window.Api = Api;