(() => {
  "use strict";

  const API_BASE = "https://oss.exercisedb.dev/api/v1";
  const STORAGE_KEY = "pulse-workout-v1";
  const CATALOG_KEY = "pulse-catalog-cache-v1";
  const CACHE_MAX_AGE = 1000 * 60 * 60 * 24;

  const $ = (id) => document.getElementById(id);
  const els = {
    builderView: $("builderView"),
    workoutView: $("workoutView"),
    completeView: $("completeView"),
    exerciseSearch: $("exerciseSearch"),
    suggestions: $("suggestions"),
    searchStatus: $("searchStatus"),
    searchSpinner: $("searchSpinner"),
    selectedExercise: $("selectedExercise"),
    selectedGif: $("selectedGif"),
    selectedTarget: $("selectedTarget"),
    selectedEquipment: $("selectedEquipment"),
    selectedName: $("selectedName"),
    selectedInstruction: $("selectedInstruction"),
    clearSelectionBtn: $("clearSelectionBtn"),
    repsInput: $("repsInput"),
    setsInput: $("setsInput"),
    workInput: $("workInput"),
    restInput: $("restInput"),
    addExerciseBtn: $("addExerciseBtn"),
    emptyQueue: $("emptyQueue"),
    queueList: $("queueList"),
    startWorkoutBtn: $("startWorkoutBtn"),
    clearWorkoutBtn: $("clearWorkoutBtn"),
    exitWorkoutBtn: $("exitWorkoutBtn"),
    restartWorkoutBtn: $("restartWorkoutBtn"),
    overallLabel: $("overallLabel"),
    overallBar: $("overallBar"),
    liveGif: $("liveGif"),
    phaseBadge: $("phaseBadge"),
    setBadge: $("setBadge"),
    liveMeta: $("liveMeta"),
    liveExerciseName: $("liveExerciseName"),
    formCue: $("formCue"),
    timerRing: $("timerRing"),
    phaseMini: $("phaseMini"),
    timerText: $("timerText"),
    repsText: $("repsText"),
    sessionHint: $("sessionHint"),
    previousBtn: $("previousBtn"),
    pauseBtn: $("pauseBtn"),
    pauseIcon: $("pauseIcon"),
    pauseLabel: $("pauseLabel"),
    skipBtn: $("skipBtn"),
    restartExerciseBtn: $("restartExerciseBtn"),
    restOverlay: $("restOverlay"),
    restOverlayTime: $("restOverlayTime"),
    restNextText: $("restNextText"),
    completionSummary: $("completionSummary"),
    completedExercises: $("completedExercises"),
    completedSets: $("completedSets"),
    completedMinutes: $("completedMinutes"),
    repeatWorkoutBtn: $("repeatWorkoutBtn"),
    backToBuilderBtn: $("backToBuilderBtn"),
    toast: $("toast")
  };

  const state = {
    catalog: [],
    selected: null,
    workout: loadWorkout(),
    workoutStartedAt: null,
    currentExercise: 0,
    currentSet: 1,
    phase: "work",
    secondsLeft: 0,
    phaseTotal: 1,
    running: false,
    timerId: null,
    debounceId: null,
    wakeLock: null
  };

  function loadWorkout() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveWorkout() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.workout));
  }

  function unwrapExercises(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const key of ["data", "exercises", "results", "items"]) {
      if (Array.isArray(payload[key])) return payload[key];
      if (payload[key] && Array.isArray(payload[key].data)) return payload[key].data;
    }
    return [];
  }

  function normalizeExercise(item) {
    const instructions = Array.isArray(item.instructions)
      ? item.instructions
      : Array.isArray(item.steps)
      ? item.steps
      : [];
    return {
      id: String(item.exerciseId || item.id || item._id || item.name || crypto.randomUUID()),
      name: String(item.name || "Unnamed exercise"),
      gifUrl: item.gifUrl || item.gif || item.image || item.thumbnail || "",
      target: Array.isArray(item.targetMuscles) ? item.targetMuscles[0] : (item.target || item.primaryMuscle || ""),
      equipment: Array.isArray(item.equipments) ? item.equipments[0] : (item.equipment || ""),
      bodyPart: Array.isArray(item.bodyParts) ? item.bodyParts[0] : (item.bodyPart || ""),
      instructions
    };
  }

  async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
      mode: "cors",
      headers: { Accept: "application/json", ...(options.headers || {}) },
      ...options
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  }

  async function loadCatalog() {
    const cached = readCatalogCache();
    if (cached.length) {
      state.catalog = cached;
      setSearchStatus(`${cached.length.toLocaleString()} exercises ready.`);
    }
    setLoading(true);
    try {
      let payload;
      try {
        payload = await fetchJSON(`${API_BASE}/exercises?limit=1500`);
      } catch {
        payload = await fetchJSON(`${API_BASE}/exercises`);
      }
      const items = unwrapExercises(payload).map(normalizeExercise).filter(x => x.name);
      if (items.length) {
        state.catalog = dedupe(items);
        writeCatalogCache(state.catalog);
        setSearchStatus(`${state.catalog.length.toLocaleString()} exercises ready.`);
      } else if (!cached.length) {
        setSearchStatus("Type an exercise name to search the online library.");
      }
    } catch (err) {
      if (!cached.length) {
        setSearchStatus("Online library will search as you type.");
      }
    } finally {
      setLoading(false);
    }
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter(x => {
      const key = `${x.id}:${x.name}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function readCatalogCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CATALOG_KEY) || "null");
      if (!cached || !Array.isArray(cached.items)) return [];
      if (Date.now() - cached.savedAt > CACHE_MAX_AGE) return [];
      return cached.items;
    } catch {
      return [];
    }
  }

  function writeCatalogCache(items) {
    try {
      localStorage.setItem(CATALOG_KEY, JSON.stringify({ savedAt: Date.now(), items: items.slice(0, 1600) }));
    } catch {}
  }

  async function remoteSearch(term) {
    const encoded = encodeURIComponent(term);
    const urls = [
      `${API_BASE}/exercises/search?q=${encoded}`,
      `${API_BASE}/exercises/search?query=${encoded}`,
      `${API_BASE}/exercises?search=${encoded}&limit=24`
    ];
    for (const url of urls) {
      try {
        const payload = await fetchJSON(url);
        const items = unwrapExercises(payload).map(normalizeExercise);
        if (items.length) return dedupe(items);
      } catch {}
    }
    return [];
  }

  function localSearch(term) {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return state.catalog
      .map(x => {
        const name = x.name.toLowerCase();
        const target = (x.target || "").toLowerCase();
        const equipment = (x.equipment || "").toLowerCase();
        let score = 99;
        if (name === q) score = 0;
        else if (name.startsWith(q)) score = 1;
        else if (name.includes(q)) score = 2;
        else if (target.includes(q)) score = 3;
        else if (equipment.includes(q)) score = 4;
        return { x, score };
      })
      .filter(r => r.score < 99)
      .sort((a,b) => a.score - b.score || a.x.name.localeCompare(b.x.name))
      .slice(0, 18)
      .map(r => r.x);
  }

  function setLoading(on) {
    els.searchSpinner.classList.toggle("hidden", !on);
  }

  function setSearchStatus(text) {
    els.searchStatus.textContent = text;
  }

  async function handleSearchInput() {
    const term = els.exerciseSearch.value.trim();
    clearTimeout(state.debounceId);
    if (term.length < 2) {
      hideSuggestions();
      return;
    }
    state.debounceId = setTimeout(async () => {
      let results = localSearch(term);
      if (results.length < 5) {
        setLoading(true);
        const remote = await remoteSearch(term);
        setLoading(false);
        results = dedupe([...results, ...remote]).slice(0, 18);
      }
      renderSuggestions(results, term);
    }, 220);
  }

  function renderSuggestions(results, term) {
    if (!results.length) {
      els.suggestions.innerHTML = `<div class="suggestion" style="display:block;padding:16px;color:#9aa49c">No exact matches for “${escapeHTML(term)}”. Try a shorter exercise name.</div>`;
      els.suggestions.classList.remove("hidden");
      return;
    }
    els.suggestions.innerHTML = results.map((x, i) => `
      <button class="suggestion" type="button" role="option" data-index="${i}">
        <img src="${escapeAttr(x.gifUrl)}" alt="" loading="lazy" onerror="this.style.opacity='.12'" />
        <span>
          <strong>${escapeHTML(x.name)}</strong>
          <small>${escapeHTML([x.target, x.equipment].filter(Boolean).join(" • ") || "ExerciseDB")}</small>
        </span>
        <span class="add-mini" aria-hidden="true">＋</span>
      </button>
    `).join("");
    els.suggestions.classList.remove("hidden");
    els.suggestions.querySelectorAll(".suggestion[data-index]").forEach(btn => {
      btn.addEventListener("click", () => selectExercise(results[Number(btn.dataset.index)]));
    });
  }

  function hideSuggestions() {
    els.suggestions.classList.add("hidden");
  }

  function selectExercise(exercise) {
    state.selected = exercise;
    els.exerciseSearch.value = exercise.name;
    els.selectedName.textContent = exercise.name;
    els.selectedTarget.textContent = exercise.target || exercise.bodyPart || "Exercise";
    els.selectedEquipment.textContent = exercise.equipment || "Bodyweight / other";
    els.selectedInstruction.textContent = cleanInstruction(exercise.instructions[0]) || "Follow the demonstration and move through a comfortable range of motion.";
    els.selectedGif.src = exercise.gifUrl;
    els.selectedGif.alt = `${exercise.name} demonstration`;
    els.selectedExercise.classList.remove("hidden");
    els.addExerciseBtn.disabled = !exercise.gifUrl;
    hideSuggestions();
    if (!exercise.gifUrl) toast("This exercise does not include a demo GIF in the free library.");
  }

  function clearSelection() {
    state.selected = null;
    els.exerciseSearch.value = "";
    els.selectedExercise.classList.add("hidden");
    els.addExerciseBtn.disabled = true;
    hideSuggestions();
    els.exerciseSearch.focus();
  }

  function numberValue(el, min, max, fallback) {
    const n = Number(el.value);
    const safe = Number.isFinite(n) ? n : fallback;
    const bounded = Math.max(min, Math.min(max, safe));
    el.value = String(bounded);
    return bounded;
  }

  function addSelectedExercise() {
    if (!state.selected || !state.selected.gifUrl) return;
    const item = {
      ...state.selected,
      reps: numberValue(els.repsInput, 1, 500, 12),
      sets: numberValue(els.setsInput, 1, 50, 3),
      work: numberValue(els.workInput, 5, 3600, 45),
      rest: numberValue(els.restInput, 0, 3600, 30)
    };
    state.workout.push(item);
    saveWorkout();
    renderQueue();
    toast(`${item.name} added`);
    clearSelection();
  }

  function renderQueue() {
    const has = state.workout.length > 0;
    els.emptyQueue.classList.toggle("hidden", has);
    els.startWorkoutBtn.classList.toggle("hidden", !has);
    els.clearWorkoutBtn.classList.toggle("hidden", !has);

    els.queueList.innerHTML = state.workout.map((x, i) => `
      <article class="queue-item">
        <img class="queue-thumb" src="${escapeAttr(x.gifUrl)}" alt="${escapeAttr(x.name)} demonstration" loading="lazy" />
        <div class="queue-copy">
          <h3>${escapeHTML(x.name)}</h3>
          <p>${x.sets} sets × ${x.reps} reps · ${x.work}s work · ${x.rest}s rest</p>
        </div>
        <div class="queue-actions" aria-label="Reorder and remove">
          <button type="button" data-action="up" data-index="${i}" aria-label="Move ${escapeAttr(x.name)} up">↑</button>
          <button type="button" data-action="down" data-index="${i}" aria-label="Move ${escapeAttr(x.name)} down">↓</button>
          <button type="button" data-action="remove" data-index="${i}" aria-label="Remove ${escapeAttr(x.name)}">×</button>
        </div>
      </article>
    `).join("");

    els.queueList.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.index);
        const action = btn.dataset.action;
        if (action === "remove") state.workout.splice(index, 1);
        if (action === "up" && index > 0) [state.workout[index-1], state.workout[index]] = [state.workout[index], state.workout[index-1]];
        if (action === "down" && index < state.workout.length - 1) [state.workout[index+1], state.workout[index]] = [state.workout[index], state.workout[index+1]];
        saveWorkout();
        renderQueue();
      });
    });
  }

  function startWorkout(resetClock = true) {
    if (!state.workout.length) return;
    stopTimer();
    showView("workout");
    state.currentExercise = 0;
    state.currentSet = 1;
    state.phase = "work";
    state.running = false;
    if (resetClock) state.workoutStartedAt = Date.now();
    loadPhase();
    updatePauseButton();
    requestWakeLock();
  }

  function currentItem() {
    return state.workout[state.currentExercise];
  }

  function loadPhase() {
    const item = currentItem();
    if (!item) return finishWorkout();

    state.phaseTotal = state.phase === "work" ? item.work : Math.max(1, item.rest);
    state.secondsLeft = state.phase === "work" ? item.work : item.rest;

    els.liveGif.src = item.gifUrl;
    els.liveGif.alt = `${item.name} demonstration`;
    els.liveExerciseName.textContent = item.name;
    els.liveMeta.textContent = [item.target, item.equipment].filter(Boolean).join(" • ") || "ExerciseDB demonstration";
    els.formCue.textContent = getCue(item);
    els.setBadge.textContent = `Set ${state.currentSet} of ${item.sets}`;
    els.overallLabel.textContent = `Exercise ${state.currentExercise + 1} of ${state.workout.length}`;
    els.repsText.textContent = state.phase === "work" ? `${item.reps} reps` : "Recover";
    els.phaseBadge.textContent = state.phase.toUpperCase();
    els.phaseMini.textContent = state.phase.toUpperCase();
    els.sessionHint.textContent = state.phase === "work"
      ? "Follow the demonstration and move with control."
      : "Breathe, recover, and get ready for the next set.";
    els.restOverlay.classList.toggle("hidden", state.phase !== "rest");
    els.restNextText.textContent = nextLabel();
    updateOverallProgress();
    updateClockUI();

    if (state.running) ensureTimer();
  }

  function getCue(item) {
    const raw = (item.instructions || []).map(cleanInstruction).filter(Boolean);
    if (raw.length) {
      const idx = Math.min(raw.length - 1, Math.max(0, state.currentSet - 1));
      return raw[idx];
    }
    return "Use a controlled tempo and stop if the movement causes pain.";
  }

  function cleanInstruction(text) {
    return String(text || "").replace(/^step\s*:?\s*\d+\s*/i, "").trim();
  }

  function nextLabel() {
    const item = currentItem();
    if (!item) return "";
    if (state.currentSet < item.sets) return `Next: Set ${state.currentSet + 1} of ${item.sets}`;
    const next = state.workout[state.currentExercise + 1];
    return next ? `Next: ${next.name}` : "Final exercise";
  }

  function updateClockUI() {
    els.timerText.textContent = formatTime(state.secondsLeft);
    els.restOverlayTime.textContent = formatTime(state.secondsLeft);
    const pct = Math.max(0, Math.min(100, (state.secondsLeft / Math.max(1, state.phaseTotal)) * 100));
    els.timerRing.style.setProperty("--progress", `${pct}%`);
  }

  function updateOverallProgress() {
    const totalUnits = state.workout.reduce((sum, x) => sum + x.sets, 0);
    const completedBefore = state.workout.slice(0, state.currentExercise).reduce((sum, x) => sum + x.sets, 0);
    const currentFraction = Math.max(0, state.currentSet - 1) + (state.phase === "rest" ? 0.85 : 0.25);
    const pct = totalUnits ? Math.min(100, ((completedBefore + currentFraction) / totalUnits) * 100) : 0;
    els.overallBar.style.width = `${pct}%`;
  }

  function togglePause() {
    state.running = !state.running;
    if (state.running) {
      ensureTimer();
      beep(540, 0.05);
    } else {
      stopTimer();
    }
    updatePauseButton();
  }

  function updatePauseButton() {
    els.pauseLabel.textContent = state.running ? "Pause" : "Resume";
    els.pauseIcon.textContent = state.running ? "Ⅱ" : "▶";
  }

  function ensureTimer() {
    stopTimer();
    state.running = true;
    state.timerId = window.setInterval(() => {
      if (state.secondsLeft > 0) {
        state.secondsLeft -= 1;
        updateClockUI();
      } else {
        advancePhase();
      }
    }, 1000);
    updatePauseButton();
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function advancePhase() {
    const item = currentItem();
    if (!item) return finishWorkout();

    beep(state.phase === "work" ? 690 : 520, 0.08);

    if (state.phase === "work") {
      if (state.currentSet < item.sets && item.rest > 0) {
        state.phase = "rest";
        loadPhase();
        return;
      }
      if (state.currentSet < item.sets) {
        state.currentSet += 1;
        state.phase = "work";
        loadPhase();
        return;
      }
      if (state.currentExercise < state.workout.length - 1) {
        state.currentExercise += 1;
        state.currentSet = 1;
        state.phase = "work";
        loadPhase();
        return;
      }
      finishWorkout();
      return;
    }

    state.currentSet += 1;
    state.phase = "work";
    loadPhase();
  }

  function previousPhase() {
    const item = currentItem();
    if (!item) return;
    if (state.phase === "rest") {
      state.phase = "work";
      loadPhase();
      return;
    }
    if (state.currentSet > 1) {
      state.currentSet -= 1;
      state.phase = item.rest > 0 ? "rest" : "work";
      loadPhase();
      return;
    }
    if (state.currentExercise > 0) {
      state.currentExercise -= 1;
      const prev = currentItem();
      state.currentSet = prev.sets;
      state.phase = "work";
      loadPhase();
    } else {
      state.secondsLeft = item.work;
      state.phaseTotal = item.work;
      updateClockUI();
    }
  }

  function restartExercise() {
    stopTimer();
    state.currentSet = 1;
    state.phase = "work";
    state.running = false;
    loadPhase();
    updatePauseButton();
    toast("Exercise restarted");
  }

  function restartEntireWorkout() {
    startWorkout(true);
    toast("Workout restarted");
  }

  function finishWorkout() {
    stopTimer();
    state.running = false;
    releaseWakeLock();
    const elapsedMs = state.workoutStartedAt ? Date.now() - state.workoutStartedAt : 0;
    const minutes = Math.max(1, Math.round(elapsedMs / 60000));
    const totalSets = state.workout.reduce((sum, x) => sum + x.sets, 0);
    els.completedExercises.textContent = state.workout.length;
    els.completedSets.textContent = totalSets;
    els.completedMinutes.textContent = minutes;
    els.completionSummary.textContent = `You completed ${totalSets} sets across ${state.workout.length} exercise${state.workout.length === 1 ? "" : "s"}.`;
    showView("complete");
    beep(820, 0.12);
    setTimeout(() => beep(980, 0.16), 140);
  }

  function showView(name) {
    els.builderView.classList.toggle("active", name === "builder");
    els.workoutView.classList.toggle("active", name === "workout");
    els.completeView.classList.toggle("active", name === "complete");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(toast._id);
    toast._id = setTimeout(() => els.toast.classList.add("hidden"), 1900);
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[ch]);
  }

  function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, "&#096;");
  }

  function beep(freq = 600, duration = 0.08) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = beep.ctx || (beep.ctx = new AudioCtx());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) state.wakeLock = await navigator.wakeLock.request("screen");
    } catch {}
  }

  async function releaseWakeLock() {
    try {
      if (state.wakeLock) await state.wakeLock.release();
      state.wakeLock = null;
    } catch {}
  }

  function wireEvents() {
    els.exerciseSearch.addEventListener("input", handleSearchInput);
    els.exerciseSearch.addEventListener("focus", () => {
      if (els.exerciseSearch.value.trim().length >= 2) handleSearchInput();
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-field")) hideSuggestions();
    });
    els.clearSelectionBtn.addEventListener("click", clearSelection);
    els.addExerciseBtn.addEventListener("click", addSelectedExercise);
    els.clearWorkoutBtn.addEventListener("click", () => {
      if (!state.workout.length) return;
      if (confirm("Clear the entire workout?")) {
        state.workout = [];
        saveWorkout();
        renderQueue();
      }
    });
    els.startWorkoutBtn.addEventListener("click", () => {
      startWorkout(true);
      state.running = true;
      ensureTimer();
    });
    els.pauseBtn.addEventListener("click", togglePause);
    els.skipBtn.addEventListener("click", advancePhase);
    els.previousBtn.addEventListener("click", previousPhase);
    els.restartExerciseBtn.addEventListener("click", restartExercise);
    els.restartWorkoutBtn.addEventListener("click", restartEntireWorkout);
    els.exitWorkoutBtn.addEventListener("click", () => {
      if (confirm("Exit this workout and return to the builder?")) {
        stopTimer();
        state.running = false;
        releaseWakeLock();
        showView("builder");
      }
    });
    els.repeatWorkoutBtn.addEventListener("click", () => {
      startWorkout(true);
      state.running = true;
      ensureTimer();
    });
    els.backToBuilderBtn.addEventListener("click", () => showView("builder"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.running) requestWakeLock();
    });
  }

  wireEvents();
  renderQueue();
  loadCatalog();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
