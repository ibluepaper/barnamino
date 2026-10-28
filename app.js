(() => {
  "use strict";

  const STORAGE_KEY = "barnamino-data-v1";
  const DATA_URL = "data.json";
  const IDB_NAME = "barnamino-fs";
  const IDB_STORE = "handles";
  const FILE_HANDLE_KEY = "data-file";
  const DIR_HANDLE_KEY = "data-dir";
  const PICKER_ID = "barnamino-data-json";
  const DAYS = [
    { key: "sat", label: "شنبه" },
    { key: "sun", label: "یکشنبه" },
    { key: "mon", label: "دوشنبه" },
    { key: "tue", label: "سه‌شنبه" },
    { key: "wed", label: "چهارشنبه" },
    { key: "thu", label: "پنجشنبه" },
    { key: "fri", label: "جمعه" },
  ];

  const FILTER_HINTS = {
    any: "بازه‌هایی که همه در آن مشغول‌اند، صرف‌نظر از حضوری یا دورکاری.",
    office: "فقط بازه‌هایی که همه حضوری هستند.",
    remote: "فقط بازه‌هایی که همه دورکاری هستند.",
    same: "بازه‌هایی که همه هم‌زمان و با یک نوع حضور مشترک کار می‌کنند.",
  };

  const COLORS = [
    "#0f766e", "#c45c3e", "#1d4ed8", "#b45309",
    "#7c3aed", "#0e7490", "#be123c", "#166534",
  ];

  const DAY_JS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const BOARD_START = 6 * 60; // 06:00
  const BOARD_END = 22 * 60; // 22:00
  const BOARD_SPAN = BOARD_END - BOARD_START;

  const state = {
    teams: [],
    activeTeamId: null,
    people: [],
    selectedId: null,
    overlapIds: new Set(),
    overlapMode: "any",
    editingSlot: null, // { personId, day, index } or null for new
    fileHandle: null,
    boardDayFilter: "all",
    lookupTime: "10:00",
    lookupDays: new Set(),
    lookupMode: "any",
  };

  const el = {
    peopleList: document.getElementById("people-list"),
    peopleEmpty: document.getElementById("people-empty"),
    scheduleEmpty: document.getElementById("schedule-empty"),
    scheduleEditor: document.getElementById("schedule-editor"),
    weekGrid: document.getElementById("week-grid"),
    personName: document.getElementById("person-name"),
    personColor: document.getElementById("person-color"),
    editorSwatch: document.getElementById("editor-swatch"),
    personTeams: document.getElementById("person-teams"),
    personHours: document.getElementById("person-hours"),
    teamCapacity: document.getElementById("team-capacity"),
    overlapPeople: document.getElementById("overlap-people"),
    overlapResults: document.getElementById("overlap-results"),
    filterHint: document.getElementById("filter-hint"),
    toast: document.getElementById("toast"),
    slotModal: document.getElementById("slot-modal"),
    slotForm: document.getElementById("slot-form"),
    slotTitle: document.getElementById("slot-modal-title"),
    slotStart: document.getElementById("slot-start"),
    slotEnd: document.getElementById("slot-end"),
    slotError: document.getElementById("slot-error"),
    importFile: document.getElementById("import-file"),
    btnFileAccess: document.getElementById("btn-file-access"),
    fileOk: document.getElementById("file-ok"),
    teamBoard: document.getElementById("team-board"),
    boardDayFilters: document.getElementById("board-day-filters"),
    nowModal: document.getElementById("now-modal"),
    nowList: document.getElementById("now-list"),
    nowClock: document.getElementById("now-clock"),
    lookupTime: document.getElementById("lookup-time"),
    lookupDays: document.getElementById("lookup-days"),
    lookupResults: document.getElementById("lookup-results"),
    teamSelect: document.getElementById("team-select"),
    teamsModal: document.getElementById("teams-modal"),
    teamsList: document.getElementById("teams-list"),
    teamNewName: document.getElementById("team-new-name"),
    existingModal: document.getElementById("existing-modal"),
    existingList: document.getElementById("existing-list"),
  };

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function emptySchedule() {
    return Object.fromEntries(DAYS.map((d) => [d.key, []]));
  }

  function toFaDigits(value) {
    return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function toMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }

  function fromMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return toFaDigits(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  function formatRange(start, end) {
    return `${toFaDigits(start)} تا ${toFaDigits(end)}`;
  }

  function typeLabel(type) {
    return type === "remote" ? "دورکاری" : "حضوری";
  }

  function countSlots(person) {
    return DAYS.reduce((n, d) => n + (person.schedule[d.key]?.length || 0), 0);
  }

  function slotDurationMinutes(slot) {
    const mins = toMinutes(slot.end) - toMinutes(slot.start);
    return mins > 0 ? mins : 0;
  }

  function totalScheduleMinutes(person, type = null) {
    return DAYS.reduce((sum, d) => {
      const slots = person.schedule[d.key] || [];
      return sum + slots.reduce((s, slot) => {
        if (type && slot.type !== type) return s;
        return s + slotDurationMinutes(slot);
      }, 0);
    }, 0);
  }

  function formatHoursTotal(mins) {
    if (mins <= 0) return "۰ ساعت";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${toFaDigits(m)} دقیقه`;
    if (!m) return `${toFaDigits(h)} ساعت`;
    return `${toFaDigits(h)} ساعت و ${toFaDigits(m)} دقیقه`;
  }

  function peopleInTeam(teamId) {
    return state.people.filter((p) => p.teamIds.includes(teamId));
  }

  function teamCapacityMinutes(teamId) {
    return peopleInTeam(teamId).reduce((sum, p) => sum + totalScheduleMinutes(p), 0);
  }

  function dayKeyFromDate(date = new Date()) {
    return DAY_JS[date.getDay()];
  }

  function dayLabel(key) {
    return DAYS.find((d) => d.key === key)?.label || key;
  }

  function nowMinutes(date = new Date()) {
    return date.getHours() * 60 + date.getMinutes();
  }

  function formatClock(date = new Date()) {
    const day = dayLabel(dayKeyFromDate(date));
    const time = fromMinutes(nowMinutes(date));
    return `${day} — ساعت ${time}`;
  }

  function normalizeTeam(t) {
    return {
      id: t?.id || uid(),
      name: (t?.name || "تیم بدون نام").trim() || "تیم بدون نام",
    };
  }

  function createDefaultTeam() {
    return { id: uid(), name: "تیم اصلی" };
  }

  function getActiveTeam() {
    return state.teams.find((t) => t.id === state.activeTeamId) || null;
  }

  function activePeople() {
    if (!state.activeTeamId) return [];
    return state.people.filter((p) => p.teamIds.includes(state.activeTeamId));
  }

  function syncSelectionToActiveTeam() {
    const people = activePeople();
    if (!people.some((p) => p.id === state.selectedId)) {
      state.selectedId = people[0]?.id || null;
    }
    const activeIds = new Set(people.map((p) => p.id));
    state.overlapIds = new Set([...state.overlapIds].filter((id) => activeIds.has(id)));
  }

  function getCurrentlyWorking(date = new Date()) {
    const dayKey = dayKeyFromDate(date);
    const mins = nowMinutes(date);
    const list = [];
    for (const person of activePeople()) {
      for (const slot of person.schedule[dayKey] || []) {
        const start = toMinutes(slot.start);
        const end = toMinutes(slot.end);
        if (mins >= start && mins < end) {
          list.push({
            person,
            slot,
            until: slot.end,
            remaining: end - mins,
          });
        }
      }
    }
    list.sort((a, b) => toMinutes(a.until) - toMinutes(b.until) || a.person.name.localeCompare(b.person.name, "fa"));
    return list;
  }

  function formatRemaining(mins) {
    if (mins < 60) {
      return `<bdi>${toFaDigits(mins)}</bdi> دقیقه دیگر`;
    }
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!m) return `<bdi>${toFaDigits(h)}</bdi> ساعت دیگر`;
    return `<bdi>${toFaDigits(h)}</bdi> ساعت و <bdi>${toFaDigits(m)}</bdi> دقیقه دیگر`;
  }

  function buildPayload() {
    return {
      version: 2,
      app: "barnamino",
      exportedAt: new Date().toISOString(),
      teams: state.teams,
      activeTeamId: state.activeTeamId,
      people: state.people,
    };
  }

  function applyData(data) {
    const peopleRaw = Array.isArray(data?.people) ? data.people : [];
    let teams = Array.isArray(data?.teams) ? data.teams.map(normalizeTeam) : [];

    if (!teams.length) {
      const fallback = createDefaultTeam();
      teams = [fallback];
      state.teams = teams;
      state.activeTeamId = fallback.id;
      state.people = peopleRaw.map((p) =>
        normalizePerson({ ...p, teamIds: p.teamIds?.length ? p.teamIds : [fallback.id] }, [fallback.id])
      );
      syncSelectionToActiveTeam();
      return;
    }

    state.teams = teams;
    const teamIds = new Set(teams.map((t) => t.id));
    const preferred =
      (data.activeTeamId && teamIds.has(data.activeTeamId) && data.activeTeamId) ||
      (state.activeTeamId && teamIds.has(state.activeTeamId) && state.activeTeamId) ||
      teams[0].id;
    state.activeTeamId = preferred;

    const defaultTeamIds = [preferred];
    state.people = peopleRaw.map((p) => normalizePerson(p, defaultTeamIds));
    for (const person of state.people) {
      person.teamIds = person.teamIds.filter((id) => teamIds.has(id));
      if (!person.teamIds.length) person.teamIds = [...defaultTeamIds];
    }
    syncSelectionToActiveTeam();
  }

  function applyPeople(people) {
    applyData({ people, teams: state.teams, activeTeamId: state.activeTeamId });
  }

  function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPayload()));
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.people)) return false;
      applyData(data);
      return true;
    } catch {
      return false;
    }
  }

  function supportsFileAccess() {
    return (
      typeof window.showDirectoryPicker === "function" ||
      typeof window.showSaveFilePicker === "function" ||
      typeof window.showOpenFilePicker === "function"
    );
  }

  function openIdb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function ensurePermission(handle, mode = "readwrite") {
    if (!handle) return false;
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
    return false;
  }

  function updateAccessUi() {
    const ok = Boolean(state.fileHandle);
    el.btnFileAccess.classList.toggle("hidden", ok);
    el.fileOk.classList.toggle("hidden", !ok);
  }

  async function readHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    if (!text.trim()) return { people: [], teams: [] };
    const data = JSON.parse(text);
    if (!Array.isArray(data.people)) throw new Error("ساختار نامعتبر");
    return data;
  }

  async function writeHandle() {
    if (!state.fileHandle) return false;
    if (!(await ensurePermission(state.fileHandle, "readwrite"))) {
      state.fileHandle = null;
      updateAccessUi();
      return false;
    }
    const writable = await state.fileHandle.createWritable();
    await writable.write(JSON.stringify(buildPayload(), null, 2));
    await writable.close();
    return true;
  }

  async function loadFromFetch() {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.people)) throw new Error("ساختار نامعتبر");
    applyData(data);
    saveToLocalStorage();
  }

  async function persist() {
    saveToLocalStorage();
    if (!state.fileHandle) return;
    try {
      await writeHandle();
    } catch {
      state.fileHandle = null;
      updateAccessUi();
      showToast("دسترسی فایل قطع شد؛ دوباره «اجازه ذخیره» را بزنید");
    }
  }

  async function pickDataJsonHandle() {
    // ترجیح: پوشه پروژه → همیشه دقیقاً data.json داخل همان پوشه
    if (typeof window.showDirectoryPicker === "function") {
      const startIn = (await idbGet(DIR_HANDLE_KEY)) || (await idbGet(FILE_HANDLE_KEY));
      const dirOpts = { id: PICKER_ID, mode: "readwrite" };
      if (startIn) dirOpts.startIn = startIn;

      const dirHandle = await window.showDirectoryPicker(dirOpts);
      if (!(await ensurePermission(dirHandle, "readwrite"))) {
        throw new Error("permission-denied");
      }
      const fileHandle = await dirHandle.getFileHandle("data.json", { create: true });
      await idbSet(DIR_HANDLE_KEY, dirHandle);
      return fileHandle;
    }

    // جایگزین: دیالوگ ذخیره با نام پیش‌فرض data.json
    if (typeof window.showSaveFilePicker === "function") {
      const startIn = (await idbGet(DIR_HANDLE_KEY)) || (await idbGet(FILE_HANDLE_KEY));
      const opts = {
        id: PICKER_ID,
        suggestedName: "data.json",
        types: [
          {
            description: "data.json",
            accept: { "application/json": [".json"] },
          },
        ],
      };
      if (startIn) opts.startIn = startIn;
      return window.showSaveFilePicker(opts);
    }

    const startIn = await idbGet(FILE_HANDLE_KEY);
    const openOpts = {
      id: PICKER_ID,
      multiple: false,
      types: [
        {
          description: "data.json",
          accept: { "application/json": [".json"] },
        },
      ],
    };
    if (startIn) openOpts.startIn = startIn;
    const [handle] = await window.showOpenFilePicker(openOpts);
    return handle;
  }

  async function grantFileAccess() {
    if (!supportsFileAccess()) {
      showToast("این مرورگر اجازه ذخیره مستقیم را ندارد (Chrome/Edge)");
      return false;
    }
    try {
      const handle = await pickDataJsonHandle();
      if (!(await ensurePermission(handle, "readwrite"))) {
        showToast("اجازه نوشتن داده نشد");
        return false;
      }

      try {
        const fileData = await readHandle(handle);
        if (!state.people.length && fileData.people?.length) {
          applyData(fileData);
        }
      } catch {
        /* فایل خالی یا نامعتبر — با داده فعلی بازنویسی می‌شود */
      }

      state.fileHandle = handle;
      await idbSet(FILE_HANDLE_KEY, handle);
      await writeHandle();
      saveToLocalStorage();
      updateAccessUi();
      render();
      showToast("اجازه ذخیره روی data.json فعال شد");
      return true;
    } catch (err) {
      if (err && err.name === "AbortError") return false;
      if (err && err.message === "permission-denied") {
        showToast("اجازه نوشتن داده نشد");
        return false;
      }
      showToast("انتخاب مسیر data.json ممکن نشد");
      return false;
    }
  }

  async function restoreFileAccess() {
    if (!supportsFileAccess()) {
      updateAccessUi();
      return false;
    }
    try {
      const handle = await idbGet(FILE_HANDLE_KEY);
      if (!handle) {
        updateAccessUi();
        return false;
      }
      if (!(await ensurePermission(handle, "readwrite"))) {
        updateAccessUi();
        return false;
      }
      state.fileHandle = handle;
      updateAccessUi();
      return true;
    } catch {
      state.fileHandle = null;
      updateAccessUi();
      return false;
    }
  }

  async function bootLoad() {
    const restored = await restoreFileAccess();

    if (restored && state.fileHandle) {
      try {
        const data = await readHandle(state.fileHandle);
        applyData(data);
        saveToLocalStorage();
        return;
      } catch {
        /* ادامه با روش‌های دیگر */
      }
    }

    try {
      await loadFromFetch();
      return;
    } catch {
      /* file:// یا نبودن data.json */
    }

    if (!loadFromLocalStorage()) applyData({ people: [], teams: [] });
  }

  function normalizePerson(p, fallbackTeamIds = []) {
    const schedule = emptySchedule();
    for (const day of DAYS) {
      const slots = Array.isArray(p.schedule?.[day.key]) ? p.schedule[day.key] : [];
      schedule[day.key] = slots
        .filter((s) => s && s.start && s.end)
        .map((s) => ({
          start: s.start,
          end: s.end,
          type: s.type === "remote" ? "remote" : "office",
        }))
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    }
    let teamIds = Array.isArray(p.teamIds)
      ? [...new Set(p.teamIds.filter(Boolean))]
      : [];
    if (!teamIds.length && fallbackTeamIds.length) {
      teamIds = [...fallbackTeamIds];
    }
    return {
      id: p.id || uid(),
      name: (p.name || "بدون نام").trim() || "بدون نام",
      color: p.color || COLORS[0],
      teamIds,
      schedule,
    };
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.toast.classList.remove("show"), 2400);
  }

  function getSelectedPerson() {
    return activePeople().find((p) => p.id === state.selectedId) || null;
  }

  function ensureActiveTeam() {
    if (getActiveTeam()) return true;
    showToast("ابتدا یک تیم بسازید");
    openTeamsModal();
    return false;
  }

  function addPerson() {
    if (!ensureActiveTeam()) return;
    const color = COLORS[state.people.length % COLORS.length];
    const person = {
      id: uid(),
      name: `فرد ${toFaDigits(activePeople().length + 1)}`,
      color,
      teamIds: [state.activeTeamId],
      schedule: emptySchedule(),
    };
    state.people.push(person);
    state.selectedId = person.id;
    persist();
    render();
    el.personName.focus();
    el.personName.select();
  }

  function addExistingToActiveTeam(personId) {
    if (!ensureActiveTeam()) return;
    const person = state.people.find((p) => p.id === personId);
    if (!person) return;
    if (!person.teamIds.includes(state.activeTeamId)) {
      person.teamIds.push(state.activeTeamId);
    }
    state.selectedId = person.id;
    persist();
    renderExistingList();
    render();
    showToast(`«${person.name}» به تیم اضافه شد`);
  }

  function deleteSelectedPerson() {
    const person = getSelectedPerson();
    if (!person || !state.activeTeamId) return;
    const inOtherTeams = person.teamIds.some((id) => id !== state.activeTeamId);
    const msg = inOtherTeams
      ? `«${person.name}» فقط از این تیم حذف شود؟ (در تیم‌های دیگر می‌ماند)`
      : `«${person.name}» کاملاً حذف شود؟`;
    if (!confirm(msg)) return;

    person.teamIds = person.teamIds.filter((id) => id !== state.activeTeamId);
    if (!person.teamIds.length) {
      state.people = state.people.filter((p) => p.id !== person.id);
    }
    state.overlapIds.delete(person.id);
    syncSelectionToActiveTeam();
    persist();
    render();
    showToast(inOtherTeams ? "از این تیم حذف شد" : "فرد حذف شد");
  }

  function setPersonTeamMembership(person, teamId, joined) {
    const has = person.teamIds.includes(teamId);
    if (joined && !has) person.teamIds.push(teamId);
    if (!joined && has) {
      if (person.teamIds.length <= 1) {
        showToast("هر فرد باید حداقل عضو یک تیم باشد");
        return false;
      }
      person.teamIds = person.teamIds.filter((id) => id !== teamId);
    }
    return true;
  }

  function addTeam(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const team = { id: uid(), name: trimmed };
    state.teams.push(team);
    if (!state.activeTeamId) state.activeTeamId = team.id;
    return team;
  }

  function renameTeam(teamId, name) {
    const team = state.teams.find((t) => t.id === teamId);
    if (!team) return;
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    team.name = trimmed;
  }

  function deleteTeam(teamId) {
    if (state.teams.length <= 1) {
      showToast("حداقل یک تیم باید باقی بماند");
      return;
    }
    const team = state.teams.find((t) => t.id === teamId);
    if (!team) return;
    if (!confirm(`تیم «${team.name}» حذف شود؟ اعضای فقطِ این تیم هم حذف می‌شوند.`)) return;

    state.teams = state.teams.filter((t) => t.id !== teamId);
    state.people = state.people
      .map((p) => ({
        ...p,
        teamIds: p.teamIds.filter((id) => id !== teamId),
      }))
      .filter((p) => p.teamIds.length);

    if (state.activeTeamId === teamId) {
      state.activeTeamId = state.teams[0]?.id || null;
    }
    syncSelectionToActiveTeam();
    persist();
    render();
    renderTeamsList();
    showToast("تیم حذف شد");
  }

  function switchTeam(teamId) {
    if (!state.teams.some((t) => t.id === teamId)) return;
    state.activeTeamId = teamId;
    syncSelectionToActiveTeam();
    persist();
    render();
  }

  function updateSelectedMeta() {
    const person = getSelectedPerson();
    if (!person) return;
    person.name = el.personName.value.trim() || "بدون نام";
    person.color = el.personColor.value;
    persist();
    renderPeopleList();
    renderOverlapPicker();
    renderTeamSwitcher();
    el.editorSwatch.style.background = person.color;
  }

  function openSlotModal(day, index = null) {
    const person = getSelectedPerson();
    if (!person) return;
    state.editingSlot = { personId: person.id, day, index };
    el.slotError.classList.add("hidden");
    el.slotTitle.textContent =
      index === null ? `بازه جدید — ${DAYS.find((d) => d.key === day).label}` : "ویرایش بازه";

    if (index === null) {
      el.slotStart.value = "09:00";
      el.slotEnd.value = "17:00";
      el.slotForm.querySelector('input[name="slot-type"][value="office"]').checked = true;
    } else {
      const slot = person.schedule[day][index];
      el.slotStart.value = slot.start;
      el.slotEnd.value = slot.end;
      el.slotForm.querySelector(`input[name="slot-type"][value="${slot.type}"]`).checked = true;
    }
    el.slotModal.showModal();
  }

  function saveSlot(event) {
    event.preventDefault();
    const person = getSelectedPerson();
    const edit = state.editingSlot;
    if (!person || !edit || edit.personId !== person.id) return;

    const start = el.slotStart.value;
    const end = el.slotEnd.value;
    const type = el.slotForm.querySelector('input[name="slot-type"]:checked').value;

    if (toMinutes(end) <= toMinutes(start)) {
      el.slotError.textContent = "ساعت پایان باید بعد از شروع باشد.";
      el.slotError.classList.remove("hidden");
      return;
    }

    const slot = { start, end, type };
    if (edit.index === null) {
      person.schedule[edit.day].push(slot);
    } else {
      person.schedule[edit.day][edit.index] = slot;
    }
    person.schedule[edit.day].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    persist();
    el.slotModal.close();
    renderWeekGrid();
    renderPeopleList();
    renderOverlapResults();
  }

  function removeSlot(day, index) {
    const person = getSelectedPerson();
    if (!person) return;
    person.schedule[day].splice(index, 1);
    persist();
    renderWeekGrid();
    renderPeopleList();
    renderOverlapResults();
  }

  function intersectIntervals(lists) {
    if (!lists.length) return [];
    let result = lists[0].map((x) => ({ ...x }));
    for (let i = 1; i < lists.length; i++) {
      const next = [];
      for (const a of result) {
        for (const b of lists[i]) {
          const start = Math.max(a.start, b.start);
          const end = Math.min(a.end, b.end);
          if (start < end) {
            next.push({
              start,
              end,
              types: [...(a.types || [a.type]), b.type],
            });
          }
        }
      }
      result = next;
      if (!result.length) break;
    }
    return result;
  }

  function filterByMode(intervals, mode) {
    return intervals
      .map((iv) => {
        const types = iv.types || [iv.type];
        if (mode === "any") {
          return { ...iv, kind: "any", label: "مشغول (هر نوع)" };
        }
        if (mode === "office") {
          if (types.every((t) => t === "office")) {
            return { ...iv, kind: "office", label: "حضوری مشترک" };
          }
          return null;
        }
        if (mode === "remote") {
          if (types.every((t) => t === "remote")) {
            return { ...iv, kind: "remote", label: "دورکاری مشترک" };
          }
          return null;
        }
        // same: all must share one type
        if (types.every((t) => t === "office")) {
          return { ...iv, kind: "office", label: "حضوری مشترک" };
        }
        if (types.every((t) => t === "remote")) {
          return { ...iv, kind: "remote", label: "دورکاری مشترک" };
        }
        return null;
      })
      .filter(Boolean);
  }

  function mergeAdjacent(intervals) {
    if (!intervals.length) return [];
    const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
    const out = [{ ...sorted[0] }];
    for (let i = 1; i < sorted.length; i++) {
      const last = out[out.length - 1];
      const cur = sorted[i];
      if (cur.start <= last.end && cur.kind === last.kind) {
        last.end = Math.max(last.end, cur.end);
      } else {
        out.push({ ...cur });
      }
    }
    return out;
  }

  function computeOverlaps() {
    const selected = activePeople().filter((p) => state.overlapIds.has(p.id));
    if (selected.length < 2) return null;

    const byDay = {};
    let total = 0;

    for (const day of DAYS) {
      const lists = selected.map((person) =>
        (person.schedule[day.key] || []).map((s) => ({
          start: toMinutes(s.start),
          end: toMinutes(s.end),
          type: s.type,
        }))
      );

      if (lists.some((l) => !l.length)) {
        byDay[day.key] = [];
        continue;
      }

      let intervals = intersectIntervals(lists);
      intervals = filterByMode(intervals, state.overlapMode);
      intervals = mergeAdjacent(intervals);
      byDay[day.key] = intervals;
      total += intervals.length;
    }

    return { selected, byDay, total };
  }

  function renderTeamCapacity() {
    if (!el.teamCapacity) return;
    const teamId = state.activeTeamId;
    const hours = formatHoursTotal(teamId ? teamCapacityMinutes(teamId) : 0);
    el.teamCapacity.innerHTML = `ظرفیت تیم: <strong><bdi>${hours}</bdi></strong> در هفته`;
  }

  function renderPeopleList() {
    const people = activePeople();
    el.peopleList.innerHTML = "";
    el.peopleEmpty.classList.toggle("hidden", people.length > 0);
    renderTeamCapacity();
    if (!people.length) {
      el.peopleEmpty.textContent = state.teams.length
        ? "در این تیم هنوز کسی نیست. فرد جدید بسازید یا عضو موجود اضافه کنید."
        : "ابتدا از «مدیریت تیم‌ها» یک تیم بسازید.";
    }

    for (const person of people) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `person-item${person.id === state.selectedId ? " active" : ""}`;
      const multi = person.teamIds.length > 1
        ? `<span class="multi-team-hint">${toFaDigits(person.teamIds.length)} تیم</span>`
        : "";
      const hours = formatHoursTotal(totalScheduleMinutes(person));
      btn.innerHTML = `
        <span class="dot" style="background:${person.color}"></span>
        <span class="meta">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${hours} در هفته · ${toFaDigits(countSlots(person))} بازه${multi ? " · " : ""}${multi}</span>
        </span>
      `;
      btn.addEventListener("click", () => {
        state.selectedId = person.id;
        render();
      });
      li.appendChild(btn);
      el.peopleList.appendChild(li);
    }
  }

  function renderPersonTeams() {
    const person = getSelectedPerson();
    if (!person || !el.personTeams) return;
    el.personTeams.innerHTML = "";
    for (const team of state.teams) {
      const label = document.createElement("label");
      const checked = person.teamIds.includes(team.id);
      label.className = `team-check${checked ? " on" : ""}`;
      label.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""} />
        <span>${escapeHtml(team.name)}</span>
      `;
      const checkbox = label.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (!setPersonTeamMembership(person, team.id, checkbox.checked)) {
          checkbox.checked = true;
          return;
        }
        syncSelectionToActiveTeam();
        persist();
        render();
      });
      el.personTeams.appendChild(label);
    }
  }

  function renderScheduleEditor() {
    const person = getSelectedPerson();
    if (!person) {
      el.scheduleEmpty.classList.remove("hidden");
      el.scheduleEditor.classList.add("hidden");
      return;
    }
    el.scheduleEmpty.classList.add("hidden");
    el.scheduleEditor.classList.remove("hidden");
    el.personName.value = person.name;
    el.personColor.value = person.color;
    el.editorSwatch.style.background = person.color;
    if (el.personHours) {
      const total = formatHoursTotal(totalScheduleMinutes(person));
      const office = formatHoursTotal(totalScheduleMinutes(person, "office"));
      const remote = formatHoursTotal(totalScheduleMinutes(person, "remote"));
      el.personHours.innerHTML = `
        <span>مجموع: <strong><bdi>${total}</bdi></strong></span>
        <span class="hours-split office">حضوری: <strong><bdi>${office}</bdi></strong></span>
        <span class="hours-split remote">دورکاری: <strong><bdi>${remote}</bdi></strong></span>
      `;
    }
    renderPersonTeams();
    renderWeekGrid();
  }

  function renderTeamSwitcher() {
    const select = el.teamSelect;
    select.innerHTML = "";
    if (!state.teams.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "تیمی نیست";
      select.appendChild(opt);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    for (const team of state.teams) {
      const opt = document.createElement("option");
      opt.value = team.id;
      const count = peopleInTeam(team.id).length;
      opt.textContent = `${team.name} (${toFaDigits(count)})`;
      if (team.id === state.activeTeamId) opt.selected = true;
      select.appendChild(opt);
    }
  }

  function renderTeamsList() {
    el.teamsList.innerHTML = "";
    if (!state.teams.length) {
      el.teamsList.innerHTML = `<li class="empty-hint">هنوز تیمی نیست.</li>`;
      return;
    }
    for (const team of state.teams) {
      const li = document.createElement("li");
      li.className = `team-row${team.id === state.activeTeamId ? " active" : ""}`;
      const count = peopleInTeam(team.id).length;
      li.innerHTML = `
        <input type="text" class="input team-name-input" value="${escapeHtml(team.name)}" maxlength="40" aria-label="نام تیم" />
        <span class="team-count">${toFaDigits(count)} نفر</span>
        <button type="button" class="btn ghost compact team-activate">فعال</button>
        <button type="button" class="btn danger ghost compact team-delete">حذف</button>
      `;
      const nameInput = li.querySelector(".team-name-input");
      nameInput.addEventListener("change", () => {
        renameTeam(team.id, nameInput.value);
        persist();
        renderTeamSwitcher();
        renderTeamsList();
      });
      li.querySelector(".team-activate").addEventListener("click", () => {
        switchTeam(team.id);
        renderTeamsList();
      });
      li.querySelector(".team-delete").addEventListener("click", () => deleteTeam(team.id));
      el.teamsList.appendChild(li);
    }
  }

  function openTeamsModal() {
    renderTeamsList();
    el.teamNewName.value = "";
    el.teamsModal.showModal();
    el.teamNewName.focus();
  }

  function renderExistingList() {
    const candidates = state.people.filter((p) => !p.teamIds.includes(state.activeTeamId));
    if (!candidates.length) {
      el.existingList.innerHTML = `<p class="empty-hint">همهٔ افراد همین الان در این تیم هستند، یا فرد دیگری وجود ندارد.</p>`;
      return;
    }
    el.existingList.innerHTML = "";
    for (const person of candidates) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "existing-item";
      const teamNames = person.teamIds
        .map((id) => state.teams.find((t) => t.id === id)?.name)
        .filter(Boolean)
        .join("، ");
      row.innerHTML = `
        <span class="dot" style="background:${person.color}"></span>
        <span class="meta">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${teamNames ? `عضو: ${escapeHtml(teamNames)}` : "بدون تیم"}</span>
        </span>
        <span class="add-label">افزودن</span>
      `;
      row.addEventListener("click", () => addExistingToActiveTeam(person.id));
      el.existingList.appendChild(row);
    }
  }

  function openExistingModal() {
    if (!ensureActiveTeam()) return;
    renderExistingList();
    el.existingModal.showModal();
  }

  function renderWeekGrid() {
    const person = getSelectedPerson();
    if (!person) return;
    el.weekGrid.innerHTML = "";

    for (const day of DAYS) {
      const row = document.createElement("div");
      row.className = "day-row";

      const name = document.createElement("div");
      name.className = "day-name";
      name.textContent = day.label;

      const slotsWrap = document.createElement("div");
      slotsWrap.className = "slots";
      const slots = person.schedule[day.key];

      if (!slots.length) {
        const empty = document.createElement("span");
        empty.className = "no-slots";
        empty.textContent = "بدون برنامه";
        slotsWrap.appendChild(empty);
      } else {
        slots.forEach((slot, index) => {
          const chip = document.createElement("div");
          chip.className = `slot ${slot.type}`;
          chip.setAttribute("role", "button");
          chip.tabIndex = 0;
          chip.title = "برای ویرایش کلیک کنید";

          const label = document.createElement("span");
          label.textContent = formatRange(slot.start, slot.end);

          const badge = document.createElement("span");
          badge.className = "type-badge";
          badge.textContent = typeLabel(slot.type);

          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "remove";
          remove.title = "حذف بازه";
          remove.setAttribute("aria-label", "حذف بازه");
          remove.textContent = "×";
          remove.addEventListener("click", (e) => {
            e.stopPropagation();
            removeSlot(day.key, index);
          });

          chip.append(label, badge, remove);
          chip.addEventListener("click", () => openSlotModal(day.key, index));
          chip.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openSlotModal(day.key, index);
            }
          });
          slotsWrap.appendChild(chip);
        });
      }

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn ghost compact add-slot";
      addBtn.textContent = "+ بازه";
      addBtn.addEventListener("click", () => openSlotModal(day.key, null));

      row.append(name, slotsWrap, addBtn);
      el.weekGrid.appendChild(row);
    }
  }

  function renderOverlapPicker() {
    const people = activePeople();
    el.overlapPeople.innerHTML = "";
    if (!people.length) {
      el.overlapPeople.innerHTML =
        '<p class="empty-hint">ابتدا در بخش افراد، اعضای این تیم را بسازید.</p>';
      return;
    }

    for (const person of people) {
      const label = document.createElement("label");
      label.className = `pick-person${state.overlapIds.has(person.id) ? " selected" : ""}`;
      label.innerHTML = `
        <input type="checkbox" ${state.overlapIds.has(person.id) ? "checked" : ""} />
        <span class="dot" style="width:.75rem;height:.75rem;border-radius:50%;background:${person.color};display:inline-block;flex-shrink:0"></span>
        <span>${escapeHtml(person.name)}</span>
      `;
      const checkbox = label.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.overlapIds.add(person.id);
        else state.overlapIds.delete(person.id);
        renderOverlapPicker();
        renderOverlapResults();
      });
      el.overlapPeople.appendChild(label);
    }
  }

  function renderBoardFilters() {
    const todayKey = dayKeyFromDate();
    const items = [{ key: "all", label: "همه روزها" }, ...DAYS.map((d) => ({
      key: d.key,
      label: d.key === todayKey ? `${d.label} (امروز)` : d.label,
    }))];

    el.boardDayFilters.innerHTML = "";
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `chip${state.boardDayFilter === item.key ? " active" : ""}`;
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        state.boardDayFilter = item.key;
        renderBoardFilters();
        renderTeamBoard();
      });
      el.boardDayFilters.appendChild(btn);
    }
  }

  function renderTeamBoard() {
    const people = activePeople();
    if (!people.length) {
      el.teamBoard.innerHTML = `
        <div class="empty-state compact">
          <h3>عضوی در این تیم نیست</h3>
          <p>اول افراد و برنامه‌شان را در بخش افراد بسازید.</p>
        </div>
      `;
      return;
    }

    const todayKey = dayKeyFromDate();
    const now = new Date();
    const mins = nowMinutes(now);
    const days =
      state.boardDayFilter === "all"
        ? DAYS
        : DAYS.filter((d) => d.key === state.boardDayFilter);

    const hourMarks = [6, 9, 12, 15, 18, 21];
    let html = "";

    for (const day of days) {
      const isToday = day.key === todayKey;
      html += `<article class="board-day${isToday ? " today" : ""}">`;
      html += `<div class="board-day-title"><span>${day.label}</span>`;
      if (isToday) html += `<span class="today-badge">امروز</span>`;
      html += `</div>`;

      html += `<div class="board-axis" aria-hidden="true">`;
      for (const h of hourMarks) {
        const right = ((h * 60 - BOARD_START) / BOARD_SPAN) * 100;
        html += `<span style="right:${right}%">${toFaDigits(String(h).padStart(2, "0"))}</span>`;
      }
      html += `</div>`;

      const anySlots = people.some((p) => (p.schedule[day.key] || []).length);
      if (!anySlots) {
        html += `<p class="board-empty-day">برای این روز بازه‌ای ثبت نشده</p>`;
      }

      for (const person of people) {
        const slots = person.schedule[day.key] || [];
        html += `<div class="board-row">`;
        html += `<div class="board-person"><span class="dot" style="background:${person.color}"></span><span>${escapeHtml(person.name)}</span></div>`;
        html += `<div class="board-track">`;
        for (const slot of slots) {
          const start = Math.max(toMinutes(slot.start), BOARD_START);
          const end = Math.min(toMinutes(slot.end), BOARD_END);
          if (end <= start) continue;
          const right = ((start - BOARD_START) / BOARD_SPAN) * 100;
          const width = ((end - start) / BOARD_SPAN) * 100;
          html += `<div class="board-bar ${slot.type}" style="right:${right}%;width:${width}%" title="${formatRange(slot.start, slot.end)} — ${typeLabel(slot.type)}">${toFaDigits(slot.start)}–${toFaDigits(slot.end)}</div>`;
        }
        if (isToday && mins >= BOARD_START && mins <= BOARD_END) {
          const right = ((mins - BOARD_START) / BOARD_SPAN) * 100;
          html += `<div class="board-now-line" style="right:${right}%" title="الان"></div>`;
        }
        html += `</div></div>`;
      }
      html += `</article>`;
    }

    el.teamBoard.innerHTML = html;
  }

  function renderNowModal() {
    const now = new Date();
    el.nowClock.textContent = formatClock(now);
    const working = getCurrentlyWorking(now);

    if (!activePeople().length) {
      el.nowList.innerHTML = `<div class="now-empty">در این تیم هنوز فردی تعریف نشده است.</div>`;
      return;
    }

    if (!working.length) {
      el.nowList.innerHTML = `<div class="now-empty">الان کسی طبق برنامه مشغول کار نیست.</div>`;
      return;
    }

    el.nowList.innerHTML = working
      .map(
        (item) => `
      <div class="now-item">
        <span class="dot" style="background:${item.person.color}"></span>
        <div class="meta">
          <strong title="${escapeHtml(item.person.name)}">${escapeHtml(item.person.name)}</strong>
          <span>${typeLabel(item.slot.type)} · از <bdi>${toFaDigits(item.slot.start)}</bdi></span>
        </div>
        <div class="until">
          <span class="until-time">تا ${toFaDigits(item.until)}</span>
          <span class="until-left">${formatRemaining(item.remaining)}</span>
        </div>
      </div>
    `
      )
      .join("");
  }

  function openNowModal() {
    renderNowModal();
    el.nowModal.showModal();
  }

  function slotCoversTime(slot, mins, mode) {
    const start = toMinutes(slot.start);
    const end = toMinutes(slot.end);
    if (!(mins >= start && mins < end)) return false;
    if (mode === "office" || mode === "remote") return slot.type === mode;
    return true;
  }

  function findPeopleAtTime(dayKey, mins, mode) {
    const list = [];
    for (const person of activePeople()) {
      for (const slot of person.schedule[dayKey] || []) {
        if (slotCoversTime(slot, mins, mode)) {
          list.push({ person, slot });
          break;
        }
      }
    }
    list.sort((a, b) => a.person.name.localeCompare(b.person.name, "fa"));
    return list;
  }

  function peopleOnAllLookupDays(byDay) {
    const days = [...state.lookupDays];
    if (days.length < 2) return [];
    const counts = new Map();
    for (const dayKey of days) {
      for (const item of byDay[dayKey] || []) {
        counts.set(item.person.id, (counts.get(item.person.id) || 0) + 1);
      }
    }
    return activePeople().filter((p) => counts.get(p.id) === days.length);
  }

  function renderLookupDayChips() {
    el.lookupDays.innerHTML = "";
    for (const day of DAYS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `chip${state.lookupDays.has(day.key) ? " active" : ""}`;
      btn.dataset.day = day.key;
      btn.textContent = day.label;
      btn.addEventListener("click", () => {
        if (state.lookupDays.has(day.key)) state.lookupDays.delete(day.key);
        else state.lookupDays.add(day.key);
        renderLookupDayChips();
        renderLookupResults();
      });
      el.lookupDays.appendChild(btn);
    }
  }

  function renderLookupPersonRow(item) {
    return `
      <div class="now-item lookup-person">
        <span class="dot" style="background:${item.person.color}"></span>
        <div class="meta">
          <strong title="${escapeHtml(item.person.name)}">${escapeHtml(item.person.name)}</strong>
          <span>${typeLabel(item.slot.type)} · ${formatRange(item.slot.start, item.slot.end)}</span>
        </div>
        <div class="until">
          <span class="until-time">تا ${toFaDigits(item.slot.end)}</span>
        </div>
      </div>
    `;
  }

  function renderLookupResults() {
    if (!el.lookupTime.value) {
      el.lookupResults.innerHTML = `
        <div class="empty-state compact">
          <h3>ساعت را مشخص کنید</h3>
          <p>یک ساعت برای جستجو وارد کنید.</p>
        </div>
      `;
      return;
    }

    state.lookupTime = el.lookupTime.value;
    const mins = toMinutes(state.lookupTime);
    const selectedDays = DAYS.filter((d) => state.lookupDays.has(d.key));

    if (!selectedDays.length) {
      el.lookupResults.innerHTML = `
        <div class="empty-state compact">
          <h3>نتیجه‌ای نیست</h3>
          <p>حداقل یک روز را انتخاب کنید.</p>
        </div>
      `;
      return;
    }

    if (!activePeople().length) {
      el.lookupResults.innerHTML = `
        <div class="empty-state compact">
          <h3>فردی در این تیم نیست</h3>
          <p>ابتدا از بخش افراد، اعضای این تیم را اضافه کنید.</p>
        </div>
      `;
      return;
    }

    const byDay = {};
    let totalHits = 0;
    for (const day of selectedDays) {
      byDay[day.key] = findPeopleAtTime(day.key, mins, state.lookupMode);
      totalHits += byDay[day.key].length;
    }

    const allDaysPeople = peopleOnAllLookupDays(byDay);
    const timeLabel = toFaDigits(state.lookupTime);

    let html = `
      <div class="summary-bar">
        <span>ساعت <bdi>${timeLabel}</bdi></span>
        <span>${toFaDigits(selectedDays.length)} روز · ${toFaDigits(totalHits)} مورد</span>
      </div>
    `;

    if (selectedDays.length > 1 && allDaysPeople.length) {
      html += `
        <div class="lookup-all-days">
          <h3>در همهٔ روزهای انتخاب‌شده</h3>
          <div class="lookup-all-chips">
            ${allDaysPeople
              .map(
                (p) => `
              <span class="lookup-name-chip">
                <span class="dot" style="background:${p.color}"></span>
                ${escapeHtml(p.name)}
              </span>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    if (totalHits === 0) {
      html += `
        <div class="empty-state compact">
          <h3>کسی پیدا نشد</h3>
          <p>در ساعت <bdi>${timeLabel}</bdi> و روزهای انتخاب‌شده کسی طبق برنامه مشغول نیست.</p>
        </div>
      `;
      el.lookupResults.innerHTML = html;
      return;
    }

    for (const day of selectedDays) {
      const list = byDay[day.key];
      html += `<article class="day-result"><h3>${day.label}</h3>`;
      if (!list.length) {
        html += `<p class="no-overlap-day">کسی در این ساعت نیست</p>`;
      } else {
        html += `<div class="lookup-day-list">${list.map(renderLookupPersonRow).join("")}</div>`;
      }
      html += `</article>`;
    }

    el.lookupResults.innerHTML = html;
  }

  function renderOverlapResults() {
    const result = computeOverlaps();
    if (!result) {
      el.overlapResults.innerHTML = `
        <div class="empty-state compact">
          <h3>نتیجه‌ای نیست</h3>
          <p>حداقل دو نفر را انتخاب کنید.</p>
        </div>
      `;
      return;
    }

    const names = result.selected.map((p) => p.name).join("، ");
    let html = `
      <div class="summary-bar">
        <span>${toFaDigits(result.selected.length)} نفر: ${escapeHtml(names)}</span>
        <span>${toFaDigits(result.total)} بازه مشترک در هفته</span>
      </div>
    `;

    if (result.total === 0) {
      html += `
        <div class="empty-state compact">
          <h3>بازه مشترکی پیدا نشد</h3>
          <p>برنامه این افراد روی هم نمی‌افتد یا فیلتر نوع حضور مانع شده است.</p>
        </div>
      `;
      el.overlapResults.innerHTML = html;
      return;
    }

    for (const day of DAYS) {
      const intervals = result.byDay[day.key];
      html += `<article class="day-result"><h3>${day.label}</h3>`;
      if (!intervals.length) {
        html += `<p class="no-overlap-day">بدون تقاطع</p>`;
      } else {
        html += `<div class="result-slots">`;
        for (const iv of intervals) {
          const kindClass = iv.kind === "any" ? "mixed" : iv.kind;
          html += `
            <div class="result-slot ${kindClass}">
              <span class="time">${formatRange(fromMinutes(iv.start), fromMinutes(iv.end))}</span>
              <span class="kind">${iv.label}</span>
            </div>
          `;
        }
        html += `</div>`;
      }
      html += `</article>`;
    }

    el.overlapResults.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barnamino-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("فایل JSON ذخیره شد");
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillRoundRect(ctx, x, y, w, h, r, fill) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function measureBoardExportHeight(people, days) {
    const pad = 48;
    const header = 88;
    const legend = 36;
    const footer = 28;
    const dayTitle = 36;
    const axis = 28;
    const row = 44;
    const dayPad = 28;
    const dayGap = 20;
    let h = pad + header + legend;
    for (const day of days) {
      const anySlots = people.some((p) => (p.schedule[day.key] || []).length);
      const body = anySlots ? people.length * row : 40;
      h += dayPad * 2 + dayTitle + axis + body + dayGap;
    }
    return h + footer + pad;
  }

  async function exportBoardImage() {
    const people = activePeople();
    if (!people.length) {
      showToast("اول افراد تیم را بسازید");
      return;
    }

    const btn = document.getElementById("btn-export-board");
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "در حال ساخت…";
    }

    try {
      await document.fonts.ready;

      const days =
        state.boardDayFilter === "all"
          ? DAYS
          : DAYS.filter((d) => d.key === state.boardDayFilter);
      const team = getActiveTeam();
      const teamName = team?.name || "تیم";
      const title = `برنامه تیم ${teamName}`;

      const width = 1400;
      const pad = 48;
      const height = measureBoardExportHeight(people, days);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.direction = "rtl";
      ctx.textBaseline = "middle";
      ctx.font = "700 16px Vazirmatn, Tahoma, sans-serif";

      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "#d7ebe3");
      bg.addColorStop(0.45, "#eef6f2");
      bg.addColorStop(1, "#f7fbf9");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "rgba(15, 118, 110, 0.08)";
      ctx.beginPath();
      ctx.ellipse(180, 80, 220, 120, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(15, 118, 110, 0.05)";
      ctx.beginPath();
      ctx.ellipse(width - 160, 140, 200, 110, 0, 0, Math.PI * 2);
      ctx.fill();

      fillRoundRect(ctx, pad, pad, width - pad * 2, height - pad * 2, 28, "rgba(255,255,255,0.82)");

      const contentX = pad + 36;
      const contentW = width - pad * 2 - 72;
      let y = pad + 48;

      ctx.fillStyle = "#0f1c1a";
      ctx.font = "800 28px Vazirmatn, Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, width / 2, y);

      y += 52;

      const legendItems = [
        { label: "حضوری", color: "#0f766e" },
        { label: "دورکاری", color: "#d97706" },
      ];
      let legendX = contentX + contentW;
      ctx.font = "700 13px Vazirmatn, Tahoma, sans-serif";
      ctx.textAlign = "right";
      for (const item of legendItems) {
        const labelW = ctx.measureText(item.label).width;
        fillRoundRect(ctx, legendX - 14, y - 7, 14, 14, 4, item.color);
        ctx.fillStyle = "#6b807a";
        ctx.fillText(item.label, legendX - 22, y);
        legendX -= labelW + 48;
      }

      y += 36;

      const personCol = 230;
      const trackGap = 14;
      const hourMarks = [6, 9, 12, 15, 18, 21];
      const maxNameChars = 22;

      for (const day of days) {
        const anySlots = people.some((p) => (p.schedule[day.key] || []).length);
        const rowsH = anySlots ? people.length * 44 : 40;
        const cardH = 28 + 36 + 28 + rowsH + 28;
        const cardX = contentX;
        const cardY = y;

        fillRoundRect(ctx, cardX, cardY, contentW, cardH, 18, "rgba(243, 247, 245, 0.92)");

        let cy = cardY + 28;
        ctx.fillStyle = "#0f1c1a";
        ctx.font = "800 18px Vazirmatn, Tahoma, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(day.label, cardX + contentW - 22, cy);

        cy += 34;
        const trackX = cardX + 22;
        const trackW = contentW - 44 - personCol - trackGap;
        const trackRight = trackX + trackW;

        ctx.fillStyle = "#6b807a";
        ctx.font = "600 12px Vazirmatn, Tahoma, sans-serif";
        ctx.textAlign = "center";
        for (const h of hourMarks) {
          const right = ((h * 60 - BOARD_START) / BOARD_SPAN) * trackW;
          const hx = trackRight - right;
          ctx.fillText(toFaDigits(String(h).padStart(2, "0")), hx, cy);
        }

        cy += 22;

        if (!anySlots) {
          ctx.fillStyle = "#6b807a";
          ctx.font = "600 14px Vazirmatn, Tahoma, sans-serif";
          ctx.textAlign = "right";
          ctx.fillText("برای این روز بازه‌ای ثبت نشده", cardX + contentW - 22, cy + 10);
        } else {
          for (const person of people) {
            const slots = person.schedule[day.key] || [];
            const nameX = cardX + contentW - 22;
            const trackY = cy;

            ctx.beginPath();
            ctx.fillStyle = person.color || "#0f766e";
            ctx.arc(nameX - 5, trackY + 14, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#0f1c1a";
            ctx.font = "700 14px Vazirmatn, Tahoma, sans-serif";
            ctx.textAlign = "right";
            const name =
              person.name.length > maxNameChars
                ? `${person.name.slice(0, maxNameChars - 1)}…`
                : person.name;
            ctx.fillText(name, nameX - 16, trackY + 14);

            fillRoundRect(ctx, trackX, trackY, trackW, 28, 10, "rgba(255,255,255,0.78)");
            ctx.strokeStyle = "rgba(15, 28, 26, 0.06)";
            ctx.lineWidth = 1;
            roundRectPath(ctx, trackX, trackY, trackW, 28, 10);
            ctx.stroke();

            ctx.strokeStyle = "rgba(15, 28, 26, 0.05)";
            for (let i = 1; i < 16; i++) {
              const gx = trackRight - (i / 16) * trackW;
              ctx.beginPath();
              ctx.moveTo(gx, trackY + 2);
              ctx.lineTo(gx, trackY + 26);
              ctx.stroke();
            }

            for (const slot of slots) {
              const start = Math.max(toMinutes(slot.start), BOARD_START);
              const end = Math.min(toMinutes(slot.end), BOARD_END);
              if (end <= start) continue;
              const rightRatio = (start - BOARD_START) / BOARD_SPAN;
              const widthRatio = (end - start) / BOARD_SPAN;
              const barW = Math.max(widthRatio * trackW, 4);
              const barX = trackRight - rightRatio * trackW - barW;
              const grad = ctx.createLinearGradient(barX, trackY, barX + barW, trackY + 28);
              if (slot.type === "remote") {
                grad.addColorStop(0, "#d97706");
                grad.addColorStop(1, "#92400e");
              } else {
                grad.addColorStop(0, "#0f766e");
                grad.addColorStop(1, "#0a4f4a");
              }
              fillRoundRect(ctx, barX, trackY + 4, barW, 20, 7, grad);

              if (barW > 58) {
                ctx.fillStyle = "#fff";
                ctx.font = "700 11px Vazirmatn, Tahoma, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(
                  `${toFaDigits(slot.start)}–${toFaDigits(slot.end)}`,
                  barX + barW / 2,
                  trackY + 14
                );
              }
            }

            cy += 44;
          }
        }

        y += cardH + 20;
      }

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/png");
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTeam = teamName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "team";
      a.href = url;
      a.download = `barnamino-board-${safeTeam}-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("تصویر برنامه ذخیره شد");
    } catch {
      showToast("ساخت تصویر ممکن نشد");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevLabel || "ذخیره تصویر";
      }
    }
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.people)) {
          throw new Error("ساختار نامعتبر");
        }
        applyData(data);
        state.overlapIds = new Set();
        if (!state.fileHandle) {
          await grantFileAccess();
        }
        await persist();
        render();
        const n = activePeople().length;
        showToast(
          state.fileHandle
            ? `${toFaDigits(n)} نفر در تیم فعال · ذخیره شد`
            : `${toFaDigits(state.people.length)} نفر وارد شد`
        );
      } catch {
        showToast("فایل JSON معتبر نیست");
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      const active = panel.id === `panel-${tab}`;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
    if (tab === "overlap") {
      renderOverlapPicker();
      renderOverlapResults();
    }
    if (tab === "board") {
      renderBoardFilters();
      renderTeamBoard();
    }
    if (tab === "lookup") {
      renderLookupDayChips();
      renderLookupResults();
    }
  }

  function render() {
    syncSelectionToActiveTeam();
    renderTeamSwitcher();
    renderPeopleList();
    renderScheduleEditor();
    renderOverlapPicker();
    renderOverlapResults();
    renderBoardFilters();
    renderTeamBoard();
    renderLookupDayChips();
    renderLookupResults();
  }

  function bindEvents() {
    document.getElementById("btn-add-person").addEventListener("click", addPerson);
    document.getElementById("btn-add-existing").addEventListener("click", openExistingModal);
    document.getElementById("btn-delete-person").addEventListener("click", deleteSelectedPerson);
    document.getElementById("btn-export").addEventListener("click", exportJson);
    document.getElementById("btn-export-board").addEventListener("click", exportBoardImage);
    document.getElementById("btn-who-now").addEventListener("click", openNowModal);
    document.getElementById("now-close").addEventListener("click", () => el.nowModal.close());
    document.getElementById("now-refresh").addEventListener("click", renderNowModal);
    document.getElementById("btn-manage-teams").addEventListener("click", openTeamsModal);
    document.getElementById("teams-close").addEventListener("click", () => el.teamsModal.close());
    document.getElementById("existing-close").addEventListener("click", () => el.existingModal.close());
    el.teamSelect.addEventListener("change", () => {
      if (el.teamSelect.value) switchTeam(el.teamSelect.value);
    });
    document.getElementById("team-create-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const team = addTeam(el.teamNewName.value);
      if (!team) return;
      el.teamNewName.value = "";
      persist();
      render();
      renderTeamsList();
      showToast(`تیم «${team.name}» ساخته شد`);
    });
    el.btnFileAccess.addEventListener("click", () => grantFileAccess());
    document.getElementById("btn-import").addEventListener("click", () => el.importFile.click());
    el.importFile.addEventListener("change", () => {
      const file = el.importFile.files?.[0];
      if (file) importJson(file);
      el.importFile.value = "";
    });

    el.personName.addEventListener("input", updateSelectedMeta);
    el.personColor.addEventListener("input", updateSelectedMeta);

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll("#panel-overlap .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("#panel-overlap .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.overlapMode = chip.dataset.mode;
        el.filterHint.textContent = FILTER_HINTS[state.overlapMode];
        renderOverlapResults();
      });
    });

    el.lookupTime.addEventListener("input", () => {
      state.lookupTime = el.lookupTime.value || "10:00";
      renderLookupResults();
    });

    document.querySelectorAll("#lookup-mode .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("#lookup-mode .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.lookupMode = chip.dataset.mode;
        renderLookupResults();
      });
    });

    document.getElementById("lookup-days-all").addEventListener("click", () => {
      state.lookupDays = new Set(DAYS.map((d) => d.key));
      renderLookupDayChips();
      renderLookupResults();
    });

    document.getElementById("lookup-days-none").addEventListener("click", () => {
      state.lookupDays = new Set();
      renderLookupDayChips();
      renderLookupResults();
    });

    document.getElementById("slot-cancel").addEventListener("click", () => {
      el.slotModal.close();
    });
    el.slotForm.addEventListener("submit", saveSlot);
  }

  async function boot() {
    bindEvents();
    if (!state.lookupDays.size) {
      state.lookupDays.add(dayKeyFromDate());
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    state.lookupTime = `${hh}:${mm}`;
    el.lookupTime.value = state.lookupTime;
    updateAccessUi();
    await bootLoad();
    render();
    updateAccessUi();
  }

  boot();
})();
