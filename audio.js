function normalizeRibbonAudio(saved) {
  const volume = (name, fallback) => {
    const value = saved?.[name];
    return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : fallback;
  };
  return {
    bgmEnabled: typeof saved?.bgmEnabled === "boolean" ? saved.bgmEnabled : true,
    bgmVolume: volume("bgmVolume", 24),
    sfxEnabled: typeof saved?.sfxEnabled === "boolean" ? saved.sfxEnabled : true,
    sfxVolume: volume("sfxVolume", 45)
  };
}

function createRibbonAudio(byId, roomMusic, initial, save) {
  let preferences = normalizeRibbonAudio(initial);
  let view = "wardrobe";
  let activated = false;
  let context;
  let effects;
  let music;
  const melodies = {
    coin: [[659, 0, .23, .105], [880, .06, .24, .09], [1047, .13, .29, .08]],
    purchase: [[440, 0, .22, .12], [587, .09, .25, .09], [740, .19, .29, .084], [880, .27, .34, .082]],
    outfit: [[917, 0, .14, .047], [1210, .047, .16, .037]],
    pet: [[675, 0, .12, .052, 830], [936, .107, .19, .046, 710]]
  };

  function shouldPlayMusic() {
    return activated && view === "wardrobe" && !document.hidden && preferences.bgmEnabled && preferences.bgmVolume > 0;
  }

  function syncMusic() {
    if (!shouldPlayMusic()) {
      music?.pause();
      return;
    }
    if (!music) {
      music = new Audio(roomMusic);
      music.loop = true;
      music.preload = "auto";
    }
    music.volume = preferences.bgmVolume / 100;
    if (!music.paused) return;
    Promise.resolve(music.play()).catch(() => {}).finally(() => {
      if (!shouldPlayMusic()) music.pause();
    });
  }

  function effectVolume() {
    if (effects) effects.gain.value = preferences.sfxEnabled ? preferences.sfxVolume / 100 : 0;
  }

  function readyEffects() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return Promise.resolve(false);
      context = new AudioContext();
      effects = context.createGain();
      effects.connect(context.destination);
      effectVolume();
    }
    return (context.state === "running" ? Promise.resolve() : context.resume())
      .then(() => context.state === "running");
  }

  function play(name) {
    const notes = melodies[name];
    if (!notes || !activated || document.hidden || !preferences.sfxEnabled || !preferences.sfxVolume) return;
    try {
      void readyEffects().then(ready => {
        if (!ready || document.hidden || !preferences.sfxEnabled || !preferences.sfxVolume) return;
        const start = context.currentTime + .008;
        for (const [frequency, offset, duration, peak, glide] of notes) {
          const when = start + offset;
          const tone = context.createOscillator();
          const envelope = context.createGain();
          tone.type = name === "purchase" ? "triangle" : "sine";
          tone.frequency.setValueAtTime(frequency, when);
          if (glide) tone.frequency.exponentialRampToValueAtTime(glide, when + duration * .8);
          envelope.gain.setValueAtTime(.0001, when);
          envelope.gain.exponentialRampToValueAtTime(peak, when + .023);
          envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
          tone.connect(envelope);
          envelope.connect(effects);
          tone.start(when);
          tone.stop(when + duration + .012);
          tone.onended = () => {
            tone.disconnect();
            envelope.disconnect();
          };
        }
      }).catch(() => {});
    } catch {}
  }

  function unlock(event) {
    if (!event.isTrusted) return;
    activated = true;
    syncMusic();
    if (preferences.sfxEnabled && preferences.sfxVolume && context?.state !== "running") {
      try { void readyEffects().catch(() => {}); } catch {}
    }
  }

  for (const type of ["pointerdown", "keydown", "click"]) document.addEventListener(type, unlock, true);
  document.addEventListener("visibilitychange", syncMusic);
  window.addEventListener("pagehide", () => music?.pause());
  window.addEventListener("pageshow", syncMusic);

  for (const channel of ["bgm", "sfx"]) {
    const enabled = byId(channel + "-enabled");
    const volume = byId(channel + "-volume");
    const level = byId(channel + "-level");
    enabled.checked = preferences[channel + "Enabled"];
    volume.value = preferences[channel + "Volume"];
    level.textContent = volume.value + "%";
    function apply() {
      const wasEnabled = preferences[channel + "Enabled"];
      preferences = { ...preferences, [channel + "Enabled"]: enabled.checked, [channel + "Volume"]: Number(volume.value) };
      level.textContent = volume.value + "%";
      effectVolume();
      syncMusic();
      save(preferences);
      if (channel === "sfx" && enabled.checked && wasEnabled !== enabled.checked) play("outfit");
    }
    enabled.addEventListener("change", apply);
    volume.addEventListener("input", apply);
  }
  return {
    play,
    enterView(next) {
      view = next;
      syncMusic();
    }
  };
}
