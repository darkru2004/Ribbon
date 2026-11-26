function createRibbonEconomy(items, byId, artUrl, inventoryChanged, celebrate, viewChanged) {
  "use strict";

  const key = ribbonStorageKeys.economy;
  const pinKey = "ribbon-atelier.parent-pin.v1";
  const saleItems = items.filter(item => Number.isSafeInteger(item.price) && item.price > 0);
  const empty = () => ({ tasks: [], ledger: {}, favorites: [] });
  let snapshot = empty();
  let view = "wardrobe";
  let selectedDay = today();
  let editingId = null;
  let pauseEnglish;
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" });
  const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];

  function read() {
    const raw = localStorage.getItem(key);
    if (raw === null) return empty();
    const value = JSON.parse(raw);
    if (!Array.isArray(value?.tasks) || !value.ledger || typeof value.ledger !== "object" || Array.isArray(value.ledger)) {
      throw new Error("Invalid economy data");
    }
    if (value.favorites === undefined) value.favorites = [];
    if (!Array.isArray(value.favorites)) throw new Error("Invalid favorites data");
    return value;
  }

  function balance(value) {
    return Object.values(value.ledger).reduce((total, transaction) => total + transaction.amount, 0);
  }

  function owns(item, value = snapshot) {
    return item.price === 0 || Boolean(value.ledger["purchase:" + item.id]);
  }

  function mutate(update) {
    const commit = () => {
      const latest = read();
      const result = update(latest);
      if (result.changed) localStorage.setItem(key, JSON.stringify(latest));
      snapshot = latest;
      return result;
    };
    if (navigator.locks?.request) return navigator.locks.request(key, commit);
    return Promise.resolve().then(commit);
  }

  async function act(messageId, update) {
    let result;
    try {
      result = await mutate(update);
    } catch {
      byId(messageId).textContent = "이 브라우저에서 저장하지 못했어. 다시 열어서 확인해 줘.";
      return false;
    }
    render();
    inventoryChanged();
    byId(messageId).textContent = result.message;
    if (result.rewarded) celebrate("coin");
    if (result.purchased) celebrate("purchase");
    return result.changed;
  }

  function addTransaction(latest, id, amount) {
    latest.ledger[id] = { amount, at: Date.now() };
  }

  function dateKey(date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map(part => String(part).padStart(2, "0")).join("-");
  }

  function today() {
    return dateKey(new Date());
  }

  function dateFromKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(2000, 0, 1, 12);
    date.setFullYear(year, month - 1, day);
    return date;
  }

  function addDays(date, amount) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function weekStart(date) {
    return addDays(date, -((date.getDay() + 6) % 7));
  }

  function weekNumber(monday) {
    const thursday = addDays(monday, 3);
    const year = thursday.getFullYear();
    const date = new Date(0);
    const first = new Date(0);
    date.setUTCFullYear(year, thursday.getMonth(), thursday.getDate());
    first.setUTCFullYear(year, 0, 1);
    return { year, week: 1 + Math.floor((date - first) / (7 * 86400000)) };
  }

  function scheduleButton(label, onClick) {
    const button = element("button", label);
    button.type = "button";
    button.onclick = onClick;
    return button;
  }

  function makeId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function bindToggle(button, id) {
    button.onclick = async () => {
      button.disabled = true;
      await act("tasks-message", latest => {
        const task = latest.tasks.find(entry => entry.id === id && entry.day === today() && !entry.deletedAt);
        if (!task) return { changed: false, message: "오늘 할 일을 다시 확인해 줘." };
        task.done = !task.done;
        const transaction = "task:" + task.id;
        const rewarded = task.done && !latest.ledger[transaction];
        if (rewarded) addTransaction(latest, transaction, task.reward);
        const message = rewarded ? task.reward + " 코인을 받았어!"
          : task.done ? "완료했어. 이 할 일의 코인은 이미 받았어."
          : "완료 표시를 풀었어. 받은 코인은 그대로야.";
        return { changed: true, message, rewarded };
      });
      button.disabled = false;
    };
  }

  function taskInfo(task) {
    const info = element("div", "", "task-info");
    const paid = snapshot.ledger["task:" + task.id];
    const reward = paid ? paid.amount + " 코인 지급 완료" : task.reward + " 코인";
    info.append(element("strong", task.title), element("small", reward));
    return info;
  }

  function renderTasks() {
    const day = today();
    const tasks = snapshot.tasks.filter(task => task.day === day && !task.deletedAt);
    const list = byId("tasks-list");
    byId("task-date").textContent = dateLabel.format(dateFromKey(day));
    byId("task-summary").textContent = tasks.length ? tasks.filter(task => task.done).length + " / " + tasks.length + " 완료" : "";
    list.textContent = "";
    if (!tasks.length) {
      list.append(element("p", "오늘 등록한 할 일이 없어.", "economy-empty"));
    }
    for (const task of tasks) {
      const row = element("div", "", "task-row");
      const button = scheduleButton(task.done ? "완료 취소" : "완료", null);
      button.setAttribute("aria-pressed", String(task.done));
      button.setAttribute("aria-label", task.title + (task.done ? " 완료 취소" : " 완료"));
      button.dataset.task = task.id;
      bindToggle(button, task.id);
      row.append(taskInfo(task), button);
      list.append(row);
    }
  }

  function resetForm() {
    editingId = null;
    byId("task-title").value = "";
    byId("task-reward").value = "10";
    byId("task-day").value = selectedDay;
    byId("edit-date-field").hidden = true;
    byId("task-cancel").hidden = true;
    byId("task-submit").textContent = "할 일 등록";
  }

  function selectDay(day) {
    selectedDay = day;
    resetForm();
    byId("parent-message").textContent = "";
    renderParent();
  }

  function edit(task) {
    editingId = task.id;
    byId("edit-date-field").hidden = false;
    byId("task-cancel").hidden = false;
    byId("task-title").value = task.title;
    byId("task-reward").value = task.reward;
    byId("task-day").value = task.day;
    byId("task-submit").textContent = "수정 저장";
    byId("parent-message").textContent = snapshot.ledger["task:" + task.id] ? "이 일정의 코인은 이미 지급됐어." : "";
    byId("task-title").focus();
  }

  function changeDeletion(id, deleted) {
    if (deleted && !window.confirm("이 일정을 삭제할까? 받은 코인은 그대로야.")) return;
    if (editingId === id) resetForm();
    void act("parent-message", latest => {
      const task = latest.tasks.find(entry => entry.id === id);
      if (!task || Boolean(task.deletedAt) === deleted) return { changed: false, message: "일정 상태를 다시 확인해 줘." };
      if (deleted) task.deletedAt = Date.now();
      else delete task.deletedAt;
      return { changed: true, message: deleted ? "일정을 삭제했어." : "일정을 복원했어." };
    });
  }

  function favoriteInput() {
    const title = byId("task-title").value.trim();
    const reward = Number(byId("task-reward").value);
    if (!title || !Number.isSafeInteger(reward) || reward < 1 || reward > 999) {
      byId("parent-message").textContent = "할 일과 1~999 사이의 코인을 입력해 줘.";
      return null;
    }
    return { title, reward };
  }

  function saveFavorite() {
    const values = favoriteInput();
    if (!values) return;
    void act("parent-message", latest => {
      if (latest.favorites.some(item => item.title === values.title && item.reward === values.reward)) {
        return { changed: false, message: "이미 자주 쓰는 할 일에 있어." };
      }
      latest.favorites.push({ id: makeId(), ...values });
      return { changed: true, message: "자주 쓰는 할 일에 저장했어. 위에서 누르면 선택한 날짜에 추가돼." };
    });
  }

  function registerFavorite(id, day) {
    return act("parent-message", latest => {
      const item = latest.favorites.find(entry => entry.id === id);
      if (!item) return { changed: false, message: "자주 쓰는 할 일을 다시 확인해 줘." };
      const matches = latest.tasks.filter(task => task.day === day &&
        (task.favoriteId === id || (task.title === item.title && task.reward === item.reward)));
      if (matches.some(task => !task.deletedAt)) return { changed: false, message: "그 날짜에 이미 같은 할 일이 있어." };
      if (matches.length) {
        const match = matches.find(task => latest.ledger["task:" + task.id]) ?? matches[0];
        delete match.deletedAt;
        return { changed: true, message: "같은 날짜에 삭제한 일정을 복원했어." };
      }
      latest.tasks.push({ id: makeId(), favoriteId: id, title: item.title, reward: item.reward, day, done: false });
      return { changed: true, message: dateLabel.format(dateFromKey(day)) + " 일정에 추가했어." };
    });
  }

  function renderFavorites() {
    const list = byId("favorite-tasks");
    list.textContent = "";
    byId("favorite-block").hidden = !snapshot.favorites.length;
    for (const item of snapshot.favorites) {
      const row = element("div", "", "favorite-row");
      const add = scheduleButton(item.title + " · " + item.reward + "코인", async () => {
        add.disabled = true;
        await registerFavorite(item.id, selectedDay);
        add.disabled = false;
      });
      add.dataset.favoriteAdd = item.id;
      add.setAttribute("aria-label", item.title + " 일정 추가");
      const remove = scheduleButton("×", () => void act("parent-message", latest => {
        latest.favorites = latest.favorites.filter(entry => entry.id !== item.id);
        return { changed: true, message: "자주 쓰는 할 일 목록에서 뺐어." };
      }));
      remove.setAttribute("aria-label", item.title + " 자주 쓰기에서 빼기");
      remove.dataset.favoriteRemove = item.id;
      row.append(add, remove);
      list.append(row);
    }
  }

  function renderWeekStats(monday, sunday, weekLabel) {
    const from = dateKey(monday);
    const until = dateKey(sunday);
    const tasks = snapshot.tasks.filter(task => !task.deletedAt && task.day >= from && task.day <= until);
    const done = tasks.filter(task => task.done).length;
    byId("stats-week").textContent = weekLabel;
    byId("stats-tasks").textContent = tasks.length
      ? "할 일 " + done + "/" + tasks.length + " 완료 · " + Math.round(done * 100 / tasks.length) + "%"
      : "등록한 할 일이 없어.";
    let tests = [];
    try {
      const book = JSON.parse(localStorage.getItem(ribbonStorageKeys.english));
      tests = (Array.isArray(book?.history) ? book.history : []).filter(record => {
        if (!record || !Array.isArray(record.items) || !record.items.length || !Number.isFinite(Date.parse(record.date))) return false;
        const date = dateKey(new Date(record.date));
        return date >= from && date <= until;
      });
    } catch {}
    let total = 0;
    let correct = 0;
    const misses = new Map();
    for (const record of tests) {
      for (const item of record.items) {
        if (!item || typeof item.word !== "string") continue;
        total += 1;
        if (item.correct) correct += 1;
        else {
          const word = item.word.trim().toLowerCase();
          if (word) misses.set(word, (misses.get(word) ?? 0) + 1);
        }
      }
    }
    byId("stats-english").textContent = total
      ? "영어 시험·복습 " + tests.length + "회 · " + correct + "/" + total + " 정답 · " + Math.round(correct * 100 / total) + "%"
      : "영어 시험·복습 기록이 없어.";
    const words = [...misses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
    byId("stats-missed").textContent = words.length ? "자주 틀린 단어 " + words.map(([word, count]) => word + " " + count + "회").join(" · ") : "";
  }

  function renderParent() {
    const monday = weekStart(dateFromKey(selectedDay));
    const sunday = addDays(monday, 6);
    const week = weekNumber(monday);
    const day = today();
    const days = byId("week-days");
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const counts = new Map();
    for (const task of snapshot.tasks) {
      if (!task.deletedAt) counts.set(task.day, (counts.get(task.day) ?? 0) + 1);
    }
    const range = [monday, sunday].map(date => (date.getMonth() + 1) + "/" + date.getDate()).join("–");
    const label = week.year + "년 " + week.week + "주 · " + range;
    byId("week-label").textContent = label;
    byId("parent-date").textContent = dateLabel.format(dateFromKey(selectedDay));
    days.textContent = "";
    weekDays.forEach((date, i) => {
      const key = dateKey(date);
      const count = counts.get(key) ?? 0;
      const button = scheduleButton("", () => selectDay(key));
      button.dataset.day = key;
      button.setAttribute("aria-pressed", String(key === selectedDay));
      button.setAttribute("aria-label", dateLabel.format(date) + ", 일정 " + count + "개");
      if (key === day) button.setAttribute("aria-current", "date");
      button.append(element("span", dayLabels[i]), element("strong", String(date.getDate())), element("small", count ? String(count) : "·"));
      days.append(button);
    });

    const active = byId("parent-list");
    const deletedList = byId("deleted-list");
    active.textContent = "";
    deletedList.textContent = "";
    const tasks = snapshot.tasks.filter(task => task.day === selectedDay);
    for (const task of tasks) {
      const row = element("div", "", "task-row");
      row.append(taskInfo(task));
      if (task.deletedAt) {
        const restore = scheduleButton("복원", () => changeDeletion(task.id, false));
        restore.dataset.restore = task.id;
        row.append(restore);
        deletedList.append(row);
      } else {
        const actions = element("div", "", "task-row-actions");
        const editButton = scheduleButton("수정", () => edit(task));
        const deleteButton = scheduleButton("삭제", () => changeDeletion(task.id, true));
        editButton.dataset.edit = task.id;
        deleteButton.dataset.delete = task.id;
        editButton.setAttribute("aria-label", task.title + " 수정");
        deleteButton.setAttribute("aria-label", task.title + " 삭제");
        actions.append(editButton, deleteButton);
        row.append(actions);
        active.append(row);
      }
    }
    if (!active.childElementCount) active.append(element("p", "이날 등록한 할 일이 없어.", "economy-empty"));
    byId("deleted-tasks").hidden = !deletedList.childElementCount;
    byId("deleted-summary").textContent = "삭제한 일정 " + deletedList.childElementCount + "개";
    renderFavorites();
    renderWeekStats(monday, sunday, label);
  }

  function buy(item) {
    return act("shop-message", latest => {
      if (owns(item, latest)) return { changed: false, message: "이미 옷장에 있어." };
      if (balance(latest) < item.price) return { changed: false, message: "코인이 조금 더 필요해." };
      addTransaction(latest, "purchase:" + item.id, -item.price);
      return { changed: true, purchased: true, message: item.name + "을(를) 옷장에 넣었어!" };
    });
  }

  function renderShop() {
    const list = byId("shop-items");
    list.textContent = "";
    for (const item of saleItems) {
      const row = element("article", "", "shop-row");
      const picture = element("img");
      picture.alt = "";
      picture.src = artUrl(item.preview);
      const info = element("div", "", "shop-info");
      info.append(element("strong", item.name), element("small", item.price + " 코인"));
      const owned = owns(item);
      const affordable = balance(snapshot) >= item.price;
      const button = element("button", owned ? "옷장 열기" : affordable ? "구매" : "코인 부족", "save");
      button.type = "button";
      button.dataset.buy = item.id;
      button.disabled = !owned && !affordable;
      button.onclick = async () => {
        if (owns(item)) {
          switchView("wardrobe");
          return;
        }
        button.disabled = true;
        await buy(item);
      };
      row.append(picture, info, button);
      list.append(row);
    }
  }

  function render() {
    byId("coins").textContent = balance(snapshot).toLocaleString("ko-KR") + " 코인";
    renderTasks();
    renderParent();
    renderShop();
  }

  function reload() {
    try {
      snapshot = read();
    } catch {
      byId("parent-message").textContent = "저장된 학습 데이터를 읽을 수 없어.";
    }
    render();
  }

  function switchView(next) {
    if (view === "english" && next !== "english") pauseEnglish?.();
    view = next;
    viewChanged(view);
    reload();
    document.body.dataset.view = view;
    for (const pane of document.querySelectorAll("[data-pane]")) pane.hidden = pane.dataset.pane !== view;
    for (const button of document.querySelectorAll("[data-view-button]")) {
      button.setAttribute("aria-pressed", String(button.dataset.viewButton === view));
    }
    if (view === "english" && !pauseEnglish) {
      const root = byId("english-host").attachShadow({ mode: "open" });
      root.append(byId("english-template").content.cloneNode(true));
      pauseEnglish = mountRibbonEnglish(root, awardEnglish);
    }
    inventoryChanged();
  }

  async function awardEnglish(record) {
    if (!record.items.some(item => item.entry.trim())) return "답안을 제출한 시험에 코인 보상이 있어.";
    const retries = record.mode === "retry";
    const correct = record.items.filter(item => item.correct).length;
    if (retries && !correct) return "오답 복습에서 한 문제 이상 맞히면 코인을 받아.";
    const sessionKey = "english:" + record.id;
    const day = dateKey(new Date(record.date));
    const result = await mutate(latest => {
      if (latest.ledger[sessionKey]) {
        const amount = latest.ledger[sessionKey].amount;
        return { changed: false, message: amount ? "이 시험 보상 " + amount + "코인은 이미 받았어." : "이 시험의 보상 확인이 끝났어." };
      }
      const earned = Object.entries(latest.ledger)
        .filter(([id, entry]) => id.startsWith("english:") && entry.day === day)
        .reduce((sum, [, entry]) => sum + entry.amount, 0);
      const firstKeys = [...new Set(record.setIds.map(id => "english-first:" + id))]
        .filter(id => !latest.ledger[id]);
      const basic = retries ? 2 : 3 + (correct * 5 >= record.items.length * 4 ? 2 : 0);
      const firstBonus = !retries && firstKeys.length ? 2 : 0;
      const amount = Math.max(0, Math.min(15 - earned, basic + firstBonus));
      addTransaction(latest, sessionKey, amount);
      latest.ledger[sessionKey].day = day;
      if (firstBonus && amount > basic) {
        for (const id of firstKeys) addTransaction(latest, id, 0);
      }
      return {
        changed: true,
        rewarded: amount > 0,
        message: amount ? amount + " 코인을 받았어!" : "오늘 받을 수 있는 영어 보상 15코인을 이미 받았어."
      };
    });
    render();
    inventoryChanged();
    if (result.rewarded) celebrate("coin");
    return result.message;
  }

  async function pinDigest(pin, salt) {
    const bytes = new TextEncoder().encode(salt + ":" + pin);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function openParentLock() {
    const dialog = byId("parent-lock");
    if (dialog.open) return;
    byId("parent-lock-form").reset();
    let setup = false;
    let message = "";
    try {
      setup = localStorage.getItem(pinKey) === null;
    } catch {
      message = "이 브라우저에서 잠금 설정을 읽을 수 없어.";
    }
    byId("parent-lock-title").textContent = setup ? "부모 관리 PIN 설정" : "부모 관리 PIN 입력";
    byId("parent-pin-confirm-field").hidden = !setup;
    byId("parent-pin-confirm").required = setup;
    byId("parent-lock-message").textContent = message || "숫자 4자리를 입력해 줘.";
    dialog.showModal();
  }

  function configureParentTools() {
    const dialog = byId("parent-lock");
    const form = byId("parent-lock-form");
    const unlock = byId("parent-unlock");
    byId("parent-lock-cancel").onclick = () => dialog.close();
    dialog.addEventListener("close", () => form.reset());
    form.onsubmit = async event => {
      event.preventDefault();
      if (unlock.disabled) return;
      const pin = byId("parent-pin").value;
      const message = byId("parent-lock-message");
      unlock.disabled = true;
      try {
        const stored = localStorage.getItem(pinKey);
        if (stored === null) {
          if (pin !== byId("parent-pin-confirm").value) {
            message.textContent = "PIN 확인이 일치하지 않아.";
            return;
          }
          const salt = crypto.randomUUID();
          const hash = await pinDigest(pin, salt);
          if (!dialog.open) return;
          if (localStorage.getItem(pinKey) !== null) {
            dialog.close();
            return;
          }
          localStorage.setItem(pinKey, JSON.stringify({ salt, hash }));
        } else {
          const { salt, hash } = JSON.parse(stored);
          if (await pinDigest(pin, salt) !== hash) {
            message.textContent = "PIN이 맞지 않아.";
            return;
          }
        }
        if (dialog.open) {
          dialog.close();
          switchView("parent");
        }
      } catch {
        message.textContent = "이 브라우저에서 부모 관리 잠금을 사용할 수 없어.";
      } finally {
        unlock.disabled = false;
      }
    };

    byId("coin-gift-form").onsubmit = async event => {
      event.preventDefault();
      const button = event.submitter;
      const field = byId("coin-gift-amount");
      const amount = Number(field.value);
      if (view !== "parent" || button.disabled || !Number.isSafeInteger(amount) || amount < 1 || amount > 999) return;
      button.disabled = true;
      const saved = await act("coin-gift-message", latest => {
        if (!Number.isSafeInteger(balance(latest) + amount)) {
          return { changed: false, message: "선물 후 잔액이 너무 커." };
        }
        addTransaction(latest, "gift:" + makeId(), amount);
        return { changed: true, rewarded: true, message: amount + " 코인을 선물했어!" };
      });
      if (saved) field.value = "";
      button.disabled = false;
    };
  }

  function start() {
    for (const button of document.querySelectorAll("[data-view-button]")) {
      button.onclick = () => {
        const next = button.dataset.viewButton;
        if (next === "parent" && view !== "parent") openParentLock();
        else switchView(next);
      };
    }
    byId("week-prev").onclick = () => selectDay(dateKey(addDays(dateFromKey(selectedDay), -7)));
    byId("week-next").onclick = () => selectDay(dateKey(addDays(dateFromKey(selectedDay), 7)));
    byId("week-today").onclick = () => selectDay(today());
    byId("task-cancel").onclick = resetForm;
    byId("favorite-save").onclick = saveFavorite;
    resetForm();
    byId("task-form").onsubmit = async event => {
      event.preventDefault();
      const title = byId("task-title").value.trim();
      const reward = Number(byId("task-reward").value);
      const id = editingId;
      const day = id ? byId("task-day").value : selectedDay;
      if (!title || !Number.isSafeInteger(reward) || reward < 1 || reward > 999 || !/^\d{4}-\d{2}-\d{2}$/.test(day) || dateKey(dateFromKey(day)) !== day) {
        byId("parent-message").textContent = "날짜, 할 일, 1~999 사이의 코인을 입력해 줘.";
        return;
      }
      const button = byId("task-submit");
      if (button.disabled) return;
      button.disabled = true;
      const saved = await act("parent-message", latest => {
        if (id) {
          const task = latest.tasks.find(entry => entry.id === id && !entry.deletedAt);
          if (!task) return { changed: false, message: "수정할 일정을 다시 확인해 줘." };
          Object.assign(task, { title, reward, day });
          return { changed: true, message: "일정을 수정했어." };
        }
        latest.tasks.push({ id: makeId(), title, reward, day, done: false });
        return { changed: true, message: "할 일을 등록했어." };
      });
      if (saved) {
        selectedDay = day;
        resetForm();
        renderParent();
      }
      button.disabled = false;
    };
    window.addEventListener("storage", event => {
      if (event.key === key || event.key === null) {
        reload();
        inventoryChanged();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) reload();
    });
    switchView("wardrobe");
    configureRibbonBackup(byId, switchView);
    configureParentTools();
  }

  try { snapshot = read(); } catch {}
  function openShop(id) {
    switchView("shop");
    const button = [...byId("shop-items").querySelectorAll("[data-buy]")].find(node => node.dataset.buy === id);
    button?.closest("article")?.scrollIntoView({ block: "nearest" });
    if (button && !button.disabled) button.focus();
  }

  return { owns, start, openShop, openWardrobe: () => switchView("wardrobe") };
}
