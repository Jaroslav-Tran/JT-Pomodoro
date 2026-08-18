const DURATIONS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

const COPY = {
  focus: "Twenty-five minutes of deep focus.",
  short: "Five minutes to reset and breathe.",
  long: "Fifteen minutes to fully recharge.",
};

const MODE_LABELS = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};

const CIRCUMFERENCE = 2 * Math.PI * 120;
const ADJUST_STEP = 5 * 60;
const MIN_DURATION = 60;
const MAX_DURATION = 90 * 60;

const LOG_KEY = "pomodo-log";
const CATEGORIES_KEY = "pomodo-categories";
const LAST_CATEGORIES_KEY = "pomodo-last-categories";
const DEFAULT_CATEGORIES = [
  "Youtube Automation",
  "Youtube Education",
  "Vibecoding",
  "Job Search",
  "Dancing",
  "Self-Development",
];

const timeEl = document.getElementById("time");
const sessionEl = document.getElementById("session");
const focusNowEl = document.getElementById("focus-now");
const statusCopyEl = document.getElementById("status-copy");
const modeLabelEl = document.getElementById("mode-label");
const toggleBtn = document.getElementById("toggle");
const resetBtn = document.getElementById("reset");
const minusFiveBtn = document.getElementById("minus-five");
const plusFiveBtn = document.getElementById("plus-five");
const ringProgress = document.querySelector(".ring-progress");
const ringWrap = document.querySelector(".ring-wrap");
const modeButtons = document.querySelectorAll(".mode-btn");
const rewardEl = document.getElementById("reward");
const rewardBody = document.getElementById("reward-body");
const rewardCloseBtn = document.getElementById("reward-close");
const intentEl = document.getElementById("intent");
const intentForm = document.getElementById("intent-form");
const intentChips = document.getElementById("intent-chips");
const intentFocus = document.getElementById("intent-focus");
const intentNewCategory = document.getElementById("intent-new-category");
const intentAddCategory = document.getElementById("intent-add-category");
const intentCategoryError = document.getElementById("intent-category-error");
const intentCancel = document.getElementById("intent-cancel");
const logSummaryEl = document.getElementById("log-summary");
const logCategoriesEl = document.getElementById("log-categories");
const logSessionsEl = document.getElementById("log-sessions");
const logRangeButtons = document.querySelectorAll(".log-range-btn");

const FALLBACK_QUOTES = [
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "Small deeds done are better than great deeds planned.", author: "Peter Marshall" },
  { quote: "What you do every day matters more than what you do once in a while.", author: "Gretchen Rubin" },
  { quote: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { quote: "You don't have to be extreme, just consistent.", author: "Unknown" },
];

let rewardRequest = 0;

let mode = "focus";
let remaining = DURATIONS.focus;
let total = DURATIONS.focus;
let running = false;
let session = 1;
let completedFocus = 0;
let intervalId = null;
let endsAt = null;
let currentBlock = { categories: [], focus: "" };
let logRange = "daily";
let intentSelected = new Set();
let intentReady = false;

ringProgress.style.strokeDasharray = String(CIRCUMFERENCE);

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateRing() {
  const progress = 1 - remaining / total;
  ringProgress.style.strokeDashoffset = String(CIRCUMFERENCE * progress);
}

function setCopy(text) {
  statusCopyEl.classList.add("is-updating");
  window.setTimeout(() => {
    statusCopyEl.textContent = text;
    statusCopyEl.classList.remove("is-updating");
  }, 180);
}

function render() {
  timeEl.textContent = formatTime(remaining);
  sessionEl.textContent = `Session ${session}`;
  modeLabelEl.textContent = MODE_LABELS[mode];
  toggleBtn.textContent = running ? "Pause" : remaining === total ? "Start" : "Resume";
  toggleBtn.setAttribute("aria-pressed", String(running));
  toggleBtn.classList.toggle("is-active", running);
  ringWrap.classList.toggle("is-running", running);
  document.body.classList.toggle("is-break", mode !== "focus");
  updateRing();
  minusFiveBtn.disabled = remaining <= MIN_DURATION;
  plusFiveBtn.disabled = remaining >= MAX_DURATION;
  document.title = `${formatTime(remaining)} · ${MODE_LABELS[mode]} · Pomodo`;

  const showFocus = Boolean(currentBlock.focus || currentBlock.categories.length);
  focusNowEl.hidden = !showFocus;
  if (showFocus) {
    const cats = currentBlock.categories.join(", ");
    focusNowEl.textContent = cats
      ? `${cats}${currentBlock.focus ? ` · ${currentBlock.focus}` : ""}`
      : currentBlock.focus;
  }
}

function syncRemainingFromClock() {
  if (!endsAt) return;
  remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

function stopTicker() {
  if (running && endsAt) {
    syncRemainingFromClock();
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  running = false;
  endsAt = null;
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02 + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55 + i * 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + 0.7 + i * 0.08);
    });
  } catch {
    // Audio is optional; ignore if the browser blocks it.
  }
}

function nextModeAfterComplete() {
  if (mode === "focus") {
    completedFocus += 1;
    session += 1;
    return completedFocus % 4 === 0 ? "long" : "short";
  }
  return "focus";
}

function completeSession() {
  const finishedFocus = mode === "focus";
  const completedSeconds = total;
  const block = { ...currentBlock };
  stopTicker();
  playChime();
  if (finishedFocus) {
    saveCompletedFocus(completedSeconds, block);
    currentBlock = { categories: [], focus: "" };
  }
  const next = nextModeAfterComplete();
  setMode(next, { announce: true });
  if (finishedFocus) {
    showReward();
  }
}

function isRewardOpen() {
  return !rewardEl.hidden;
}

function openReward() {
  rewardEl.hidden = false;
  rewardCloseBtn.focus();
}

function closeReward() {
  rewardRequest += 1;
  rewardEl.hidden = true;
  rewardBody.replaceChildren();
}

function pickFallbackQuote() {
  return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

async function fetchQuote() {
  try {
    const data = await fetchJson("https://dummyjson.com/quotes/random");
    if (data.quote) {
      return { quote: data.quote, author: data.author || "Unknown" };
    }
  } catch {
    // Fall through to the local list.
  }
  return pickFallbackQuote();
}

async function fetchMeme() {
  const sources = [
    "https://meme-api.com/gimme/wholesomememes",
    "https://meme-api.com/gimme/ProgrammerHumor",
  ];
  const url = sources[Math.floor(Math.random() * sources.length)];
  try {
    const data = await fetchJson(url);
    if (data?.url && !data.nsfw) {
      return { url: data.url, title: data.title || "A little treat" };
    }
  } catch {
    // Quote fallback is handled by the caller.
  }
  return null;
}

function renderRewardLoading() {
  rewardBody.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "reward-loading";
  loading.textContent = "Fetching your reward…";
  rewardBody.append(loading);
}

function renderQuote(quote, author) {
  rewardBody.replaceChildren();
  const block = document.createElement("blockquote");
  block.className = "reward-quote";
  block.textContent = `“${quote}”`;
  const cite = document.createElement("p");
  cite.className = "reward-author";
  cite.textContent = author ? `— ${author}` : "";
  rewardBody.append(block, cite);
}

function renderMeme(url, title) {
  rewardBody.replaceChildren();
  const img = document.createElement("img");
  img.className = "reward-meme";
  img.alt = title || "Meme";
  img.src = url;
  const caption = document.createElement("p");
  caption.className = "reward-caption";
  caption.textContent = title || "";
  rewardBody.append(img, caption);
}

async function showReward() {
  const requestId = ++rewardRequest;
  renderRewardLoading();
  openReward();

  const wantMeme = Math.random() < 0.5;
  if (wantMeme) {
    const meme = await fetchMeme();
    if (requestId !== rewardRequest || !isRewardOpen()) return;
    if (meme) {
      renderMeme(meme.url, meme.title);
      return;
    }
  }

  const quote = await fetchQuote();
  if (requestId !== rewardRequest || !isRewardOpen()) return;
  renderQuote(quote.quote, quote.author);
}

function tick() {
  syncRemainingFromClock();
  if (remaining <= 0) {
    remaining = 0;
    endsAt = null;
    render();
    completeSession();
    return;
  }
  render();
}

function start() {
  if (running) return;
  running = true;
  endsAt = Date.now() + remaining * 1000;
  render();
  intervalId = window.setInterval(tick, 1000);
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadLog() {
  const data = readJson(LOG_KEY, []);
  return Array.isArray(data) ? data : [];
}

function saveLog(entries) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

function loadCustomCategories() {
  const data = readJson(CATEGORIES_KEY, []);
  return Array.isArray(data) ? data.filter((item) => typeof item === "string") : [];
}

function saveCustomCategories(categories) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

function allCategories() {
  const extras = loadCustomCategories();
  const fromLog = loadLog().flatMap((entry) => entry.categories || []);
  return [...new Set([...DEFAULT_CATEGORIES, ...extras, ...fromLog])];
}

function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date) {
  const start = new Date(date);
  const weekday = start.getDay();
  const diff = weekday === 0 ? 6 : weekday - 1;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function entriesInRange(entries, range) {
  const today = localDay();
  if (range === "daily") return entries.filter((entry) => entry.day === today);
  if (range === "weekly") {
    const start = localDay(startOfWeek(new Date()));
    return entries.filter((entry) => entry.day >= start && entry.day <= today);
  }
  if (range === "monthly") {
    const month = today.slice(0, 7);
    return entries.filter((entry) => entry.day.startsWith(month));
  }
  return entries;
}

function formatMinutes(seconds) {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function saveCompletedFocus(seconds, block) {
  const categories = block.categories?.length ? block.categories : ["Uncategorized"];
  const entries = loadLog();
  entries.push({
    id: Date.now(),
    day: localDay(),
    endedAt: new Date().toISOString(),
    seconds,
    categories,
    focus: block.focus || "",
  });
  saveLog(entries);
  renderLog();
}

function renderLog() {
  const entries = entriesInRange(loadLog(), logRange).slice().reverse();
  const count = entries.length;
  const seconds = entries.reduce((sum, entry) => sum + (entry.seconds || 0), 0);

  logSummaryEl.textContent = count
    ? `${count} Pomodoro${count === 1 ? "" : "s"} · ${formatMinutes(seconds)}`
    : "No completed focus blocks in this period yet.";

  const byCategory = new Map();
  entries.forEach((entry) => {
    const cats = entry.categories?.length ? entry.categories : ["Uncategorized"];
    const share = (entry.seconds || 0) / cats.length;
    cats.forEach((category) => {
      const current = byCategory.get(category) || { seconds: 0, sessions: 0 };
      current.seconds += share;
      current.sessions += 1;
      byCategory.set(category, current);
    });
  });

  logCategoriesEl.replaceChildren();
  [...byCategory.entries()]
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .forEach(([category, stats]) => {
      const sessionShare = count ? Math.round((stats.sessions / count) * 100) : 0;
      const timeShare = seconds ? Math.round((stats.seconds / seconds) * 100) : 0;

      const row = document.createElement("div");
      row.className = "cat-row";

      const top = document.createElement("div");
      top.className = "cat-row-top";
      const name = document.createElement("span");
      name.textContent = category;
      const meta = document.createElement("span");
      meta.className = "cat-row-meta";
      meta.textContent = `${formatMinutes(stats.seconds)} · ${sessionShare}% of sessions`;
      top.append(name, meta);

      const bar = document.createElement("div");
      bar.className = "cat-bar";
      const fill = document.createElement("span");
      fill.style.width = `${timeShare}%`;
      bar.append(fill);

      row.append(top, bar);
      logCategoriesEl.append(row);
    });

  logSessionsEl.replaceChildren();
  entries.forEach((entry) => {
    const cats = entry.categories || [];
    const item = document.createElement("li");
    item.className = "log-session";
    const title = document.createElement("strong");
    title.textContent = entry.focus || cats.join(", ") || "Focus block";
    const meta = document.createElement("span");
    meta.textContent = `${cats.join(" · ")} · ${formatMinutes(entry.seconds)} · ${entry.day}`;
    item.append(title, meta);
    logSessionsEl.append(item);
  });
}

function isIntentOpen() {
  return !intentEl.hidden;
}

function renderChips() {
  intentChips.replaceChildren();
  allCategories().forEach((category) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip${intentSelected.has(category) ? " is-on" : ""}`;
    chip.textContent = category;
    chip.addEventListener("click", () => {
      if (intentSelected.has(category)) intentSelected.delete(category);
      else intentSelected.add(category);
      intentCategoryError.hidden = true;
      renderChips();
    });
    intentChips.append(chip);
  });
}

function openIntent() {
  const last = readJson(LAST_CATEGORIES_KEY, []);
  intentSelected = new Set(Array.isArray(last) ? last.filter((item) => allCategories().includes(item)) : []);
  intentFocus.value = "";
  intentNewCategory.value = "";
  intentCategoryError.hidden = true;
  renderChips();
  intentReady = false;
  intentEl.hidden = false;
  intentEl.classList.add("is-open");
  intentEl.setAttribute("aria-hidden", "false");
  // Ignore the same tap that opened the sheet so it cannot hit Cancel / backdrop.
  window.setTimeout(() => {
    if (intentEl.hidden) return;
    intentReady = true;
    if (!window.matchMedia("(pointer: coarse)").matches) {
      intentFocus.focus();
    }
  }, 400);
}

function closeIntent() {
  intentReady = false;
  intentEl.classList.remove("is-open");
  intentEl.hidden = true;
  intentEl.setAttribute("aria-hidden", "true");
}

function addCustomCategory() {
  const name = intentNewCategory.value.trim();
  if (!name) return;
  const categories = allCategories();
  const exists = categories.find((item) => item.toLowerCase() === name.toLowerCase());
  const finalName = exists || name;
  if (!exists) {
    saveCustomCategories([...loadCustomCategories(), name]);
  }
  intentSelected.add(finalName);
  intentNewCategory.value = "";
  intentCategoryError.hidden = true;
  renderChips();
}

function submitIntent(event) {
  event.preventDefault();
  const focus = intentFocus.value.trim();
  if (!focus) {
    intentFocus.reportValidity();
    return;
  }
  if (intentSelected.size === 0) {
    intentCategoryError.hidden = false;
    return;
  }
  currentBlock = {
    focus,
    categories: [...intentSelected],
  };
  localStorage.setItem(LAST_CATEGORIES_KEY, JSON.stringify(currentBlock.categories));
  closeIntent();
  start();
}

function needsFocusIntent() {
  return mode === "focus" && !currentBlock.focus;
}

function requestStart() {
  if (running) return;
  if (needsFocusIntent()) {
    openIntent();
    return;
  }
  start();
}

function pause() {
  stopTicker();
  render();
}

function toggle() {
  if (running) pause();
  else requestStart();
}

function reset() {
  stopTicker();
  remaining = DURATIONS[mode];
  total = DURATIONS[mode];
  if (mode === "focus") currentBlock = { categories: [], focus: "" };
  render();
}

function adjustDuration(deltaSeconds) {
  const nextRemaining = Math.min(
    MAX_DURATION,
    Math.max(MIN_DURATION, remaining + deltaSeconds)
  );
  const applied = nextRemaining - remaining;
  if (applied === 0) return;

  remaining = nextRemaining;
  total = Math.max(remaining, total + applied);
  DURATIONS[mode] = Math.min(
    MAX_DURATION,
    Math.max(MIN_DURATION, DURATIONS[mode] + applied)
  );

  if (running) {
    endsAt = Date.now() + remaining * 1000;
  }

  render();
}

function setMode(nextMode, { announce = false } = {}) {
  stopTicker();
  mode = nextMode;
  remaining = DURATIONS[mode];
  total = DURATIONS[mode];
  if (mode !== "focus") currentBlock = { categories: [], focus: "" };

  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  if (announce) {
    const done =
      mode === "focus"
        ? "Break over. Ready for another focus block."
        : COPY[mode];
    setCopy(done);
  } else {
    setCopy(COPY[mode]);
  }

  render();
}

toggleBtn.addEventListener("click", toggle);
resetBtn.addEventListener("click", reset);
minusFiveBtn.addEventListener("click", () => adjustDuration(-ADJUST_STEP));
plusFiveBtn.addEventListener("click", () => adjustDuration(ADJUST_STEP));
rewardCloseBtn.addEventListener("click", closeReward);
rewardEl.addEventListener("click", (event) => {
  if (event.target === rewardEl) closeReward();
});
intentCancel.addEventListener("click", () => {
  if (!intentReady) return;
  closeIntent();
});
intentEl.addEventListener("click", (event) => {
  if (!intentReady) return;
  if (event.target === intentEl) closeIntent();
});
intentForm.addEventListener("submit", (event) => {
  if (!intentReady) {
    event.preventDefault();
    return;
  }
  submitIntent(event);
});
intentAddCategory.addEventListener("click", addCustomCategory);
intentNewCategory.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCustomCategory();
  }
});
logRangeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    logRange = btn.dataset.range;
    logRangeButtons.forEach((other) => {
      const active = other === btn;
      other.classList.toggle("is-active", active);
      other.setAttribute("aria-selected", String(active));
    });
    renderLog();
  });
});

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === mode) return;
    setMode(btn.dataset.mode);
  });
});

document.addEventListener("keydown", (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement
  ) {
    return;
  }
  if (event.key === "Escape" && isRewardOpen()) {
    closeReward();
    return;
  }
  if (event.key === "Escape" && isIntentOpen()) {
    closeIntent();
    return;
  }
  if (isRewardOpen() || isIntentOpen()) return;
  if (event.code === "Space") {
    event.preventDefault();
    toggle();
  }
  if (event.key.toLowerCase() === "r") {
    reset();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && running) {
    tick();
  }
});

render();
renderLog();
