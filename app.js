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

const WORK_STATUSES = {
  work: { label: "Trabajo", isWorkingDay: true, isPresenceInOffice: true },
  day_off: { label: "Día libre", isWorkingDay: false, isPresenceInOffice: false },
  permission: { label: "Permiso", isWorkingDay: false, isPresenceInOffice: false },
  sick_leave: { label: "Baja", isWorkingDay: false, isPresenceInOffice: false },
  holiday: { label: "Festivo", isWorkingDay: false, isPresenceInOffice: false },
  vacation: { label: "Vacaciones", isWorkingDay: false, isPresenceInOffice: false },
  absence: { label: "Ausencia", isWorkingDay: true, isPresenceInOffice: false }
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

const loginView = $("loginView");
const appView = $("appView");

const state = {
  user: null,
  profile: null,
  employee: null,
  employees: [],
  todayRecord: null,
  calendarDays: {},
  selectedCalendarEmployeeId: null,
  calendarDate: new Date(),
  calendarView: "month",
  selectedCalendarStatus: "work"
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

  calendarTitle: $("calendarTitle"),
  calendarEmployeeSelect: $("calendarEmployeeSelect"),
  prevMonthBtn: $("prevMonthBtn"),
  nextMonthBtn: $("nextMonthBtn"),
  todayCalendarBtn: $("todayCalendarBtn"),
  monthViewBtn: $("monthViewBtn"),
  yearViewBtn: $("yearViewBtn"),
  monthlyCalendar: $("monthlyCalendar"),
  annualCalendar: $("annualCalendar")
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

function currentYear() {
  return state.calendarDate.getFullYear();
}

function currentMonth() {
  return state.calendarDate.getMonth();
}

function formatDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function calendarDocId(employeeId, date) {
  return `${APP_COMPANY_ID}_${employeeId}_${date}`;
}

function firstWeekdayMondayBased(year, monthIndex) {
  const jsDay = new Date(year, monthIndex, 1).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
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

  if (!state.selectedCalendarEmployeeId) {
    state.selectedCalendarEmployeeId = state.employee?.employeeId || user.uid;
  }
}

async function loadEmployees() {
  const q = query(collection(db, "employees"), where("companyId", "==", APP_COMPANY_ID));
  const snap = await getDocs(q);

  state.employees = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.active !== false)
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
    .sort((a, b) => (b.clockIn || "").localeCompare(a.clockIn || ""));

  state.todayRecord = records[0] || null;
}

async function loadCalendarDays() {
  if (!state.selectedCalendarEmployeeId) return;

  const q = query(
    collection(db, "calendarDays"),
    where("companyId", "==", APP_COMPANY_ID),
    where("employeeId", "==", state.selectedCalendarEmployeeId),
    where("year", "==", currentYear())
  );

  const snap = await getDocs(q);

  state.calendarDays = {};

  snap.docs.forEach(d => {
    const item = { id: d.id, ...d.data() };
    state.calendarDays[item.date] = item;
  });
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

  const total = inside ? minutesBetween(record.clockIn, nowIso()) : record?.totalMinutes || 0;
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

  const q = isAdmin()
    ? query(collection(db, "timeRecords"), where("companyId", "==", APP_COMPANY_ID))
    : query(
        collection(db, "timeRecords"),
        where("companyId", "==", APP_COMPANY_ID),
        where("employeeId", "==", state.employee.employeeId)
      );

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
}

function renderCalendarEmployeeSelect() {
  if (isAdmin()) {
    els.calendarEmployeeSelect.disabled = false;
    els.calendarEmployeeSelect.innerHTML = state.employees.length
      ? state.employees.map(e => `
          <option value="${e.employeeId}" ${e.employeeId === state.selectedCalendarEmployeeId ? "selected" : ""}>
            ${e.name}
          </option>
        `).join("")
      : `<option value="">Sin empleados</option>`;
  } else {
    els.calendarEmployeeSelect.disabled = true;
    els.calendarEmployeeSelect.innerHTML = `
      <option value="${state.employee.employeeId}">
        ${state.employee.name}
      </option>
    `;
  }
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

function renderMonthlyCalendar() {
  const year = currentYear();
  const month = currentMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstWeekdayMondayBased(year, month);

  els.calendarTitle.textContent = `${MONTHS[month]} ${year}`;

  let html = `
    <div class="weekdays">
      ${WEEKDAYS.map(d => `<span>${d}</span>`).join("")}
    </div>
    <div class="month-days">
  `;

  for (let i = 0; i < offset; i++) {
    html += `<div class="calendar-day empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = formatDateKey(year, month, day);
    const record = state.calendarDays[date];
    const status = record?.status;
    const todayClass = date === todayKey() ? "today" : "";
    const statusClass = status ? `status-${status}` : "";
    const title = status ? `${date} · ${WORK_STATUSES[status]?.label}` : date;

    html += `
      <button class="calendar-day ${todayClass} ${statusClass}" type="button" data-date="${date}" title="${title}">
        <span class="day-number">${day}</span>
      </button>
    `;
  }

  html += `</div>`;

  els.monthlyCalendar.innerHTML = html;

  els.monthlyCalendar.querySelectorAll(".calendar-day[data-date]").forEach(btn => {
    btn.addEventListener("click", () => paintCalendarDay(btn.dataset.date));
  });
}

function renderAnnualCalendar() {
  const year = currentYear();

  els.calendarTitle.textContent = `${year}`;

  els.annualCalendar.innerHTML = MONTHS.map((monthName, monthIndex) => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const offset = firstWeekdayMondayBased(year, monthIndex);

    let daysHtml = "";

    for (let i = 0; i < offset; i++) {
      daysHtml += `<div class="year-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = formatDateKey(year, monthIndex, day);
      const record = state.calendarDays[date];
      const status = record?.status || "";
      const title = status ? `${date} · ${WORK_STATUSES[status]?.label || ""}` : date;

      daysHtml += `
        <button class="year-day ${status}" type="button" data-date="${date}" title="${title}"></button>
      `;
    }

    return `
      <div class="year-month">
        <h3>${monthName}</h3>
        <div class="year-days">${daysHtml}</div>
      </div>
    `;
  }).join("");

  els.annualCalendar.querySelectorAll(".year-day[data-date]").forEach(btn => {
    btn.addEventListener("click", () => paintCalendarDay(btn.dataset.date));
  });
}

function renderCalendar() {
  renderCalendarEmployeeSelect();

  const isMonth = state.calendarView === "month";

  els.monthlyCalendar.classList.toggle("hidden", !isMonth);
  els.annualCalendar.classList.toggle("hidden", isMonth);
  els.monthViewBtn.classList.toggle("active", isMonth);
  els.yearViewBtn.classList.toggle("active", !isMonth);

  if (isMonth) {
    renderMonthlyCalendar();
  } else {
    renderAnnualCalendar();
  }
}

async function paintCalendarDay(date) {
  if (!isAdmin()) {
    alert("De momento solo el administrador puede modificar el calendario.");
    return;
  }

  if (!date || !state.selectedCalendarEmployeeId) return;

  const existing = state.calendarDays[date];

  const selectedEmployee = state.employees.find(
    e => e.employeeId === state.selectedCalendarEmployeeId
  );

  const id = calendarDocId(state.selectedCalendarEmployeeId, date);

  // Si el día ya tiene el mismo estado seleccionado, se limpia
  if (existing?.status === state.selectedCalendarStatus) {
    delete state.calendarDays[date];
    renderCalendar();

    await setDoc(doc(db, "calendarDays", id), {
      companyId: APP_COMPANY_ID,
      employeeId: state.selectedCalendarEmployeeId,
      employeeName: selectedEmployee?.name || "",
      date,
      status: null,
      statusLabel: "",
      isWorkingDay: null,
      isPresenceInOffice: null,
      notes: "",
      cleared: true,
      updatedBy: state.user.uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return;
  }

  const statusInfo = WORK_STATUSES[state.selectedCalendarStatus];
  const [year, month] = date.split("-").map(Number);

  const previousCreatedAt = existing?.createdAt || serverTimestamp();

  state.calendarDays[date] = {
    ...(existing || {}),
    companyId: APP_COMPANY_ID,
    employeeId: state.selectedCalendarEmployeeId,
    employeeName: selectedEmployee?.name || "",
    date,
    year,
    month,
    status: state.selectedCalendarStatus,
    statusLabel: statusInfo.label,
    isWorkingDay: statusInfo.isWorkingDay,
    isPresenceInOffice: statusInfo.isPresenceInOffice,
    notes: "",
    cleared: false,
    updatedBy: state.user.uid
  };

  renderCalendar();

  await setDoc(doc(db, "calendarDays", id), {
    companyId: APP_COMPANY_ID,
    employeeId: state.selectedCalendarEmployeeId,
    employeeName: selectedEmployee?.name || "",
    date,
    year,
    month,
    status: state.selectedCalendarStatus,
    statusLabel: statusInfo.label,
    isWorkingDay: statusInfo.isWorkingDay,
    isPresenceInOffice: statusInfo.isPresenceInOffice,
    notes: "",
    cleared: false,
    createdBy: state.user.uid,
    updatedBy: state.user.uid,
    createdAt: previousCreatedAt,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function refreshData() {
  await loadProfile(state.user);
  await loadEmployees();

  if (!state.selectedCalendarEmployeeId) {
    state.selectedCalendarEmployeeId = state.employee?.employeeId;
  }

  await loadTodayRecord();
  await loadCalendarDays();

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

els.prevMonthBtn.addEventListener("click", async () => {
  state.calendarDate = new Date(currentYear(), currentMonth() - 1, 1);
  await loadCalendarDays();
  renderCalendar();
});

els.nextMonthBtn.addEventListener("click", async () => {
  state.calendarDate = new Date(currentYear(), currentMonth() + 1, 1);
  await loadCalendarDays();
  renderCalendar();
});

els.todayCalendarBtn.addEventListener("click", async () => {
  state.calendarDate = new Date();
  await loadCalendarDays();
  renderCalendar();
});

els.monthViewBtn.addEventListener("click", () => {
  state.calendarView = "month";
  renderCalendar();
});

els.yearViewBtn.addEventListener("click", () => {
  state.calendarView = "year";
  renderCalendar();
});

els.calendarEmployeeSelect.addEventListener("change", async () => {
  state.selectedCalendarEmployeeId = els.calendarEmployeeSelect.value;
  await loadCalendarDays();
  renderCalendar();
});

document.querySelectorAll(".paint-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    state.selectedCalendarStatus = btn.dataset.status;

    document.querySelectorAll(".paint-btn").forEach(option => {
      option.classList.toggle("active", option === btn);
    });
  });
});

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
