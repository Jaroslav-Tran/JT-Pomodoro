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

const timeEl = document.getElementById("time");
const sessionEl = document.getElementById("session");
const statusCopyEl = document.getElementById("status-copy");
const modeLabelEl = document.getElementById("mode-label");
const toggleBtn = document.getElementById("toggle");
const resetBtn = document.getElementById("reset");
const ringProgress = document.querySelector(".ring-progress");
const ringWrap = document.querySelector(".ring-wrap");
const modeButtons = document.querySelectorAll(".mode-btn");

let mode = "focus";
let remaining = DURATIONS.focus;
let total = DURATIONS.focus;
let running = false;
let session = 1;
let completedFocus = 0;
let intervalId = null;
let endsAt = null;

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
  document.title = `${formatTime(remaining)} · ${MODE_LABELS[mode]} · Pomodo`;
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
  stopTicker();
  playChime();
  const next = nextModeAfterComplete();
  setMode(next, { announce: true });
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

function pause() {
  stopTicker();
  render();
}

function toggle() {
  if (running) pause();
  else start();
}

function reset() {
  stopTicker();
  remaining = DURATIONS[mode];
  total = DURATIONS[mode];
  render();
}

function setMode(nextMode, { announce = false } = {}) {
  stopTicker();
  mode = nextMode;
  remaining = DURATIONS[mode];
  total = DURATIONS[mode];

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

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === mode) return;
    setMode(btn.dataset.mode);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }
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
