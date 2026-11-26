(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const readJson = id => JSON.parse(byId(id).textContent);
  const catalog = readJson("catalog");
  const art = readJson("art");
  const allItems = new Map(catalog.items.map(item => [item.id, item]));
  const storageKey = ribbonStorageKeys.look;
  const looksKey = ribbonStorageKeys.looks;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const doll = byId("doll");
  const dollArea = byId("doll-area");
  const frame = byId("doll-frame");
  const room = byId("room-background");
  const pet = byId("room-pet");
  let petTimer;
  const stageLayers = new Map();
  let activeCategory = catalog.categories[0].id;
  let wardrobeView = "items";
  let blink = null;
  let reaction = null;
  let blinkTimer;
  let reactionTimer;
  let changeTimer;
  let drawSequence = 0;
  const economy = createRibbonEconomy(catalog.items, byId, artUrl, renderWardrobe, celebrateReward, next => sound.enterView(next));
  let state = load();
  const sound = createRibbonAudio(byId, artUrl(catalog.audio.roomMusic), state.audio, preferences => {
    state.audio = preferences;
    if (!store()) announce("소리 설정을 저장할 수 없어.");
  });
  let looks = readLooksSafely();

  function load() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey));
    } catch {
      saved = null;
    }
    return {
      look: ownedLook(saved?.look),
      motion: typeof saved?.motion === "boolean" ? saved.motion : !reducedMotion.matches,
      audio: normalizeRibbonAudio(saved?.audio)
    };
  }

  function ownedLook(selection) {
    const look = { ...catalog.defaults };
    for (const [slot, id] of Object.entries(selection ?? {})) {
      const item = allItems.get(id);
      if (item?.slot === slot && economy.owns(item)) look[slot] = id;
    }
    return look;
  }

  function store() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function announce(message) {
    byId("status").textContent = message;
  }

  function artUrl(path) {
    return art[path] || path;
  }

  function motionActive() {
    return state.motion && !reducedMotion.matches;
  }

  function equippedItems(look) {
    const equipped = Object.values(look).map(id => allItems.get(id)).filter(Boolean);
    const suppressed = new Set(equipped.flatMap(item => item.hidesSlots ?? []));
    return equipped.filter(item => !suppressed.has(item.slot));
  }

  function visibleLayers() {
    const active = equippedItems(state.look);
    const masks = Object.assign({}, ...active.map(item => item.masks ?? {}));
    const hiddenLayers = new Set(active.flatMap(item => item.hidesLayers ?? []));
    const face = allItems.get(reaction ?? state.look.face);
    const layers = [
      ...catalog.baseLayers,
      ...active.filter(item => item.slot !== "face").flatMap(item => item.layers),
      ...face.layers.map(layer => layer.blinks && blink ? { ...layer, path: catalog.blink[blink] } : layer)
    ];
    return layers.filter(layer => !hiddenLayers.has(layer.id))
      .map(layer => ({ ...layer, mask: masks[layer.id] })).sort((a, b) => a.z - b.z);
  }

  const preload = new Map();
  function ensureImage(path) {
    if (!preload.has(path)) {
      const image = new Image();
      image.src = artUrl(path);
      const ready = image.decode().catch(error => {
        preload.delete(path);
        throw error;
      });
      preload.set(path, ready);
    }
    return preload.get(path);
  }

  async function draw() {
    const sequence = ++drawSequence;
    const layers = visibleLayers();
    drawRoom();
    const clothing = state.look.outfit === catalog.separateOutfit ? [state.look.top, state.look.bottom] : [state.look.outfit, state.look.hair];
    byId("look-name").textContent = clothing.map(id => allItems.get(id)?.name).filter(Boolean).join(" · ");
    try {
      await Promise.all(layers.flatMap(layer => [layer.path, layer.mask].filter(Boolean).map(ensureImage)));
    } catch {
      if (sequence === drawSequence) announce("파츠를 불러오지 못했어. 다른 아이템을 골라 봐.");
      return;
    }
    if (sequence !== drawSequence) return;
    const ids = new Set(layers.map(layer => layer.id));
    for (const [id, image] of stageLayers) {
      if (!ids.has(id)) {
        image.remove();
        stageLayers.delete(id);
      }
    }
    for (const layer of layers) {
      if (!stageLayers.has(layer.id)) {
        const image = document.createElement("img");
        image.alt = "";
        image.draggable = false;
        image.dataset.layer = layer.id;
        stageLayers.set(layer.id, image);
        doll.append(image);
      }
      const image = stageLayers.get(layer.id);
      if (image.dataset.path !== layer.path) {
        image.src = artUrl(layer.path);
        image.dataset.path = layer.path;
      }
      image.style.zIndex = layer.z;
      image.classList.toggle("sway", layer.animation === "sway");
      const maskImage = layer.mask ? `url("${artUrl(layer.mask)}")` : "";
      image.style.maskImage = maskImage;
      image.style.maskSize = layer.mask ? "100% 100%" : "";
      image.style.webkitMaskImage = maskImage;
      image.style.webkitMaskSize = layer.mask ? "100% 100%" : "";
    }
  }

  function drawRoom() {
    const background = allItems.get(state.look.room);
    if (room.dataset.scene !== background.id) {
      room.style.backgroundImage = `url("${artUrl(background.scene)}")`;
      room.dataset.scene = background.id;
    }
    const member = allItems.get(state.look.pet);
    if (pet.dataset.pet === member.id) return;
    clearTimeout(petTimer);
    pet.classList.remove("greet");
    byId("pet-message").textContent = "";
    pet.dataset.pet = member.id;
    pet.hidden = !member.sprite;
    for (const [id, path] of [["pet-body", member.sprite], ["pet-ears", member.ears]]) {
      const image = byId(id);
      if (path) image.src = artUrl(path);
      else image.removeAttribute("src");
      image.hidden = !path;
    }
    pet.setAttribute("aria-label", member.name + "에게 인사하기");
  }

  pet.onclick = () => {
    const member = allItems.get(state.look.pet);
    if (!member.sprite) return;
    sound.play("pet");
    clearTimeout(petTimer);
    pet.classList.remove("greet");
    void pet.offsetWidth;
    pet.classList.add("greet");
    byId("pet-message").textContent = member.name + "가 반가워해!";
    petTimer = setTimeout(() => {
      pet.classList.remove("greet");
      byId("pet-message").textContent = "";
    }, 850);
  };

  function makeButton(name, current, marker) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(current));
    if (marker) {
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = marker;
      button.append(icon);
    }
    button.append(name);
    return button;
  }

  function renderCategories() {
    byId("categories").append(...catalog.categories.map(category => {
      const button = makeButton(category.name, category.id === activeCategory, category.icon);
      button.dataset.category = category.id;
      button.onclick = () => {
        activeCategory = category.id;
        syncSelection();
        renderItems();
      };
      return button;
    }));
  }

  function isWearing(item) {
    const usesSeparate = item.slot === "top" || item.slot === "bottom";
    return state.look[item.slot] === item.id && (!usesSeparate || state.look.outfit === catalog.separateOutfit);
  }

  function syncSelection() {
    for (const button of byId("categories").children) {
      button.setAttribute("aria-pressed", String(button.dataset.category === activeCategory));
    }
    for (const button of document.querySelectorAll("[data-item]")) {
      const item = allItems.get(button.dataset.item);
      button.setAttribute("aria-pressed", String(isWearing(item)));
    }
  }

  function renderItems() {
    const category = catalog.categories.find(entry => entry.id === activeCategory);
    const items = catalog.items.filter(item => item.category === category.id && economy.owns(item));
    byId("selection-title").textContent = category.label;
    byId("selection-count").textContent = `${items.length}종`;
    fillItemList("items", items);
  }

  function renderRoom() {
    for (const slot of ["room", "pet"]) {
      fillItemList(slot + "-items", catalog.items.filter(item => item.slot === slot && economy.owns(item)));
    }
  }

  function fillItemList(id, items) {
    const list = byId(id);
    list.textContent = "";
    for (const item of items) {
      const button = makeButton("", isWearing(item));
      button.className = "item";
      button.dataset.item = item.id;
      const check = wardrobeText("span", "✓", "check");
      check.setAttribute("aria-hidden", "true");
      button.append(itemPreview(item), wardrobeText("span", item.name, "item-label"), check);
      button.onclick = () => {
        if (isWearing(item)) return;
        cancelReaction();
        state.look[item.slot] = item.id;
        if (item.slot === "top" || item.slot === "bottom") state.look.outfit = catalog.separateOutfit;
        syncSelection();
        void draw();
        if (item.slot !== "face" && item.slot !== "room" && item.slot !== "pet") {
          flash();
          sound.play("outfit");
        }
        announce(store() ? item.name + " 선택했어." : "이 브라우저에서 코디를 저장할 수 없어.");
      };
      list.append(button);
    }
  }

  function itemPreview(item) {
    const preview = document.createElement("figure");
    preview.setAttribute("aria-hidden", "true");
    if (item.preview) {
      const image = document.createElement("img");
      image.loading = "lazy";
      image.src = artUrl(item.preview);
      image.alt = "";
      preview.append(image);
    } else {
      preview.textContent = item.icon ?? "✧";
    }
    return preview;
  }

  function wardrobeText(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function openWardrobeView(next) {
    wardrobeView = next;
    for (const button of document.querySelectorAll("[data-wardrobe-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.wardrobeView === next));
    }
    for (const panel of document.querySelectorAll("[data-wardrobe-panel]")) {
      panel.hidden = panel.dataset.wardrobePanel !== next;
    }
    announce("");
    renderWardrobe();
  }

  function renderWardrobe() {
    if (wardrobeView === "looks") renderLooks();
    else if (wardrobeView === "catalog") renderCatalog();
    else if (wardrobeView === "room") renderRoom();
    else renderItems();
  }

  function readLooks() {
    const saved = JSON.parse(localStorage.getItem(looksKey));
    if (saved === null) return [];
    if (!Array.isArray(saved) || !saved.every(entry =>
      typeof entry?.id === "string" && typeof entry.title === "string" && entry.look && typeof entry.look === "object")) {
      throw new Error("Invalid saved looks");
    }
    return saved;
  }

  function readLooksSafely() {
    try { return readLooks(); } catch { return []; }
  }

  async function changeLooks(update) {
    const commit = () => {
      const next = update(readLooks());
      localStorage.setItem(looksKey, JSON.stringify(next));
      looks = next;
    };
    try {
      if (navigator.locks?.request) await navigator.locks.request(looksKey, commit);
      else commit();
      if (wardrobeView === "looks") renderLooks();
      return true;
    } catch {
      announce("이 브라우저에서 코디를 저장할 수 없어.");
      return false;
    }
  }

  window.addEventListener("storage", event => {
    if (event.key !== looksKey && event.key !== null) return;
    looks = readLooksSafely();
    if (wardrobeView === "looks") renderLooks();
  });

  function applyLook(entry) {
    cancelReaction();
    const before = state.look;
    state.look = ownedLook(entry.look);
    if (!store()) {
      state.look = before;
      announce("이 브라우저에서 코디를 저장할 수 없어.");
      return;
    }
    syncSelection();
    void draw();
    flash();
    sound.play("outfit");
    announce(entry.title + " 코디로 갈아입었어.");
  }

  function renderLooks() {
    const list = byId("saved-looks");
    list.textContent = "";
    if (!looks.length) list.append(wardrobeText("p", "아직 저장한 코디가 없어.", "economy-empty"));
    for (const entry of looks) {
      const row = wardrobeText("div", "", "task-row");
      const info = wardrobeText("div", "", "task-info");
      const items = equippedItems(ownedLook(entry.look)).filter(item => item.preview);
      info.append(wardrobeText("strong", entry.title), wardrobeText("small", items.filter(item => item.slot !== "face").map(item => item.name).join(" · ")));
      const actions = wardrobeText("div", "", "task-row-actions");
      const equip = makeButton("입기", false);
      const remove = makeButton("삭제", false);
      for (const button of [equip, remove]) button.removeAttribute("aria-pressed");
      equip.dataset.applyLook = entry.id;
      remove.dataset.removeLook = entry.id;
      equip.setAttribute("aria-label", entry.title + " 코디 입기");
      remove.setAttribute("aria-label", entry.title + " 코디 삭제");
      equip.onclick = () => applyLook(entry);
      remove.onclick = async () => {
        remove.disabled = true;
        if (await changeLooks(list => list.filter(saved => saved.id !== entry.id))) announce("저장한 코디를 삭제했어.");
        remove.disabled = false;
      };
      actions.append(equip, remove);
      row.append(info, actions);
      list.append(row);
    }
  }

  function renderCatalog() {
    const list = byId("catalog-items");
    const filter = byId("catalog-filter").value;
    const entries = catalog.items.filter(item => item.preview && item.slot !== "face");
    const owned = entries.filter(item => economy.owns(item)).length;
    byId("catalog-count").textContent = owned + " / " + entries.length + "종 보유";
    list.textContent = "";
    for (const item of entries) {
      const available = economy.owns(item);
      if ((filter === "owned" && !available) || (filter === "locked" && available)) continue;
      const card = wardrobeText("div", "", "item catalog-card");
      card.dataset.catalogItem = item.id;
      const badge = wardrobeText("span", available ? "보유" : item.price + " 코인", "catalog-badge");
      card.append(itemPreview(item), wardrobeText("strong", item.name, "item-label"), badge);
      if (!available) {
        const go = makeButton("상점 보기", false);
        go.removeAttribute("aria-pressed");
        go.dataset.shopLink = item.id;
        go.onclick = () => economy.openShop(item.id);
        card.append(go);
      }
      list.append(card);
    }
    if (!list.childElementCount) list.append(wardrobeText("p", "해당하는 아이템이 없어.", "economy-empty"));
  }

  for (const button of document.querySelectorAll("[data-wardrobe-view]")) {
    button.onclick = () => openWardrobeView(button.dataset.wardrobeView);
  }
  byId("catalog-filter").onchange = renderCatalog;
  byId("look-form").onsubmit = async event => {
    event.preventDefault();
    const input = byId("look-title");
    const title = input.value.trim();
    if (!title) {
      announce("코디 이름을 적어 줘.");
      return;
    }
    const id = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const button = event.currentTarget.querySelector("button");
    if (button.disabled) return;
    button.disabled = true;
    const entry = { id, title, look: { ...state.look } };
    if (await changeLooks(list => [...list, entry])) {
      input.value = "";
      announce(title + " 코디를 저장했어.");
    }
    button.disabled = false;
  };

  function flash() {
    if (!motionActive()) return;
    const sparkle = byId("sparkle");
    sparkle.classList.remove("flash");
    void sparkle.offsetWidth;
    sparkle.classList.add("flash");
    dollArea.classList.add("change");
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => dollArea.classList.remove("change"), 370);
  }

  function cancelReaction() {
    clearTimeout(reactionTimer);
    reaction = null;
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blink = null;
    if (!motionActive() || document.hidden) return;
    const frames = [["half", 62], ["closed", 110], ["half", 65], [null, 0]];
    const nextFrame = index => {
      blink = frames[index][0];
      void draw();
      if (index === frames.length - 1) {
        scheduleBlink();
        return;
      }
      blinkTimer = setTimeout(() => nextFrame(index + 1), frames[index][1]);
    };
    blinkTimer = setTimeout(() => nextFrame(0), 2800 + Math.random() * 3100);
  }

  function syncMotion() {
    byId("motion").setAttribute("aria-pressed", String(motionActive()));
    byId("motion").querySelector("b").textContent = motionActive() ? "켜짐" : "꺼짐";
    document.body.classList.toggle("motion-off", !motionActive());
    scheduleBlink();
    void draw();
  }

  function celebrateReward(kind) {
    sound.play(kind);
    if (kind === "coin" && motionActive()) react();
  }

  function react() {
    cancelReaction();
    reaction = state.look.face === catalog.reaction ? catalog.defaults.face : catalog.reaction;
    void draw();
    flash();
    reactionTimer = setTimeout(() => {
      reaction = null;
      void draw();
    }, 1300);
  }
  byId("react").onclick = react;
  byId("save").onclick = byId("room-save").onclick = () => {
    openWardrobeView("looks");
    byId("look-title").focus();
  };
  byId("reset").onclick = () => {
    cancelReaction();
    state.look = { ...catalog.defaults };
    syncSelection();
    void draw();
    flash();
    announce(store() ? "처음 코디로 돌아왔어." : "처음 코디로 돌아왔어. 이 브라우저에서는 저장할 수 없어.");
  };
  byId("motion").onclick = () => {
    if (reducedMotion.matches) {
      announce("기기에서 동작 줄이기가 켜져 있어.");
      return;
    }
    state.motion = !state.motion;
    syncMotion();
    store();
  };
  document.addEventListener("visibilitychange", () => {
    scheduleBlink();
    void draw();
  });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", syncMotion);
  else reducedMotion.addListener(syncMotion);
  function sizeDoll() {
    const height = Math.min(frame.clientHeight, frame.clientWidth * 1.5);
    dollArea.style.height = height + "px";
    dollArea.style.width = (height * 2 / 3) + "px";
    frame.style.setProperty("--pet-width", (height * .205) + "px");
  }

  sizeDoll();
  if ("ResizeObserver" in window) new ResizeObserver(sizeDoll).observe(frame);
  else window.addEventListener("resize", sizeDoll);

  byId("room-shortcut").onclick = () => {
    economy.openWardrobe();
    openWardrobeView("room");
  };
  byId("room-shop").onclick = () => {
    const first = catalog.items.find(item => ["room", "pet"].includes(item.slot) && !economy.owns(item));
    economy.openShop(first?.id);
  };
  renderCategories();
  economy.start();
  syncMotion();
  for (const path of Object.values(catalog.blink)) void ensureImage(path).catch(() => {});
})();
