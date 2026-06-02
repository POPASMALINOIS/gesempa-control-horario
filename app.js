import { firebaseConfig, APP_COMPANY_ID, APP_COMPANY_NAME } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

setPersistence(auth, browserLocalPersistence).catch(console.error);

const $ = (id) => document.getElementById(id);

const loginView = $("loginView");
const appView = $("appView");

const state = {
  user: null,
  profile: null,
  employee: null,
  employees: [],
  todayRecord: null
};

const els = {
  authEmail: $("authEmail"),
  authPassword: $("authPassword"),
  loginBtn: $("loginBtn"),
  registerBtn: $("registerBtn"),
  authMessage: $("authMessage"),

  logoutBtn: $("logoutBtn"),
  currentEmployeeName: $("currentEmployeeName"),
  currentRole: $("currentRole"),
  clockStatus: $("clockStatus"),
  clockBtn: $("clockBtn"),
  todayIn: $("todayIn"),
  todayOut: $("todayOut"),
  todayTotal: $("todayTotal"),
  todayIncident: $("todayIncident"),

  recordsList: $("recordsList"),
  employeesList: $("employeesList"),
  employeeForm: $("employeeForm"),
  employeeName: $("employeeName"),
  employeeEmail: $("employeeEmail"),
  employeeRole: $("employeeRole"),
  employeeColor: $("employeeColor"),
  employeeSchedule: $("employeeSchedule"),
  employeesNavBtn: $("employeesNavBtn"),
  calendarGrid: $("calendarGrid"),
  calendarEmployeeSelect: $("calendarEmployeeSelect")
};

function showMessage(text) {
  els.authMessage.textContent = text || "";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function nameFromEmail(email) {
  return email.split("@")[0] || "Empleado";
}

function timeLabel(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dateLabel(date) {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString("es-ES");
}

function minutesBetween(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
}

function formatMinutes(total) {
  const h = Math.floor((total || 0) / 60);
  const m = (total || 0) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isAdmin() {
  return state.profile?.role === "admin" || state.employee?.role === "admin";
}

async function ensureCompany() {
  const ref = doc(db, "companies", APP_COMPANY_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      name: APP_COMPANY_NAME,
      defaultSchedule: "L-V 09:00-14:00 / 16:00-19:00",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

async function createUserAndEmployee(user, name, email, role = "admin") {
  await ensureCompany();

  const cleanName = name || nameFromEmail(email);

  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    companyId: APP_COMPANY_ID,
    name: cleanName,
    email,
    role,
    employeeId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await setDoc(doc(db, "employees", user.uid), {
    companyId: APP_COMPANY_ID,
    employeeId: user.uid,
    userId: user.uid,
    name: cleanName,
    email,
    color: "#0f7a3b",
    baseSchedule: "L-V 09:00-14:00 / 16:00-19:00",
    role,
    clockStatus: "outside",
    todayWorkStatus: "work",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function loadProfile(user) {
  const email = user.email || "";
  const fallbackName = user.displayName || nameFromEmail(email);

  let userRef = doc(db, "users", user.uid);
  let userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await createUserAndEmployee(user, fallbackName, email, "admin");
    userSnap = await getDoc(userRef);
  }

  state.profile = userSnap.data();

  let employeeId = state.profile.employeeId || user.uid;
  let employeeRef = doc(db, "employees", employeeId);
  let employeeSnap = await getDoc(employeeRef);

  if (!employeeSnap.exists()) {
    await setDoc(doc(db, "employees", user.uid), {
      companyId: APP_COMPANY_ID,
      employeeId: user.uid,
      userId: user.uid,
      name: state.profile.name || fallbackName,
      email: state.profile.email || email,
      color: "#0f7a3b",
      baseSchedule: "L-V 09:00-14:00 / 16:00-19:00",
      role: state.profile.role || "admin",
      clockStatus: "outside",
      todayWorkStatus: "work",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await updateDoc(userRef, {
      employeeId: user.uid,
      updatedAt: serverTimestamp()
    });

    employeeRef = doc(db, "employees", user.uid);
    employeeSnap = await getDoc(employeeRef);
  }

  state.employee = employeeSnap.exists()
    ? { id: employeeSnap.id, ...employeeSnap.data() }
    : null;
}

async function loadEmployees() {
  const q = query(
    collection(db, "employees"),
    where("companyId", "==", APP_COMPANY_ID)
  );

  const snap = await getDocs(q);

  state.employees = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

async function loadTodayRecord() {
  if (!state.employee) {
    state.todayRecord = null;
    return;
  }

  const q = query(
    collection(db, "timeRecords"),
    where("companyId", "==", APP_COMPANY_ID),
    where("employeeId", "==", state.employee.employeeId),
    where("date", "==", todayKey())
  );

  const snap = await getDocs(q);

  const records = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const aTime = a.clockIn || "";
      const bTime = b.clockIn || "";
      return bTime.localeCompare(aTime);
    });

  state.todayRecord = records[0] || null;
}

function renderShell() {
  const admin = isAdmin();

  els.currentEmployeeName.textContent =
    state.employee?.name ||
    state.profile?.name ||
    state.user?.email ||
    "Empleado";

  els.currentRole.textContent = admin ? "Administrador" : "Empleado";

  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = admin ? "" : "none";
  });

  els.employeesNavBtn.style.display = admin ? "" : "none";
}

function renderClock() {
  const record = state.todayRecord;
  const inside = record?.status === "open";

  els.clockStatus.textContent = inside ? "Dentro" : "Fuera";
  els.clockStatus.className = `clock-status ${inside ? "inside" : "outside"}`;

  els.clockBtn.disabled = false;
  els.clockBtn.textContent = inside ? "Fichar salida" : "Fichar entrada";
  els.clockBtn.classList.toggle("exit", inside);

  els.todayIn.textContent = timeLabel(record?.clockIn);
  els.todayOut.textContent = timeLabel(record?.clockOut);

  const total = inside
    ? minutesBetween(record.clockIn, nowIso())
    : record?.totalMinutes || 0;

  els.todayTotal.textContent = formatMinutes(total);

  els.todayIncident.textContent = inside
    ? "Jornada abierta. Pendiente de fichar salida."
    : "Sin incidencias detectadas.";
}

async function clockIn() {
  if (!state.user || !state.employee) {
    alert("No hay usuario o empleado cargado.");
    return;
  }

  if (state.todayRecord?.status === "open") {
    alert("Ya tienes una jornada abierta.");
    return;
  }

  await addDoc(collection(db, "timeRecords"), {
    companyId: APP_COMPANY_ID,
    employeeId: state.employee.employeeId,
    employeeName: state.employee.name,
    userId: state.user.uid,
    date: todayKey(),
    clockIn: nowIso(),
    clockOut: null,
    totalMinutes: 0,
    status: "open",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    editedBy: null,
    notes: ""
  });

  await updateDoc(doc(db, "employees", state.employee.id), {
    clockStatus: "inside",
    updatedAt: serverTimestamp()
  });
}

async function clockOut() {
  if (!state.todayRecord || state.todayRecord.status !== "open") {
    alert("No hay entrada abierta.");
    return;
  }

  const out = nowIso();
  const totalMinutes = minutesBetween(state.todayRecord.clockIn, out);

  await updateDoc(doc(db, "timeRecords", state.todayRecord.id), {
    clockOut: out,
    totalMinutes,
    status: "closed",
    updatedAt: serverTimestamp()
  });

  await updateDoc(doc(db, "employees", state.employee.id), {
    clockStatus: "outside",
    updatedAt: serverTimestamp()
  });
}

async function handleClock() {
  try {
    els.clockBtn.disabled = true;
    els.clockBtn.textContent = "Procesando...";

    if (state.todayRecord?.status === "open") {
      await clockOut();
    } else {
      await clockIn();
    }

    await refreshData();

  } catch (error) {
    console.error(error);
    alert("Error al fichar: " + error.message);
    els.clockBtn.disabled = false;
    renderClock();
  }
}

async function renderRecords() {
  if (!state.employee) {
    els.recordsList.innerHTML = "<p>No hay empleado cargado.</p>";
    return;
  }

  let q;

  if (isAdmin()) {
    q = query(
      collection(db, "timeRecords"),
      where("companyId", "==", APP_COMPANY_ID)
    );
  } else {
    q = query(
      collection(db, "timeRecords"),
      where("companyId", "==", APP_COMPANY_ID),
      where("employeeId", "==", state.employee.employeeId)
    );
  }

  const snap = await getDocs(q);

  const records = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 40);

  if (!records.length) {
    els.recordsList.innerHTML = "<p>No hay fichajes registrados todavía.</p>";
    return;
  }

  els.recordsList.innerHTML = records.map(r => `
    <div class="record-item">
      <strong>${r.employeeName || "Empleado"} · ${dateLabel(r.date)}</strong>
      <span>
        Entrada: ${timeLabel(r.clockIn)}
        · Salida: ${timeLabel(r.clockOut)}
        · Total: ${formatMinutes(r.totalMinutes)}
        · Estado: ${r.status === "open" ? "Abierto" : "Cerrado"}
      </span>
    </div>
  `).join("");
}

function renderEmployees() {
  if (!isAdmin()) return;

  els.employeesList.innerHTML = state.employees.length
    ? state.employees.map(e => `
        <div class="employee-item">
          <strong>${e.name}</strong>
          <span>${e.email} · ${e.role === "admin" ? "Administrador" : "Empleado"} · ${e.baseSchedule || ""}</span>
        </div>
      `).join("")
    : "<p>No hay empleados creados.</p>";

  els.calendarEmployeeSelect.innerHTML = state.employees.length
    ? state.employees.map(e => `<option value="${e.employeeId}">${e.name}</option>`).join("")
    : `<option value="">Sin empleados</option>`;
}

async function createEmployee(event) {
  event.preventDefault();

  if (!isAdmin()) {
    alert("Solo el administrador puede crear empleados.");
    return;
  }

  const name = els.employeeName.value.trim();
  const email = els.employeeEmail.value.trim().toLowerCase();

  if (!name || !email) {
    alert("Introduce nombre y email.");
    return;
  }

  const id = crypto.randomUUID();

  await setDoc(doc(db, "employees", id), {
    companyId: APP_COMPANY_ID,
    employeeId: id,
    userId: null,
    name,
    email,
    color: els.employeeColor.value,
    baseSchedule: els.employeeSchedule.value.trim(),
    role: els.employeeRole.value,
    clockStatus: "outside",
    todayWorkStatus: "work",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  els.employeeForm.reset();
  els.employeeColor.value = "#0f7a3b";
  els.employeeSchedule.value = "L-V 09:00-14:00 / 16:00-19:00";

  await refreshData();
}

function renderCalendar() {
  const year = new Date().getFullYear();
  const today = todayKey();

  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  els.calendarGrid.innerHTML = months.map((monthName, monthIndex) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      return `<div class="day ${date === today ? "today" : ""}">${day}</div>`;
    }).join("");

    return `
      <div class="month-card">
        <h3>${monthName}</h3>
        <div class="days">${days}</div>
      </div>
    `;
  }).join("");
}

async function refreshData() {
  await loadProfile(state.user);
  await loadEmployees();
  await loadTodayRecord();

  renderShell();
  renderClock();
  renderEmployees();
  renderCalendar();
  await renderRecords();
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".bottom-nav button").forEach(btn => btn.classList.remove("active"));

  $(tabId).classList.add("active");

  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (btn) btn.classList.add("active");
}

els.loginBtn.addEventListener("click", async () => {
  showMessage("");

  const email = els.authEmail.value.trim().toLowerCase();
  const password = els.authPassword.value;

  if (!email || !password) {
    showMessage("Introduce email y contraseña.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error(error);
    showMessage("Error al entrar: " + error.message);
  }
});

els.registerBtn.addEventListener("click", async () => {
  showMessage("");

  const email = els.authEmail.value.trim().toLowerCase();
  const password = els.authPassword.value;

  if (!email || !password) {
    showMessage("Introduce email y contraseña.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const cleanName = nameFromEmail(email);

    await updateProfile(cred.user, { displayName: cleanName });
    await createUserAndEmployee(cred.user, cleanName, email, "admin");

  } catch (error) {
    console.error(error);
    showMessage("Error al crear cuenta: " + error.message);
  }
});

els.logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

els.clockBtn.addEventListener("click", handleClock);
els.employeeForm.addEventListener("submit", createEmployee);

document.querySelectorAll(".bottom-nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    const tabId = btn.dataset.tab;
    if (tabId) switchTab(tabId);
  });
});

onAuthStateChanged(auth, async (user) => {
  state.user = user;

  if (!user) {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
    return;
  }

  try {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");

    await refreshData();

  } catch (error) {
    console.error(error);
    showMessage("Error cargando la app: " + error.message);

    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .catch(console.error);
  });
}

setInterval(() => {
  if (state.todayRecord?.status === "open") {
    renderClock();
  }
}, 30000);
