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

  function getCurrentlyWorking(date = new Date()) {
    const dayKey = dayKeyFromDate(date);
    const mins = nowMinutes(date);
    const list = [];
    for (const person of state.people) {
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
      version: 1,
      app: "barnamino",
      exportedAt: new Date().toISOString(),
      people: state.people,
    };
  }

  function applyPeople(people) {
    state.people = (people || []).map(normalizePerson);
    if (!state.people.some((p) => p.id === state.selectedId)) {
      state.selectedId = state.people[0]?.id || null;
    }
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
      applyPeople(data.people);
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
    if (!text.trim()) return { people: [] };
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
    applyPeople(data.people);
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
          applyPeople(fileData.people);
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
        applyPeople(data.people);
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

    if (!loadFromLocalStorage()) applyPeople([]);
  }

  function normalizePerson(p) {
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
    return {
      id: p.id || uid(),
      name: (p.name || "بدون نام").trim() || "بدون نام",
      color: p.color || COLORS[0],
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
    return state.people.find((p) => p.id === state.selectedId) || null;
  }

  function addPerson() {
    const color = COLORS[state.people.length % COLORS.length];
    const person = {
      id: uid(),
      name: `فرد ${toFaDigits(state.people.length + 1)}`,
      color,
      schedule: emptySchedule(),
    };
    state.people.push(person);
    state.selectedId = person.id;
    persist();
    render();
    el.personName.focus();
    el.personName.select();
  }

  function deleteSelectedPerson() {
    const person = getSelectedPerson();
    if (!person) return;
    if (!confirm(`«${person.name}» حذف شود؟`)) return;
    state.people = state.people.filter((p) => p.id !== person.id);
    state.overlapIds.delete(person.id);
    state.selectedId = state.people[0]?.id || null;
    persist();
    render();
    showToast("فرد حذف شد");
  }

  function updateSelectedMeta() {
    const person = getSelectedPerson();
    if (!person) return;
    person.name = el.personName.value.trim() || "بدون نام";
    person.color = el.personColor.value;
    persist();
    renderPeopleList();
    renderOverlapPicker();
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
    const selected = state.people.filter((p) => state.overlapIds.has(p.id));
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

  function renderPeopleList() {
    el.peopleList.innerHTML = "";
    el.peopleEmpty.classList.toggle("hidden", state.people.length > 0);

    for (const person of state.people) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `person-item${person.id === state.selectedId ? " active" : ""}`;
      btn.innerHTML = `
        <span class="dot" style="background:${person.color}"></span>
        <span class="meta">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${toFaDigits(countSlots(person))} بازه در هفته</span>
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
    renderWeekGrid();
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
    el.overlapPeople.innerHTML = "";
    if (!state.people.length) {
      el.overlapPeople.innerHTML =
        '<p class="empty-hint">ابتدا در بخش افراد، اعضای تیم را بسازید.</p>';
      return;
    }

    for (const person of state.people) {
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
    if (!state.people.length) {
      el.teamBoard.innerHTML = `
        <div class="empty-state compact">
          <h3>هنوز تیمی نیست</h3>
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

      const anySlots = state.people.some((p) => (p.schedule[day.key] || []).length);
      if (!anySlots) {
        html += `<p class="board-empty-day">برای این روز بازه‌ای ثبت نشده</p>`;
      }

      for (const person of state.people) {
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

    if (!state.people.length) {
      el.nowList.innerHTML = `<div class="now-empty">هنوز فردی تعریف نشده است.</div>`;
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
    for (const person of state.people) {
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
    return state.people.filter((p) => counts.get(p.id) === days.length);
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

    if (!state.people.length) {
      el.lookupResults.innerHTML = `
        <div class="empty-state compact">
          <h3>فردی تعریف نشده</h3>
          <p>ابتدا از بخش افراد، اعضای تیم را اضافه کنید.</p>
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

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.people)) {
          throw new Error("ساختار نامعتبر");
        }
        applyPeople(data.people);
        state.overlapIds = new Set();
        if (!state.fileHandle) {
          await grantFileAccess();
        }
        await persist();
        render();
        showToast(
          state.fileHandle
            ? `${toFaDigits(state.people.length)} نفر وارد و در data.json ذخیره شد`
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
    if (!state.selectedId && state.people.length) {
      state.selectedId = state.people[0].id;
    }
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
    document.getElementById("btn-delete-person").addEventListener("click", deleteSelectedPerson);
    document.getElementById("btn-export").addEventListener("click", exportJson);
    document.getElementById("btn-who-now").addEventListener("click", openNowModal);
    document.getElementById("now-close").addEventListener("click", () => el.nowModal.close());
    document.getElementById("now-refresh").addEventListener("click", renderNowModal);
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
