const ribbonStorageKeys = Object.freeze({
  economy: "ribbon-atelier.economy.v1",
  look: "ribbon-atelier.phase1.v1",
  looks: "ribbon-atelier.looks.v1",
  english: "english-word-notebook-v1",
  legacyEnglish: "english-dictation-v1",
});

const ribbonRestoreKey = "ribbon-atelier.restore.v1";
const ribbonBackupType = "ribbon-atelier-backup";
const ribbonBackupVersion = 1;

function validateRibbonBackup(backup) {
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const text = value => typeof value === "string" && Boolean(value.trim());
  const day = value => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
  };
  const timestamp = value => Number.isSafeInteger(value) && value >= 0;
  const reward = value => Number.isSafeInteger(value) && value >= 1 && value <= 999;
  const list = (value, validate) => Array.isArray(value) && value.every(validate);
  const unique = (value, validate) => list(value, validate) && new Set(value.map(item => item.id)).size === value.length;
  const look = value => object(value) && Object.values(value).every(text);

  if (!object(backup) || backup.format !== ribbonBackupType || backup.version !== ribbonBackupVersion || !object(backup.data)) {
    throw new Error("Invalid backup format");
  }
  const data = {};
  for (const name of Object.keys(ribbonStorageKeys)) {
    if (!Object.prototype.hasOwnProperty.call(backup.data, name)) throw new Error("Incomplete backup");
    data[name] = backup.data[name];
  }
  const validTask = task => object(task) && text(task.id) && text(task.title) && day(task.day)
    && reward(task.reward) && typeof task.done === "boolean"
    && (task.deletedAt === undefined || timestamp(task.deletedAt))
    && (task.favoriteId === undefined || text(task.favoriteId));
  const validFavorite = task => object(task) && text(task.id) && text(task.title) && reward(task.reward);
  if (data.economy !== null) {
    const { tasks, ledger, favorites } = data.economy;
    const validTransaction = ([id, entry]) => /^(task:|purchase:|english:|english-first:).+/.test(id)
      && object(entry) && timestamp(entry.at) && Number.isSafeInteger(entry.amount)
      && (id.startsWith("purchase:") ? entry.amount < 0 : entry.amount >= 0)
      && (entry.day === undefined || day(entry.day));
    if (!unique(tasks, validTask) || (favorites !== undefined && !unique(favorites, validFavorite))
        || !object(ledger) || !Object.entries(ledger).every(validTransaction)) throw new Error("Invalid economy");
    const balance = Object.values(ledger).reduce((sum, entry) => sum + entry.amount, 0);
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("Invalid balance");
  }
  if (data.look !== null && (!object(data.look) || !look(data.look.look) || typeof data.look.motion !== "boolean")) {
    throw new Error("Invalid wardrobe");
  }
  if (data.looks !== null && !unique(data.looks, item => object(item) && text(item.id) && text(item.title) && look(item.look))) {
    throw new Error("Invalid saved looks");
  }
  if (data.english !== null) {
    const book = data.english;
    const word = entry => object(entry) && text(entry.word) && typeof entry.meaning === "string";
    const answer = entry => object(entry) && text(entry.word) && typeof entry.entry === "string" && typeof entry.correct === "boolean";
    const record = entry => object(entry) && text(entry.id) && text(entry.date) && Number.isFinite(Date.parse(entry.date))
      && ["single", "mixed", "retry"].includes(entry.mode) && list(entry.setIds, text) && list(entry.setNames, text)
      && entry.setIds.length > 0 && entry.setIds.length === entry.setNames.length && list(entry.items, answer) && entry.items.length > 0;
    if (book.version !== 1 || !unique(book.sets, entry => object(entry) && text(entry.id) && text(entry.name) && list(entry.words, word) && entry.words.length)
        || !unique(book.history, record) || (book.shuffle !== undefined && typeof book.shuffle !== "boolean")) throw new Error("Invalid English notebook");
  }
  if (data.legacyEnglish !== null && !object(data.legacyEnglish)) throw new Error("Invalid legacy notebook");
  return { format: ribbonBackupType, version: ribbonBackupVersion, createdAt: backup.createdAt, data };
}

function readRibbonBackup() {
  const data = Object.fromEntries(Object.entries(ribbonStorageKeys).map(([name, key]) => [name, JSON.parse(localStorage.getItem(key))]));
  return validateRibbonBackup({ format: ribbonBackupType, version: ribbonBackupVersion, createdAt: new Date().toISOString(), data });
}

function writeRibbonBackup(backup) {
  const previous = Object.values(ribbonStorageKeys).map(key => [key, localStorage.getItem(key)]);
  try {
    for (const [name, key] of Object.entries(ribbonStorageKeys)) {
      const value = backup.data[name];
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    for (const [key] of previous) localStorage.removeItem(key);
    for (const [key, value] of previous) if (value !== null) localStorage.setItem(key, value);
    throw error;
  }
}

function recoverRibbonRestore() {
  try {
    const journal = localStorage.getItem(ribbonRestoreKey);
    if (!journal) return false;
    const backup = validateRibbonBackup(JSON.parse(journal));
    writeRibbonBackup(backup);
    localStorage.removeItem(ribbonRestoreKey);
    return true;
  } catch {
    return false;
  }
}

const ribbonRecoveredRestore = recoverRibbonRestore();

function configureRibbonBackup(byId, switchView) {
  const fileInput = byId("full-backup-file");
  const status = byId("backup-message");
  const load = byId("full-backup-load");
  const reset = byId("reset-input-data");

  async function replaceStoredData(makeBackup, operation) {
    const commit = () => {
      const backup = makeBackup();
      localStorage.setItem(ribbonRestoreKey, JSON.stringify(backup));
      try {
        writeRibbonBackup(backup);
      } finally {
        localStorage.removeItem(ribbonRestoreKey);
      }
    };
    if (navigator.locks?.request) {
      await navigator.locks.request(ribbonStorageKeys.economy,
        () => navigator.locks.request(ribbonStorageKeys.looks, commit));
    } else commit();
    try { sessionStorage.setItem(ribbonRestoreKey, operation); } catch {}
    location.reload();
  }

  reset.onclick = async () => {
    if (reset.disabled || load.disabled) return;
    if (!window.confirm("일정, 자주 쓰는 할 일, 영어 단어장과 시험 기록을 모두 초기화할까? 코인과 구매 내역은 유지돼.")) return;
    reset.disabled = true;
    status.textContent = "입력 데이터를 초기화하는 중이야…";
    try {
      await replaceStoredData(() => {
        const backup = readRibbonBackup();
        if (backup.data.economy) {
          backup.data.economy.tasks = [];
          backup.data.economy.favorites = [];
        }
        backup.data.english = null;
        backup.data.legacyEnglish = null;
        return backup;
      }, "reset");
    } catch {
      status.textContent = "입력 데이터를 초기화하지 못했어. 저장 상태를 확인해 줘.";
      reset.disabled = false;
    }
  };
  byId("full-backup-save").onclick = () => {
    try {
      const backup = readRibbonBackup();
      const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = "ribbon-atelier-backup-" + backup.createdAt.slice(0, 10) + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1500);
      status.textContent = "전체 백업 파일을 만들었어.";
    } catch {
      status.textContent = "전체 백업을 만들 수 없어. 브라우저의 저장 상태를 확인해 줘.";
    }
  };
  load.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file || load.disabled) return;
    load.disabled = true;
    let backup;
    try {
      backup = validateRibbonBackup(JSON.parse(await file.text()));
    } catch {
      status.textContent = "리본 아틀리에 전체 백업 JSON을 골라 줘.";
      load.disabled = false;
      return;
    }
    if (!window.confirm("이 기기의 일정, 코인, 코디, 영어 기록을 백업 내용으로 바꿀까?")) {
      load.disabled = false;
      return;
    }
    status.textContent = "전체 백업을 복원하는 중이야…";
    try {
      await replaceStoredData(() => backup, "done");
    } catch {
      status.textContent = "복원할 데이터를 저장하지 못했어. 브라우저 저장 공간을 확인해 줘.";
      load.disabled = false;
    }
  };
  let operation = ribbonRecoveredRestore ? "done" : null;
  try {
    operation = sessionStorage.getItem(ribbonRestoreKey) || operation;
    sessionStorage.removeItem(ribbonRestoreKey);
  } catch {}
  if (operation) {
    switchView("parent");
    byId("parent-backup").open = true;
    status.textContent = operation === "reset" ? "입력 데이터를 초기화했어." : "전체 백업을 복원했어.";
  }
}
