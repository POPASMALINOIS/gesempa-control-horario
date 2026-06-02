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
  orderBy,
  getDocs,
  updateDoc,
  serverTimestamp,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

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
  authName: $("authName"),
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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function timeLabel(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dateLabel(date) {
  return new Date(date).toLocaleDateString("es-ES");
}

function minutesBetween(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
}

function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function showAuthMessage(text) {
  els.authMessage.textContent = text || "";
}

function isAdmin() {
  return state.profile?.role === "admin" || state.employee?.role === "admin";
}

async function ensureCompany() {
  const companyRef = doc(db, "companies", APP_COMPANY_ID);
  const snap = await getDoc(companyRef);

  if (!snap.exists()) {
    await setDoc(companyRef, {
      name: APP_COMPANY_NAME,
      createdAt: serverTimestamp(),
      defaultSchedule: "L-V 09:00-14:00 / 16:00-19:00"
    });
  }
}

async function createUserAndEmployee(user, name, email, role = "admin") {
  const cleanName = name?.trim() || email;

  await ensureCompany();

  const userRef = doc(db, "users", user.uid);
  await setDoc(userRef, {
    uid: user.uid,
    companyId: APP_COMPANY_ID,
    name: cleanName,
    email,
    role,
    employeeId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  const employeeRef = doc(db, "employees", user.uid);
  await setDoc(employeeRef, {
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
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await createUserAndEmployee(user, user.displayName || user.email, user.email, "employee");
  }

  const finalUserSnap = await getDoc(userRef);
  state.profile = finalUserSnap.data();

  const employeeRef = doc(db, "employees", state.profile.employeeId || user.uid);
  const employeeSnap = await getDoc(employeeRef);

  state.employee = employeeSnap.exists()
    ? { id: employeeSnap.id, ...employeeSnap.data() }
    : null;
}

async function loadEmployees() {
  const q = query(
    collection(db, "employees"),
    where("companyId", "==", APP_COMPANY_ID),
    orderBy("name")
  );

  const snap = await getDocs(q);
  state.employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadTodayRecord() {
  if (!state.employee) return;

  const q = query(
    collection(db, "timeRecords"),
    where("companyId", "==", APP_COMPANY_ID),
    where("employeeId", "==", state.employee.employeeId),
    where("date", "==", todayKey()),
    orderBy("createdAt", "desc"),
    limit(1)
  );

  const snap = await getDocs(q);
  state.todayRecord = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function renderShell() {
  const admin = isAdmin();

  els.currentEmployeeName.textContent = state.employee?.name || state.profile?.name || state.user.email;
  els.currentRole.textContent = admin ? "Administrador" : "Empleado";

  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = admin ? "" : "none";
  });

  els.employeesNavBtn.style.display = admin ? "" : "none";
}

function renderClock() {
  const record = state.todayRecord;
  const isInside = record?.status === "open";

  els.clockStatus.textContent = isInside ? "Dentro" : "Fuera";
  els.clockStatus.className = `clock-status ${isInside ? "inside" : "outside"}`;

  els.clockBtn.textContent = isInside ? "Fichar salida" : "Fichar entrada";
  els.clockBtn.classList.toggle("exit", isInside);

  els.todayIn.textContent = timeLabel(record?.clockIn);
  els.todayOut.textContent = timeLabel(record?.clockOut);

  const total = record?.status === "open"
    ? minutesBetween(record.clockIn, nowIso())
    : record?.totalMinutes || 0;

  els.todayTotal.textContent = formatMinutes(total);

  if (record?.status === "open") {
    els.todayIncident.textContent = "Jornada abierta. Pendiente de fichar salida.";
  } else {
    els.todayIncident.textContent = "Sin incidencias detectadas.";
  }
}

async function clockIn() {
  if (!state.employee) return;

  if (state.todayRecord?.status === "open") {
    alert("Ya existe una entrada abierta. No puedes fichar dos entradas seguidas.");
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

  await refreshData();
}

async function clockOut() {
  if (!state.todayRecord || state.todayRecord.status !== "open") {
    alert("No hay ninguna entrada abierta. No puedes fichar salida sin entrada.");
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

  await refreshData();
}

async function handleClock() {
  try {
    els.clockBtn.disabled = true;
    els.clockBtn.textContent = "Procesando...";

    if (!state.user) {
      alert("No hay usuario conectado.");
      return;
    }

    if (!state.employee) {
      alert("No se ha encontrado perfil de empleado para este usuario.");
      return;
    }

    if (state.todayRecord?.status === "open") {
      await clockOut();
    } else {
      await clockIn();
    }

  } catch (error) {
    console.error("Error al fichar:", error);
    alert("Error al fichar: " + error.message);
  } finally {
    els.clockBtn.disabled = false;
    await refreshData();
  }
}

async function renderRecords() {
  if (!state.employee) return;

  let q;

  if (isAdmin()) {
    q = query(
      collection(db, "timeRecords"),
      where("companyId", "==", APP_COMPANY_ID),
      orderBy("date", "desc"),
      limit(40)
    );
  } else {
    q = query(
      collection(db, "timeRecords"),
      where("companyId", "==", APP_COMPANY_ID),
      where("employeeId", "==", state.employee.employeeId),
      orderBy("date", "desc"),
      limit(40)
    );
  }

  const snap = await getDocs(q);

  if (snap.empty) {
    els.recordsList.innerHTML = "<p>No hay fichajes registrados todavía.</p>";
    return;
  }

  els.recordsList.innerHTML = snap.docs.map(d => {
    const r = d.data();
    return `
      <div class="record-item">
        <strong>${r.employeeName || "Empleado"} · ${dateLabel(r.date)}</strong>
        <span>Entrada: ${timeLabel(r.clockIn)} · Salida: ${timeLabel(r.clockOut)} · Total: ${formatMinutes(r.totalMinutes || 0)} · Estado: ${r.status === "open" ? "Abierto" : "Cerrado"}</span>
      </div>
    `;
  }).join("");
}

function renderEmployees() {
  if (!isAdmin()) return;

  els.employeesList.innerHTML = state.employees.map(e => `
    <div class="employee-item">
      <strong>${e.name}</strong>
      <span>${e.email} · ${e.role === "admin" ? "Administrador" : "Empleado"} · ${e.baseSchedule || ""}</span>
    </div>
  `).join("");

  els.calendarEmployeeSelect.innerHTML = state.employees.map(e => `
    <option value="${e.employeeId}">${e.name}</option>
  `).join("");
}

async function createEmployee(event) {
  event.preventDefault();

  if (!isAdmin()) {
    alert("Solo el administrador puede crear empleados.");
    return;
  }

  const name = els.employeeName.value.trim();
  const email = els.employeeEmail.value.trim().toLowerCase();
  const role = els.employeeRole.value;
  const color = els.employeeColor.value;
  const baseSchedule = els.employeeSchedule.value.trim();

  const id = crypto.randomUUID();

  await setDoc(doc(db, "employees", id), {
    companyId: APP_COMPANY_ID,
    employeeId: id,
    userId: null,
    name,
    email,
    color,
    baseSchedule,
    role,
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
      return `<div class="day ${date === today ? "today" : ""}" title="${date}">${day}</div>`;
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
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.remove("active"));

  $(tabId).classList.add("active");
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
}

els.registerBtn.addEventListener("click", async () => {
  showAuthMessage("");

  const name = els.authName.value.trim();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;

  if (!name || !email || !password) {
    showAuthMessage("Introduce nombre, email y contraseña.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await createUserAndEmployee(cred.user, name, email, "admin");
  } catch (error) {
    showAuthMessage(error.message);
  }
});

els.loginBtn.addEventListener("click", async () => {
  showAuthMessage("");

  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;

  if (!email || !password) {
    showAuthMessage("Introduce email y contraseña.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showAuthMessage(error.message);
  }
});

els.logoutBtn.addEventListener("click", () => signOut(auth));
els.clockBtn.addEventListener("click", async () => {
  alert("Botón fichar pulsado");
  await handleClock();
});
els.employeeForm.addEventListener("submit", createEmployee);

document.querySelectorAll(".bottom-nav button").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

onAuthStateChanged(auth, async (user) => {
  state.user = user;

  if (!user) {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
    return;
  }

  loginView.classList.add("hidden");
  appView.classList.remove("hidden");

  await refreshData();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    } catch (error) {
      console.warn("Service Worker no registrado:", error);
    }
  });
}

setInterval(() => {
  if (state.todayRecord?.status === "open") {
    renderClock();
  }
}, 30000);
