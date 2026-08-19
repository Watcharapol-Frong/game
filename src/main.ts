import './style.css';
import { BartGameEngine } from './games/game1-bart/engine';
import type { Game1Payload } from './games/game1-bart/types';
import { WcstGameEngine } from './games/game2-wcst/engine';
import type { Game2Payload, WagashiCard, WagashiShape } from './games/game2-wcst/types';
import { MeenFocusEngine } from './games/game3-flanker/engine';
import type { Game3Payload, FlankerTrial, TargetDirection } from './games/game3-flanker/types';
import { KongNeighborhoodEngine } from './games/game4-pgg/engine';
import type { Game4Payload, PggRoundLog } from './games/game4-pgg/types';
import { calculateRadarProfile } from './analytics/pipeline';
import type { CompleteAssessmentPayload, RadarChartOutput } from './analytics/pipeline';

const MAX_PUMPS = 32;
const TOTAL_TRIALS = 20;
const CANVAS_W = 300;
const CANVAS_H = 380;

// ---- Runtime state — Game 1 ----
let engine: BartGameEngine;
let currentPumps = 0;
let isBusy = false;
let savedPayload: Game1Payload | null = null;
let canvasCtx: CanvasRenderingContext2D | null = null;

// ---- Runtime state — Game 2 ----
let wcstEngine: WcstGameEngine;
let wcstBusy = false;
let savedGame2Payload: Game2Payload | null = null;

// ---- Runtime state — Game 3 ----
let flankerEngine: MeenFocusEngine;
let flankerBusy = false;
let flankerTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let savedGame3Payload: Game3Payload | null = null;

// ---- Runtime state — Game 4 ----
let pggEngine: KongNeighborhoodEngine;
let pggBusy = false;
let pggCountdownInterval: ReturnType<typeof setInterval> | null = null;
let pggCountdownTimeout: ReturnType<typeof setTimeout> | null = null;
let savedGame4Payload: Game4Payload | null = null;
let pggLastCumulative = 0;

// ---- Helpers ----
function qs<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

function genSessionId(): string {
  return `sess_ktp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// One shared session ID for every game played in this sitting, so a combined
// summary can be attributed to a single session.
const appSessionId = genSessionId();

function allGamesComplete(): boolean {
  return !!(savedPayload && savedGame2Payload && savedGame3Payload && savedGame4Payload);
}

function combinedResultsButtonHTML(): string {
  if (!allGamesComplete()) return '';
  return `<button id="view-summary-btn" class="btn btn-primary" style="background:var(--gold);box-shadow:0 2px 8px rgba(185,121,32,0.30)">📊 View Combined Results</button>`;
}

function attachCombinedResultsButton(): void {
  qs<HTMLButtonElement>('#view-summary-btn')?.addEventListener('click', renderSessionSummary);
}

// ---- Entry ----
renderIntro();

// ============================================================
// GAME SELECTOR
// ============================================================
function renderIntro() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🧠</div>
        <h1 class="game-title">Psychometric Session</h1>
        <p class="game-subtitle">Select a game to begin</p>
        <div class="game-select-row">
          <button id="game1-btn" class="btn btn-primary" style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="font-size:22px">🌵</span>
            <span style="text-align:left"><strong>Game 1 — Jane's Cactus Care</strong><br><small style="font-weight:400;opacity:.8">Risk tolerance · BART</small></span>
          </button>
          <button id="game2-btn" class="btn btn-secondary" style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="font-size:22px">🍡</span>
            <span style="text-align:left"><strong>Game 2 — Poom's Wagashi Sorting</strong><br><small style="font-weight:400;opacity:.8">Cognitive flexibility · WCST</small></span>
          </button>
          <button id="game3-btn" class="btn btn-secondary" style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="font-size:22px">🎯</span>
            <span style="text-align:left"><strong>Game 3 — Meen's Focus Mode</strong><br><small style="font-weight:400;opacity:.8">Selective attention · Flanker</small></span>
          </button>
          <button id="game4-btn" class="btn btn-secondary" style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="font-size:22px">🤝</span>
            <span style="text-align:left"><strong>Game 4 — Kong's Neighborhood Sprint</strong><br><small style="font-weight:400;opacity:.8">Prosociality · Public Goods Game</small></span>
          </button>
        </div>
        ${combinedResultsButtonHTML()}
        <p class="session-note">Results export as a JSON payload after each session</p>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#game1-btn')!.addEventListener('click', renderGame1Intro);
  qs<HTMLButtonElement>('#game2-btn')!.addEventListener('click', renderGame2Intro);
  qs<HTMLButtonElement>('#game3-btn')!.addEventListener('click', renderGame3Intro);
  qs<HTMLButtonElement>('#game4-btn')!.addEventListener('click', renderGame4Intro);
  attachCombinedResultsButton();
}

// ============================================================
// GAME 1 — INTRO
// ============================================================
function renderGame1Intro() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🌵</div>
        <h1 class="game-title">Jane's Cactus Care</h1>
        <p class="game-subtitle">A Psychometric Session · BART</p>
        <div class="persona-card">
          <p>Jane traded her corporate spreadsheets for cactus soil. Now she runs a small plant
          shop, making gut-feel decisions every day: water more or hold back?</p>
          <p><em>How far do you push before you pull back?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule"><span class="rule-num">1</span>Pump to grow your cactus and earn points.</div>
          <div class="rule"><span class="rule-num">2</span>Bank at any time to lock in what you've earned.</div>
          <div class="rule"><span class="rule-num">3</span>Over-pump and the cactus bursts — those points are gone.</div>
        </div>
        <button id="begin-btn" class="btn btn-primary">Begin Session</button>
        <button id="back-btn" class="btn btn-secondary" style="margin-top:-6px">← Back</button>
        <p class="session-note">20 cacti &nbsp;·&nbsp; no time limit</p>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#begin-btn')!.addEventListener('click', startGame);
  qs<HTMLButtonElement>('#back-btn')!.addEventListener('click', renderIntro);
}

// ============================================================
// TRIAL SCREEN
// ============================================================
function startGame() {
  engine = new BartGameEngine(appSessionId);
  engine.initializeGame();
  currentPumps = 0;
  isBusy = false;

  renderTrialScreen();
}

function renderTrialScreen() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen trial-screen">
      <div class="hud">
        <div class="hud-trial">
          <span class="hud-label">Cactus</span>
          <span class="hud-value" id="trial-num">
            1 <span class="hud-of">of ${TOTAL_TRIALS}</span>
          </span>
        </div>
        <div class="hud-score">
          <span class="hud-label">Total Points</span>
          <span class="hud-value score-num" id="total-score">0</span>
        </div>
      </div>

      <div class="canvas-wrap" id="canvas-wrap">
        <canvas id="cactus-canvas"></canvas>
        <div class="canvas-overlay" id="canvas-overlay" aria-live="assertive" aria-atomic="true"></div>
      </div>

      <div class="pump-progress-wrap">
        <div class="pump-progress-track">
          <div class="pump-progress-fill" id="progress-fill" style="width:0%"></div>
        </div>
        <div class="pump-progress-labels">
          <span>0</span>
          <span>Pumps (max 32)</span>
          <span>32</span>
        </div>
      </div>

      <div class="pump-info">
        <span class="pump-count-val" id="pump-count">0</span>
        <span>pumps</span>
        <span class="pump-info-divider">&nbsp;·&nbsp;</span>
        <span class="unbanked-val" id="unbanked-pts">0</span>
        <span>pts ready</span>
      </div>

      <div class="action-row">
        <button id="pump-btn" class="btn btn-pump">Pump</button>
        <button id="bank-btn" class="btn btn-bank" disabled>Bank</button>
      </div>
    </div>
  `;

  const canvas = qs<HTMLCanvasElement>('#cactus-canvas')!;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = `${CANVAS_W}px`;
  canvas.style.height = `${CANVAS_H}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  canvasCtx = ctx;

  drawCactus(ctx, 0, 'normal');
  updateHUD();

  qs<HTMLButtonElement>('#pump-btn')!.addEventListener('click', handlePump);
  qs<HTMLButtonElement>('#bank-btn')!.addEventListener('click', handleBank);
}

function handlePump() {
  if (isBusy) return;
  isBusy = true;

  const result = engine.pump();
  currentPumps = result.currentPumps;

  if (result.isExploded) {
    drawCactus(canvasCtx!, currentPumps, 'exploded');
    updateHUD();
    showOverlay('💥 Burst! 0 points.', 'overlay-explode');
    shakeCanvas();

    setTimeout(() => {
      hideOverlay();
      removeShake();
      currentPumps = 0;

      if (engine.isGameOver()) {
        renderGameOver();
      } else {
        drawCactus(canvasCtx!, 0, 'normal');
        updateHUD();
        setButtonsEnabled(true, false);
        isBusy = false;
      }
    }, 1500);
  } else {
    drawCactus(canvasCtx!, currentPumps, 'normal');
    updateHUD();
    setButtonsEnabled(true, true);
    isBusy = false;
  }
}

function handleBank() {
  if (isBusy || currentPumps === 0) return;
  isBusy = true;

  const result = engine.bank();
  showOverlay(`✓ Banked ${result.bankedPoints} pts`, 'overlay-bank');

  setTimeout(() => {
    hideOverlay();
    currentPumps = 0;

    if (result.isGameOver) {
      renderGameOver();
    } else {
      drawCactus(canvasCtx!, 0, 'normal');
      updateHUD();
      setButtonsEnabled(true, false);
      isBusy = false;
    }
  }, 1000);
}

function updateHUD() {
  const trialIndex = engine.getCurrentTrialIndex();
  const totalPoints = engine.getTotalPoints();

  const trialEl = qs<HTMLElement>('#trial-num');
  if (trialEl) {
    trialEl.innerHTML = `${trialIndex} <span class="hud-of">of ${TOTAL_TRIALS}</span>`;
  }

  const scoreEl = qs<HTMLElement>('#total-score');
  if (scoreEl) scoreEl.textContent = String(totalPoints);

  const pumpEl = qs<HTMLElement>('#pump-count');
  if (pumpEl) pumpEl.textContent = String(currentPumps);

  const unbankedEl = qs<HTMLElement>('#unbanked-pts');
  if (unbankedEl) unbankedEl.textContent = String(currentPumps);

  const fillEl = qs<HTMLElement>('#progress-fill');
  if (fillEl) {
    const pct = (currentPumps / MAX_PUMPS) * 100;
    fillEl.style.width = `${pct}%`;
    // Color shifts green → amber → red as risk increases
    if (pct < 45) {
      fillEl.style.background = 'var(--accent)';
    } else if (pct < 72) {
      fillEl.style.background = 'var(--gold)';
    } else {
      fillEl.style.background = 'var(--danger)';
    }
  }
}

function setButtonsEnabled(pump: boolean, bank: boolean) {
  const pumpBtn = qs<HTMLButtonElement>('#pump-btn');
  const bankBtn = qs<HTMLButtonElement>('#bank-btn');
  if (pumpBtn) pumpBtn.disabled = !pump;
  if (bankBtn) bankBtn.disabled = !bank;
}

function showOverlay(message: string, cls: string) {
  const el = qs<HTMLElement>('#canvas-overlay');
  if (el) {
    el.className = `canvas-overlay ${cls} visible`;
    el.textContent = message;
  }
}

function hideOverlay() {
  const el = qs<HTMLElement>('#canvas-overlay');
  if (el) el.className = 'canvas-overlay';
}

function shakeCanvas() {
  qs<HTMLElement>('#canvas-wrap')?.classList.add('shaking');
}

function removeShake() {
  qs<HTMLElement>('#canvas-wrap')?.classList.remove('shaking');
}

// ============================================================
// GAME OVER SCREEN
// ============================================================
function renderGameOver() {
  savedPayload = engine.getPayload();
  const m = savedPayload.summaryMetrics;
  const adapt = m.postExplosionAdaptationDelta;
  const adaptStr = adapt === 0 ? '0' : (adapt > 0 ? `+${adapt}` : String(adapt));

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen gameover-screen">
      <div class="gameover-inner">
        <div class="logo-mark">🌵</div>
        <h2 class="gameover-title">Session Complete</h2>
        <p class="gameover-sub">Here's how Jane tended her 20 cacti.</p>

        <div class="metrics-table">
          <div class="metric-row">
            <span class="metric-label">Total Points Earned</span>
            <span class="metric-value gold">${m.totalPointsEarned}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Cacti Survived</span>
            <span class="metric-value">${m.unexplodedTrialsCount} / ${m.totalTrials}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Cacti Burst</span>
            <span class="metric-value danger">${m.explodedTrialsCount}</span>
          </div>
          <div class="metric-row highlight">
            <span class="metric-label">Risk Index <em>(adj. avg pumps)</em></span>
            <span class="metric-value">${m.adjustedAveragePumps}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Overall Avg Pumps</span>
            <span class="metric-value">${m.overallAveragePumps}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Avg Pump Speed</span>
            <span class="metric-value">${m.averagePumpLatencyMs} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Post-Burst Adaptation</span>
            <span class="metric-value">${adaptStr} pumps</span>
          </div>
        </div>

        <div class="gameover-actions">
          <button id="next-game-btn" class="btn btn-primary">Next Game — Poom's Wagashi Sorting →</button>
          ${combinedResultsButtonHTML()}
          <button id="export-btn" class="btn btn-secondary">Export Payload (JSON)</button>
          <button id="replay-btn" class="btn btn-secondary">Play Again</button>
          <button id="home-btn" class="btn btn-secondary">← Game Select</button>
        </div>
        <p class="export-note">JSON payload conforms to Game1Payload (BART) schema.</p>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#next-game-btn')!.addEventListener('click', renderGame2Intro);
  qs<HTMLButtonElement>('#export-btn')!.addEventListener('click', exportJSON);
  qs<HTMLButtonElement>('#replay-btn')!.addEventListener('click', renderGame1Intro);
  qs<HTMLButtonElement>('#home-btn')!.addEventListener('click', renderIntro);
  attachCombinedResultsButton();
}

async function exportJSON() {
  if (!savedPayload) return;
  const btn = qs<HTMLButtonElement>('#export-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  const reset = (label: string) => {
    btn.textContent = label;
    btn.style.opacity = '0.75';
    setTimeout(() => { btn.textContent = 'Export Payload (JSON)'; btn.style.opacity = ''; btn.disabled = false; }, 2000);
  };

  try {
    // @ts-ignore — window.claude is injected by the Artifact runtime
    const dl = await window.claude?.use?.('downloads') ?? null;
    if (!dl) { reset('Download unavailable'); return; }
    const json = JSON.stringify(savedPayload, null, 2);
    await dl.save({ filename: `${savedPayload.sessionId}.json`, data: json });
    reset('Downloaded ✓');
  } catch (err: any) {
    reset(err?.code === 'declined' ? 'Cancelled' : 'Download failed');
  }
}

// ============================================================
// CANVAS — CACTUS RENDERER
// ============================================================
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  r = Math.min(r, w / 2, Math.max(h / 2, 0));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCactus(
  ctx: CanvasRenderingContext2D,
  pumps: number,
  state: 'normal' | 'exploded'
) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  ctx.clearRect(0, 0, W, H);

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.60);
  skyGrad.addColorStop(0, '#B8DCEF');
  skyGrad.addColorStop(1, '#DAEEE4');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Ground
  const groundY = H - 98;
  const groundGrad = ctx.createLinearGradient(0, groundY, 0, H);
  groundGrad.addColorStop(0, '#C9A87A');
  groundGrad.addColorStop(1, '#B08C5E');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundY, W, H - groundY);

  // Small pebbles on ground
  ctx.fillStyle = 'rgba(100, 72, 30, 0.18)';
  const pebbles = [[55,groundY+18],[120,groundY+35],[200,groundY+12],[250,groundY+40],[170,groundY+26],[80,groundY+48]];
  for (const [px, py] of pebbles) {
    ctx.beginPath();
    ctx.ellipse(px, py, 5, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // === Terracotta pot ===
  const cx = W / 2;
  const potTopY = groundY - 6;
  const potBotY = H - 46;
  const potTopHW = 44;
  const potBotHW = 33;
  const rimH = 11;

  // Pot shadow
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.ellipse(cx, potBotY + 6, 32, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pot body
  const potGrad = ctx.createLinearGradient(cx - potTopHW, 0, cx + potTopHW, 0);
  potGrad.addColorStop(0, '#9B4F1A');
  potGrad.addColorStop(0.35, '#C46624');
  potGrad.addColorStop(0.65, '#D4783A');
  potGrad.addColorStop(1, '#9B4F1A');
  ctx.fillStyle = potGrad;
  ctx.beginPath();
  ctx.moveTo(cx - potTopHW, potTopY + rimH);
  ctx.lineTo(cx + potTopHW, potTopY + rimH);
  ctx.lineTo(cx + potBotHW, potBotY);
  ctx.lineTo(cx - potBotHW, potBotY);
  ctx.closePath();
  ctx.fill();

  // Pot rim
  const rimGrad = ctx.createLinearGradient(0, potTopY, 0, potTopY + rimH);
  rimGrad.addColorStop(0, '#E08040');
  rimGrad.addColorStop(1, '#B85C20');
  ctx.fillStyle = rimGrad;
  roundRect(ctx, cx - potTopHW - 4, potTopY, (potTopHW + 4) * 2, rimH, 5);
  ctx.fill();

  // Pot highlight stripe
  ctx.fillStyle = 'rgba(255,180,100,0.18)';
  ctx.beginPath();
  ctx.moveTo(cx - potTopHW + 8, potTopY + rimH + 6);
  ctx.lineTo(cx - potTopHW + 17, potTopY + rimH + 6);
  ctx.lineTo(cx - potBotHW + 8, potBotY - 8);
  ctx.lineTo(cx - potBotHW, potBotY - 8);
  ctx.closePath();
  ctx.fill();

  // Soil top
  ctx.fillStyle = '#4A2B0F';
  roundRect(ctx, cx - potTopHW + 5, potTopY + 3, (potTopHW - 5) * 2, rimH - 4, 3);
  ctx.fill();

  // === Exploded state ===
  if (state === 'exploded') {
    drawBurst(ctx, cx, potTopY - 20);
    return;
  }

  // === Empty / sprout ===
  if (pumps === 0) {
    drawSprout(ctx, cx, potTopY);
    return;
  }

  // === Growing cactus ===
  const progress = pumps / MAX_PUMPS;
  const minH = 28, maxH = 198;
  const bodyH = minH + (maxH - minH) * progress;
  const bodyW = 32 + progress * 8;
  const bodyBottom = potTopY - 2;
  const bodyTop = bodyBottom - bodyH;
  const bodyX = cx - bodyW / 2;

  // Color: healthy green → stressed yellow-green
  const hue = Math.round(148 - progress * 35);
  const sat = Math.round(52 - progress * 12);
  const lum = Math.round(35 - progress * 6);
  const cBase = `hsl(${hue},${sat}%,${lum}%)`;
  const cLight = `hsl(${hue + 8},${sat - 8}%,${lum + 14}%)`;
  const cDark  = `hsl(${hue - 8},${sat + 6}%,${lum - 10}%)`;

  // ---- Arms (appear at 50% capacity) ----
  if (progress > 0.50) {
    const armProg = Math.min(1, (progress - 0.50) / 0.50);
    const armLen  = armProg * 52;
    const armH    = 20;
    const armY    = bodyBottom - bodyH * 0.58;
    const armR    = 9;

    // Left arm body
    ctx.fillStyle = cBase;
    roundRect(ctx, bodyX - armLen, armY - armH / 2, armLen + bodyW * 0.3, armH, armR);
    ctx.fill();
    // Left arm tip (grows upward)
    const leftTipH = armLen * 0.55;
    roundRect(ctx, bodyX - armLen, armY - armH / 2 - leftTipH, armH, leftTipH + armR, armR);
    ctx.fill();

    // Right arm body
    roundRect(ctx, cx + bodyW / 2 - bodyW * 0.3, armY - armH / 2, armLen + bodyW * 0.3, armH, armR);
    ctx.fill();
    // Right arm tip
    roundRect(ctx, cx + bodyW / 2 + armLen - armH, armY - armH / 2 - leftTipH, armH, leftTipH + armR, armR);
    ctx.fill();

    // Arm spines
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const frac = 0.25 + i * 0.25;
      const lx = bodyX - armLen * frac;
      const rx = cx + bodyW / 2 + armLen * frac;
      for (const [bx, dir] of [[lx, -1], [rx, 1]] as [number, number][]) {
        ctx.beginPath(); ctx.moveTo(bx, armY - armH / 2); ctx.lineTo(bx + dir * 5, armY - armH / 2 - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, armY + armH / 2); ctx.lineTo(bx + dir * 5, armY + armH / 2 + 4); ctx.stroke();
      }
    }
  }

  // ---- Main body ----
  const bodyGrad = ctx.createLinearGradient(bodyX, 0, bodyX + bodyW, 0);
  bodyGrad.addColorStop(0,    cDark);
  bodyGrad.addColorStop(0.28, cBase);
  bodyGrad.addColorStop(0.62, cLight);
  bodyGrad.addColorStop(1,    cDark);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, bodyX, bodyTop, bodyW, bodyH, Math.min(bodyW / 2, 15));
  ctx.fill();

  // ---- Spines ----
  ctx.strokeStyle = 'rgba(255,255,255,0.52)';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  const spineRows = Math.max(3, Math.floor(pumps / 2.5));
  for (let i = 0; i < spineRows; i++) {
    const sy = bodyTop + (i + 0.5) * (bodyH / spineRows);
    const offset = (i % 2 === 0) ? 2 : -2;
    ctx.beginPath(); ctx.moveTo(bodyX,          sy + offset); ctx.lineTo(bodyX - 7,          sy + offset - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bodyX,          sy + offset); ctx.lineTo(bodyX - 7,          sy + offset + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bodyX + bodyW, sy - offset); ctx.lineTo(bodyX + bodyW + 7, sy - offset - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bodyX + bodyW, sy - offset); ctx.lineTo(bodyX + bodyW + 7, sy - offset + 3); ctx.stroke();
  }

  // ---- Face ----
  const faceY = bodyTop + bodyH * 0.30;
  ctx.fillStyle = 'rgba(15, 38, 18, 0.70)';
  ctx.beginPath(); ctx.arc(cx - 6, faceY, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, faceY, 2.5, 0, Math.PI * 2); ctx.fill();

  // Mouth
  ctx.strokeStyle = 'rgba(15, 38, 18, 0.70)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (progress < 0.60) {
    ctx.arc(cx, faceY + 7, 5, 0.12 * Math.PI, 0.88 * Math.PI);
  } else if (progress < 0.82) {
    ctx.moveTo(cx - 5, faceY + 8); ctx.lineTo(cx + 5, faceY + 8);
  } else {
    ctx.arc(cx, faceY + 13, 5, 1.12 * Math.PI, 1.88 * Math.PI);
  }
  ctx.stroke();

  // Sweat drop at high risk
  if (progress > 0.78) {
    ctx.fillStyle = 'rgba(80, 170, 230, 0.72)';
    const sx = cx + 13, sy = faceY + 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 6);
    ctx.quadraticCurveTo(sx + 5, sy, sx, sy + 4);
    ctx.quadraticCurveTo(sx - 5, sy, sx, sy - 6);
    ctx.fill();
  }

  // Flower on tip when small
  if (progress < 0.28) {
    drawFlower(ctx, cx, bodyTop - 1);
  }
}

function drawSprout(ctx: CanvasRenderingContext2D, cx: number, potTopY: number) {
  ctx.fillStyle = '#2D6A4F';
  roundRect(ctx, cx - 2.5, potTopY - 18, 5, 18, 2.5);
  ctx.fill();

  ctx.fillStyle = '#40916C';
  ctx.beginPath(); ctx.ellipse(cx - 9, potTopY - 15, 8, 4.5, -0.45, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 9, potTopY - 15, 8, 4.5, 0.45, 0, Math.PI * 2);  ctx.fill();
}

function drawFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const petalColors = ['#FFB3CE', '#FFAEC0', '#FFC8D8', '#FFB8CC', '#FFBAD0'];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = petalColors[i];
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(angle) * 5.5, cy + Math.sin(angle) * 5.5, 4.5, 3, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFD60A';
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
}

function drawBurst(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Warm red wash
  ctx.fillStyle = 'rgba(217, 95, 39, 0.20)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Burst rays
  ctx.strokeStyle = '#D95F27';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  const numRays = 14;
  for (let i = 0; i < numRays; i++) {
    const angle = (i / numRays) * Math.PI * 2;
    const innerR = 14;
    const outerR = 22 + (i % 3) * 14;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.stroke();
  }

  // Debris dots
  ctx.fillStyle = '#D95F27';
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.2;
    const r = 30 + (i % 3) * 12;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Central X
  ctx.strokeStyle = '#D95F27';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 16, cy - 16); ctx.lineTo(cx + 16, cy + 16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 16, cy - 16); ctx.lineTo(cx - 16, cy + 16); ctx.stroke();
}

// ============================================================
// GAME 2 — WCST (Poom's Wagashi Sorting)
// ============================================================

const WCST_TOTAL = 40;

const SHAPE_EMOJI: Record<WagashiShape, string> = {
  flower: '🌸',
  leaf:   '🍃',
  round:  '🟡',
};

function wagashiCardHTML(card: WagashiCard, extraClass = '', index?: number): string {
  const symbols = Array.from({ length: card.count }, () => `<span class="card-symbol">${SHAPE_EMOJI[card.shape]}</span>`).join('');
  const indexPin = index !== undefined ? `<span class="plate-index">${index + 1}</span>` : '';
  return `<div class="wagashi-card color-${card.color} ${extraClass}" role="button" tabindex="0" aria-label="Plate ${index !== undefined ? index + 1 : ''}">${indexPin}<div class="card-symbols">${symbols}</div></div>`;
}

// ---- Game 2 intro screen ----
function renderGame2Intro() {
  const app = document.getElementById('app')!;
  const eng = new WcstGameEngine('_preview');
  const plates = eng.targetPlates;
  const platesHTML = plates.map((p, i) => wagashiCardHTML(p, 'target-plate', i)).join('');

  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🍡</div>
        <h1 class="game-title">Poom's Wagashi Sorting</h1>
        <p class="game-subtitle">A Psychometric Session · WCST</p>
        <div class="persona-card">
          <p>ภูมิ (Poom) left his office job to become a matcha barista. Every day he arranges
          wagashi sweets on paper trays — but the customer's sorting rule changes without warning.</p>
          <p><em>Can you adapt when the rules shift under you?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule"><span class="rule-num">1</span>A wagashi card appears. Sort it onto one of the 3 reference trays.</div>
          <div class="rule"><span class="rule-num">2</span>You'll be told Correct or Incorrect — but never why.</div>
          <div class="rule"><span class="rule-num">3</span>After 6 correct in a row the sorting rule changes silently.</div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;padding:4px 0">
          ${platesHTML}
        </div>
        <button id="begin-wcst-btn" class="btn btn-primary">Begin Session</button>
        <button id="back-btn" class="btn btn-secondary" style="margin-top:-6px">← Back</button>
        <p class="session-note">40 cards &nbsp;·&nbsp; no time limit</p>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#begin-wcst-btn')!.addEventListener('click', startGame2);
  qs<HTMLButtonElement>('#back-btn')!.addEventListener('click', renderIntro);
}

// ---- Start game 2 ----
function startGame2() {
  wcstEngine = new WcstGameEngine(appSessionId);
  const firstCard = wcstEngine.initializeGame();
  wcstBusy = false;
  renderGame2Trial(firstCard);
}

// ---- Game 2 trial screen ----
function renderGame2Trial(card: WagashiCard) {
  const app = document.getElementById('app')!;
  const plates = wcstEngine.targetPlates;
  const trialIdx = wcstEngine.getCurrentTrialIndex();

  const platesHTML = plates
    .map((p, i) => wagashiCardHTML(p, 'target-plate', i))
    .join('');

  app.innerHTML = `
    <div class="screen wcst-trial-screen">
      <div class="hud">
        <div class="hud-trial">
          <span class="hud-label">Card</span>
          <span class="hud-value" id="wcst-trial-num">${trialIdx} <span class="hud-of">of ${WCST_TOTAL}</span></span>
        </div>
        <div class="hud-score">
          <span class="hud-label">Correct</span>
          <span class="hud-value score-num" id="wcst-correct">0</span>
        </div>
      </div>

      <div class="wcst-target-row" id="target-row">
        ${platesHTML}
      </div>

      <div class="wcst-presented-wrap">
        <span class="wcst-presented-label">Sort this wagashi</span>
        <div id="presented-card">${wagashiCardHTML(card, 'presented')}</div>
        <div class="wcst-feedback-row" id="wcst-feedback" aria-live="assertive"></div>
      </div>
    </div>
  `;

  // Attach click handlers to target plates
  document.querySelectorAll<HTMLElement>('#target-row .target-plate').forEach((el, i) => {
    el.addEventListener('click', () => handleGame2Choice(i));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handleGame2Choice(i); });
  });
}

let wcstCorrectCount = 0;

function handleGame2Choice(targetIndex: number) {
  if (wcstBusy) return;
  wcstBusy = true;
  setGame2PlatesDisabled(true);

  const result = wcstEngine.submitChoice(targetIndex);
  if (result.isCorrect) wcstCorrectCount++;

  // Update correct count in HUD
  const correctEl = qs<HTMLElement>('#wcst-correct');
  if (correctEl) correctEl.textContent = String(wcstCorrectCount);

  // Show feedback
  const fb = qs<HTMLElement>('#wcst-feedback');
  if (fb) {
    fb.textContent = result.isCorrect ? '✓ Correct' : '✗ Incorrect';
    fb.className = `wcst-feedback-row ${result.isCorrect ? 'correct' : 'incorrect'}`;
  }

  setTimeout(() => {
    if (result.isGameOver) {
      renderGame2GameOver();
    } else {
      // Update presented card and trial counter
      const presentedEl = qs<HTMLElement>('#presented-card');
      if (presentedEl && result.nextCard) {
        presentedEl.innerHTML = wagashiCardHTML(result.nextCard, 'presented');
      }
      const trialEl = qs<HTMLElement>('#wcst-trial-num');
      if (trialEl) {
        trialEl.innerHTML = `${wcstEngine.getCurrentTrialIndex()} <span class="hud-of">of ${WCST_TOTAL}</span>`;
      }
      if (fb) { fb.textContent = ''; fb.className = 'wcst-feedback-row'; }
      setGame2PlatesDisabled(false);
      wcstBusy = false;
    }
  }, 700);
}

function setGame2PlatesDisabled(disabled: boolean) {
  document.querySelectorAll<HTMLElement>('#target-row .target-plate').forEach((el) => {
    el.setAttribute('aria-disabled', String(disabled));
    (el as any).style.pointerEvents = disabled ? 'none' : '';
    (el as any).style.opacity = disabled ? '0.55' : '';
  });
}

// ---- Game 2 game-over screen ----
function renderGame2GameOver() {
  savedGame2Payload = wcstEngine.getPayload();
  const m = savedGame2Payload.summaryMetrics;
  const peRate = m.totalErrors > 0 ? `${(m.perseverativeErrorRate * 100).toFixed(0)}%` : 'N/A';

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen wcst-gameover-screen">
      <div class="wcst-gameover-inner">
        <div class="logo-mark">🍡</div>
        <h2 class="gameover-title">Session Complete</h2>
        <p class="gameover-sub">Here's how Poom sorted his 40 wagashi.</p>

        <div class="metrics-table">
          <div class="metric-row highlight">
            <span class="metric-label">Categories Completed</span>
            <span class="metric-value gold">${m.categoriesCompleted} / 6</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Total Correct</span>
            <span class="metric-value">${m.totalCorrect} / ${m.totalTrials}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Total Errors</span>
            <span class="metric-value danger">${m.totalErrors}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Perseverative Errors <em>(rigidity)</em></span>
            <span class="metric-value danger">${m.perseverativeErrors} &nbsp;<small style="font-weight:400;color:var(--text-faint)">${peRate}</small></span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Non-Perseverative Errors</span>
            <span class="metric-value">${m.nonPerseverativeErrors}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Trials to First Category</span>
            <span class="metric-value">${m.trialsToFirstCategory}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Failure to Maintain Set</span>
            <span class="metric-value">${m.failureToMaintainSet}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Avg Decision Time</span>
            <span class="metric-value">${m.averageReactionTimeMs} ms</span>
          </div>
        </div>

        <div class="gameover-actions">
          <button id="next-game-btn" class="btn btn-primary">Next Game — Meen's Focus Mode →</button>
          ${combinedResultsButtonHTML()}
          <button id="export-wcst-btn" class="btn btn-secondary">Export Payload (JSON)</button>
          <button id="replay-wcst-btn" class="btn btn-secondary">Play Again</button>
          <button id="home-wcst-btn" class="btn btn-secondary">← Game Select</button>
        </div>
        <p class="export-note">JSON payload conforms to Game2Payload (WCST) schema.</p>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#next-game-btn')!.addEventListener('click', () => {
    wcstCorrectCount = 0;
    renderGame3Intro();
  });
  qs<HTMLButtonElement>('#export-wcst-btn')!.addEventListener('click', exportGame2JSON);
  qs<HTMLButtonElement>('#replay-wcst-btn')!.addEventListener('click', () => {
    wcstCorrectCount = 0;
    renderGame2Intro();
  });
  qs<HTMLButtonElement>('#home-wcst-btn')!.addEventListener('click', renderIntro);
  attachCombinedResultsButton();
}

async function exportGame2JSON() {
  if (!savedGame2Payload) return;
  const btn = qs<HTMLButtonElement>('#export-wcst-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  const reset = (label: string) => {
    btn.textContent = label;
    btn.style.opacity = '0.75';
    setTimeout(() => { btn.textContent = 'Export Payload (JSON)'; btn.style.opacity = ''; btn.disabled = false; }, 2000);
  };

  try {
    // @ts-ignore — window.claude injected by Artifact runtime
    const dl = await window.claude?.use?.('downloads') ?? null;
    if (!dl) { reset('Download unavailable'); return; }
    const json = JSON.stringify(savedGame2Payload, null, 2);
    await dl.save({ filename: `${savedGame2Payload.sessionId}.json`, data: json });
    reset('Downloaded ✓');
  } catch (err: any) {
    reset(err?.code === 'declined' ? 'Cancelled' : 'Download failed');
  }
}

// ============================================================
// GAME 3 — MEEN'S FOCUS MODE (Flanker Task)
// ============================================================

const FLANKER_TOTAL = 48;

function flankerArrowHTML(direction: TargetDirection): string {
  return direction === 'left' ? '←' : '→';
}

function flankerCardRowHTML(trial: FlankerTrial): string {
  const center = trial.targetDirection;
  const flanker: TargetDirection = trial.condition === 'congruent' ? center : (center === 'left' ? 'right' : 'left');
  const cards = [flanker, flanker, center, flanker, flanker];
  return cards
    .map((dir, i) => {
      const isCenter = i === 2;
      const cls = isCenter ? 'flanker-card center-card' : 'flanker-card notification';
      const label = isCenter ? 'Target' : 'Notif';
      return `<div class="${cls}" aria-label="${label}" data-dir="${dir}"><span class="flanker-arrow">${flankerArrowHTML(dir)}</span></div>`;
    })
    .join('');
}

// ---- Game 3 intro screen ----
function renderGame3Intro() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🎯</div>
        <h1 class="game-title">Meen's Focus Mode</h1>
        <p class="game-subtitle">A Psychometric Session · Flanker Task</p>
        <div class="persona-card">
          <p>มีน (Meen) is studying for her university entrance exam. Her phone
          never stops buzzing — every notification pulls her attention away from
          the lesson summary she needs to read.</p>
          <p><em>Can you focus on what matters and ignore the noise?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule"><span class="rule-num">1</span>Five cards appear — focus on the <strong>center card</strong>.</div>
          <div class="rule"><span class="rule-num">2</span>Tap the left/right button (or press <kbd>←</kbd> / <kbd>→</kbd>) to match its arrow.</div>
          <div class="rule"><span class="rule-num">3</span>The surrounding notifications may point a different way — ignore them.</div>
        </div>
        <div class="flanker-demo-row">
          <div class="flanker-card notification"><span class="flanker-arrow">→</span></div>
          <div class="flanker-card notification"><span class="flanker-arrow">→</span></div>
          <div class="flanker-card center-card"><span class="flanker-arrow">←</span></div>
          <div class="flanker-card notification"><span class="flanker-arrow">→</span></div>
          <div class="flanker-card notification"><span class="flanker-arrow">→</span></div>
        </div>
        <button id="begin-flanker-btn" class="btn btn-primary">Begin Session</button>
        <button id="back-btn" class="btn btn-secondary" style="margin-top:-6px">← Back</button>
        <p class="session-note">48 trials &nbsp;·&nbsp; 1.2 s per stimulus</p>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#begin-flanker-btn')!.addEventListener('click', startGame3);
  qs<HTMLButtonElement>('#back-btn')!.addEventListener('click', renderIntro);
}

// ---- Start game 3 ----
function startGame3() {
  flankerEngine = new MeenFocusEngine(appSessionId);
  flankerEngine.initSequence();
  flankerBusy = false;
  flankerTimeoutHandle = null;
  const firstTrial = flankerEngine.startGame();
  startGame3Trial(firstTrial);
}

// ---- Render a trial ----
function renderGame3Trial(trial: FlankerTrial) {
  const app = document.getElementById('app')!;
  const trialIdx = flankerEngine.getCurrentTrialIndex() + 1;
  app.innerHTML = `
    <div class="screen flanker-trial-screen" id="flanker-screen">
      <div class="hud">
        <div class="hud-trial">
          <span class="hud-label">Trial</span>
          <span class="hud-value" id="flanker-trial-num">${trialIdx} <span class="hud-of">of ${FLANKER_TOTAL}</span></span>
        </div>
        <div class="hud-score">
          <span class="hud-label">Condition</span>
          <span class="hud-value" id="flanker-condition" style="font-size:13px;text-transform:capitalize;color:var(--text-faint)">${trial.condition}</span>
        </div>
      </div>
      <div class="flanker-stimulus-area">
        <div class="flanker-card-row" id="flanker-card-row">
          ${flankerCardRowHTML(trial)}
        </div>
        <div class="flanker-key-hint">Tap a side, or press <kbd>←</kbd> / <kbd>→</kbd></div>
        <div class="flanker-feedback" id="flanker-feedback" aria-live="assertive"></div>
      </div>
      <div class="flanker-response-row">
        <button id="flanker-left-btn" class="btn flanker-btn" aria-label="Respond left">←</button>
        <button id="flanker-right-btn" class="btn flanker-btn" aria-label="Respond right">→</button>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#flanker-left-btn')!.addEventListener('click', () => handleFlankerInput('left'));
  qs<HTMLButtonElement>('#flanker-right-btn')!.addEventListener('click', () => handleFlankerInput('right'));
}

// ---- Start a trial (render + set timeout + listen keys) ----
function startGame3Trial(trial: FlankerTrial) {
  renderGame3Trial(trial);
  // Stay busy until the card has actually painted, so a response landing in the gap
  // between render and paint can't be scored against a stale RT clock.
  flankerBusy = true;
  requestAnimationFrame(() => {
    flankerEngine.showStimulus();
    flankerBusy = false;
    document.addEventListener('keydown', handleFlankerKey);
    flankerTimeoutHandle = setTimeout(() => {
      submitFlankerResponse('timeout');
    }, 1200);
  });
}

function handleFlankerInput(response: TargetDirection) {
  if (flankerBusy) return;
  if (flankerTimeoutHandle !== null) { clearTimeout(flankerTimeoutHandle); flankerTimeoutHandle = null; }
  submitFlankerResponse(response);
}

function handleFlankerKey(e: KeyboardEvent) {
  if (flankerBusy) return;
  let response: TargetDirection | null = null;
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') response = 'left';
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') response = 'right';
  if (!response) return;
  e.preventDefault();
  handleFlankerInput(response);
}

function submitFlankerResponse(response: TargetDirection | 'timeout') {
  if (flankerBusy) return;
  flankerBusy = true;
  document.removeEventListener('keydown', handleFlankerKey);

  const result = flankerEngine.handleResponse(response);

  // Show feedback
  const screen = document.getElementById('flanker-screen');
  const fb = document.getElementById('flanker-feedback');
  if (screen && fb) {
    if (result.isCorrect) {
      screen.classList.add('glow-correct');
      fb.textContent = '✓';
      fb.className = 'flanker-feedback feedback-correct';
    } else {
      screen.classList.add('shake-wrong');
      fb.textContent = response === 'timeout' ? '⏱ Time!' : '✗';
      fb.className = 'flanker-feedback feedback-wrong';
    }
  }

  // After feedback (500ms) + ITI (300ms)
  setTimeout(() => {
    if (result.isGameOver) {
      renderGame3GameOver();
    } else {
      startGame3Trial(result.nextTrial!);
    }
  }, 800);
}

// ---- Game 3 game-over screen ----
function renderGame3GameOver() {
  savedGame3Payload = flankerEngine.getPayload();
  const m = savedGame3Payload.summaryMetrics;
  const fxStr = m.flankerEffectMs >= 0 ? `+${m.flankerEffectMs}` : String(m.flankerEffectMs);
  const pesStr = m.postErrorSlowingMs >= 0 ? `+${m.postErrorSlowingMs}` : String(m.postErrorSlowingMs);

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen wcst-gameover-screen">
      <div class="wcst-gameover-inner">
        <div class="logo-mark">🎯</div>
        <h2 class="gameover-title">Session Complete</h2>
        <p class="gameover-sub">Here's how Meen managed distractions.</p>

        <div class="metrics-table">
          <div class="metric-row highlight">
            <span class="metric-label">Overall Accuracy</span>
            <span class="metric-value gold">${m.totalCorrect} / ${m.totalTrials}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Congruent Accuracy</span>
            <span class="metric-value">${(m.congruentAccuracy * 100).toFixed(0)}%</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Incongruent Accuracy</span>
            <span class="metric-value">${(m.incongruentAccuracy * 100).toFixed(0)}%</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Flanker Effect <em>(RT cost)</em></span>
            <span class="metric-value">${fxStr} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Congruent Avg RT</span>
            <span class="metric-value">${m.meanCongruentRtMs} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Incongruent Avg RT</span>
            <span class="metric-value">${m.meanIncongruentRtMs} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Post-Error Slowing</span>
            <span class="metric-value">${pesStr} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Timeouts</span>
            <span class="metric-value ${m.timeouts > 0 ? 'danger' : ''}">${m.timeouts} &nbsp;<small style="font-weight:400;color:var(--text-faint)">(${(m.timeoutRate * 100).toFixed(0)}%)</small></span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Impulsive Errors <em>(&lt;200 ms)</em></span>
            <span class="metric-value ${m.impulsiveErrorCount > 0 ? 'danger' : ''}">${m.impulsiveErrorCount}</span>
          </div>
        </div>

        <div class="gameover-actions">
          <button id="next-game-btn" class="btn btn-primary">Next Game — Kong's Neighborhood Sprint →</button>
          ${combinedResultsButtonHTML()}
          <button id="export-flanker-btn" class="btn btn-secondary">Export Payload (JSON)</button>
          <button id="replay-flanker-btn" class="btn btn-secondary">Play Again</button>
          <button id="home-flanker-btn" class="btn btn-secondary">← Game Select</button>
        </div>
        <p class="export-note">JSON payload conforms to Game3Payload (Flanker) schema.</p>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#next-game-btn')!.addEventListener('click', renderGame4Intro);
  qs<HTMLButtonElement>('#export-flanker-btn')!.addEventListener('click', exportGame3JSON);
  qs<HTMLButtonElement>('#replay-flanker-btn')!.addEventListener('click', renderGame3Intro);
  qs<HTMLButtonElement>('#home-flanker-btn')!.addEventListener('click', renderIntro);
  attachCombinedResultsButton();
}

async function exportGame3JSON() {
  if (!savedGame3Payload) return;
  const btn = qs<HTMLButtonElement>('#export-flanker-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  const reset = (label: string) => {
    btn.textContent = label;
    btn.style.opacity = '0.75';
    setTimeout(() => { btn.textContent = 'Export Payload (JSON)'; btn.style.opacity = ''; btn.disabled = false; }, 2000);
  };

  try {
    // @ts-ignore — window.claude injected by Artifact runtime
    const dl = await window.claude?.use?.('downloads') ?? null;
    if (!dl) { reset('Download unavailable'); return; }
    const json = JSON.stringify(savedGame3Payload, null, 2);
    await dl.save({ filename: `${savedGame3Payload.sessionId}.json`, data: json });
    reset('Downloaded ✓');
  } catch (err: any) {
    reset(err?.code === 'declined' ? 'Cancelled' : 'Download failed');
  }
}

// ============================================================
// GAME 4 — KONG'S NEIGHBORHOOD SPRINT (Public Goods Game)
// ============================================================

const PGG_TOTAL_ROUNDS = 8;
const PGG_ROLE_EMOJI: Record<string, string> = {
  'Conditional Cooperator': '🤔',
  'Stable Cooperator': '🌟',
  'Persistent Free-rider': '😏',
};

// ---- Game 4 intro screen ----
function renderGame4Intro() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🤝</div>
        <h1 class="game-title">Kong's Neighborhood Sprint</h1>
        <p class="game-subtitle">A Psychometric Session · Public Goods Game</p>
        <div class="persona-card">
          <p>พี่ก้อง (Kong) organizes a shared community fund with 3 neighbors every
          sprint. Everyone chips in what they choose — the pooled amount grows, then
          gets split evenly among the whole group.</p>
          <p><em>How much do you contribute when others might not?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule"><span class="rule-num">1</span>Each round you and 3 teammates get 10 coins.</div>
          <div class="rule"><span class="rule-num">2</span>Choose how much to put into the shared pool — the rest you keep.</div>
          <div class="rule"><span class="rule-num">3</span>The pool is multiplied ×1.6 and split evenly among all 4 players.</div>
        </div>
        <button id="begin-pgg-btn" class="btn btn-primary">Begin Session</button>
        <button id="back-btn" class="btn btn-secondary" style="margin-top:-6px">← Back</button>
        <p class="session-note">8 rounds &nbsp;·&nbsp; 10 s per round</p>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#begin-pgg-btn')!.addEventListener('click', startGame4);
  qs<HTMLButtonElement>('#back-btn')!.addEventListener('click', renderIntro);
}

// ---- Start game 4 ----
function startGame4() {
  pggEngine = new KongNeighborhoodEngine(appSessionId);
  pggBusy = false;
  const roundInfo = pggEngine.startRound();
  renderGame4Round(roundInfo);
}

// ---- Render a round (contribution selector + countdown) ----
function renderGame4Round(roundInfo: { roundIndex: number; endowment: number; timeLimitMs: number }) {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div class="screen pgg-trial-screen">
      <div class="hud">
        <div class="hud-trial">
          <span class="hud-label">Round</span>
          <span class="hud-value">${roundInfo.roundIndex} <span class="hud-of">of ${PGG_TOTAL_ROUNDS}</span></span>
        </div>
        <div class="hud-score">
          <span class="hud-label">Cumulative Payoff</span>
          <span class="hud-value score-num" id="pgg-cumulative">${pggLastCumulative}</span>
        </div>
      </div>

      <div class="pgg-countdown-track">
        <div class="pgg-countdown-fill" id="pgg-countdown-fill" style="width:100%"></div>
      </div>

      <div class="pgg-round-body">
        <p class="pgg-endowment-note">You have <strong>${roundInfo.endowment} coins</strong> this round. How much goes into the shared pool?</p>

        <div class="pgg-slider-wrap">
          <div class="pgg-slider-readout">
            <div class="pgg-readout-block">
              <span class="pgg-readout-label">Contribute</span>
              <span class="pgg-readout-val" id="pgg-contrib-val">5</span>
            </div>
            <div class="pgg-readout-block right">
              <span class="pgg-readout-label">Keep</span>
              <span class="pgg-readout-val gold" id="pgg-keep-val">5</span>
            </div>
          </div>
          <input type="range" min="0" max="10" step="1" value="5" id="pgg-slider" class="pgg-slider" />
        </div>

        <button id="pgg-confirm-btn" class="btn btn-primary">Confirm Contribution</button>
      </div>
    </div>
  `;

  const slider = qs<HTMLInputElement>('#pgg-slider')!;
  const contribEl = qs<HTMLElement>('#pgg-contrib-val')!;
  const keepEl = qs<HTMLElement>('#pgg-keep-val')!;
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    contribEl.textContent = String(v);
    keepEl.textContent = String(10 - v);
  });

  qs<HTMLButtonElement>('#pgg-confirm-btn')!.addEventListener('click', () => {
    submitPggRound(Number(slider.value), false);
  });

  // ---- 10s countdown ----
  const startTs = Date.now();
  const fillEl = qs<HTMLElement>('#pgg-countdown-fill')!;
  pggCountdownInterval = setInterval(() => {
    const elapsed = Date.now() - startTs;
    const pct = Math.max(0, 100 * (1 - elapsed / 10000));
    fillEl.style.width = `${pct}%`;
    fillEl.style.background = pct < 25 ? 'var(--danger)' : pct < 55 ? 'var(--gold)' : 'var(--accent)';
  }, 100);
  pggCountdownTimeout = setTimeout(() => {
    submitPggRound(0, true);
  }, 10000);
}

function clearPggCountdown() {
  if (pggCountdownInterval !== null) { clearInterval(pggCountdownInterval); pggCountdownInterval = null; }
  if (pggCountdownTimeout !== null) { clearTimeout(pggCountdownTimeout); pggCountdownTimeout = null; }
}

// ---- Submit a round's contribution ----
function submitPggRound(contribution: number, isTimeout: boolean) {
  if (pggBusy) return;
  pggBusy = true;
  clearPggCountdown();

  const roundLog = pggEngine.submitContribution(contribution, isTimeout);
  pggLastCumulative = roundLog.userCumulativePayoff;
  renderGame4RoundResult(roundLog);
}

// ---- Round result reveal screen ----
function renderGame4RoundResult(roundLog: PggRoundLog) {
  const app = document.getElementById('app')!;
  const isLastRound = pggEngine.isGameOver();

  const aiCardsHTML = roundLog.aiContributions.map((ai) => `
    <div class="pgg-ai-card">
      <span class="pgg-ai-emoji">${PGG_ROLE_EMOJI[ai.role] ?? '🙂'}</span>
      <span class="pgg-ai-name">${ai.name}</span>
      <span class="pgg-ai-role">${ai.role}</span>
      <span class="pgg-ai-coins">${ai.contribution} <small>coins</small></span>
    </div>
  `).join('');

  app.innerHTML = `
    <div class="screen pgg-result-screen">
      <div class="pgg-result-inner">
        <p class="pgg-result-label">Round ${roundLog.roundIndex} Results ${roundLog.isTimeout ? '<span class="danger">(Timed out)</span>' : ''}</p>

        <div class="pgg-ai-panel">
          <div class="pgg-ai-card pgg-ai-card-user">
            <span class="pgg-ai-emoji">🧑</span>
            <span class="pgg-ai-name">You</span>
            <span class="pgg-ai-role">Contributed</span>
            <span class="pgg-ai-coins">${roundLog.userContribution} <small>coins</small></span>
          </div>
          ${aiCardsHTML}
        </div>

        <div class="pgg-pool-math">
          <div class="pgg-pool-row"><span>Total Pool</span><span>${roundLog.totalPool} coins</span></div>
          <div class="pgg-pool-row"><span>× 1.6 Multiplier</span><span>${roundLog.multipliedPool}</span></div>
          <div class="pgg-pool-row"><span>÷ 4 Players (your share)</span><span>${roundLog.individualShare}</span></div>
          <div class="pgg-pool-row highlight"><span>This Round's Payoff</span><span>${roundLog.userRoundPayoff} pts</span></div>
          <div class="pgg-pool-row highlight gold"><span>Cumulative Payoff</span><span>${roundLog.userCumulativePayoff} pts</span></div>
        </div>

        <button id="pgg-continue-btn" class="btn btn-primary">${isLastRound ? 'View Final Results' : 'Continue →'}</button>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#pgg-continue-btn')!.addEventListener('click', () => {
    pggBusy = false;
    if (isLastRound) {
      renderGame4GameOver();
    } else {
      const roundInfo = pggEngine.startRound();
      renderGame4Round(roundInfo);
    }
  });
}

// ---- Game 4 game-over screen ----
function renderGame4GameOver() {
  savedGame4Payload = pggEngine.getPayload();
  const m = savedGame4Payload.summaryMetrics;
  const slopeStr = m.cooperationDecaySlope >= 0 ? `+${m.cooperationDecaySlope}` : String(m.cooperationDecaySlope);
  const sensStr = m.freeRiderSensitivity >= 0 ? `+${m.freeRiderSensitivity}` : String(m.freeRiderSensitivity);

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen wcst-gameover-screen">
      <div class="wcst-gameover-inner">
        <div class="logo-mark">🤝</div>
        <h2 class="gameover-title">Session Complete</h2>
        <p class="gameover-sub">Here's how Kong contributed to the neighborhood fund.</p>

        <div class="metrics-table">
          <div class="metric-row highlight">
            <span class="metric-label">Final Cumulative Payoff</span>
            <span class="metric-value gold">${m.finalCumulativePayoff} pts</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Initial Contribution <em>(baseline trust)</em></span>
            <span class="metric-value">${m.initialContribution} / 10</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Average Contribution</span>
            <span class="metric-value">${m.averageContribution} / 10</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Cooperation Decay Slope</span>
            <span class="metric-value">${slopeStr}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Free-rider Sensitivity</span>
            <span class="metric-value">${sensStr}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Avg Decision Time</span>
            <span class="metric-value">${m.meanDecisionLatencyMs} ms</span>
          </div>
        </div>

        <div class="gameover-actions">
          ${combinedResultsButtonHTML()}
          <button id="export-pgg-btn" class="btn btn-secondary">Export Payload (JSON)</button>
          <button id="replay-pgg-btn" class="btn btn-secondary">Play Again</button>
          <button id="home-pgg-btn" class="btn btn-secondary">← Game Select</button>
        </div>
        <p class="export-note">JSON payload conforms to Game4Payload (PGG) schema.</p>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#export-pgg-btn')!.addEventListener('click', exportGame4JSON);
  qs<HTMLButtonElement>('#replay-pgg-btn')!.addEventListener('click', () => {
    pggLastCumulative = 0;
    renderGame4Intro();
  });
  qs<HTMLButtonElement>('#home-pgg-btn')!.addEventListener('click', renderIntro);
  attachCombinedResultsButton();
}

async function exportGame4JSON() {
  if (!savedGame4Payload) return;
  const btn = qs<HTMLButtonElement>('#export-pgg-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  const reset = (label: string) => {
    btn.textContent = label;
    btn.style.opacity = '0.75';
    setTimeout(() => { btn.textContent = 'Export Payload (JSON)'; btn.style.opacity = ''; btn.disabled = false; }, 2000);
  };

  try {
    // @ts-ignore — window.claude injected by Artifact runtime
    const dl = await window.claude?.use?.('downloads') ?? null;
    if (!dl) { reset('Download unavailable'); return; }
    const json = JSON.stringify(savedGame4Payload, null, 2);
    await dl.save({ filename: `${savedGame4Payload.sessionId}.json`, data: json });
    reset('Downloaded ✓');
  } catch (err: any) {
    reset(err?.code === 'declined' ? 'Cancelled' : 'Download failed');
  }
}

// ============================================================
// COMBINED SESSION SUMMARY — Radar Chart + Full JSON Export
// ============================================================

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawRadarChart(ctx: CanvasRenderingContext2D, size: number, radar: RadarChartOutput) {
  const labels: string[][] = [
    ['Strategic Courage', '& Risk Acumen'],
    ['Cognitive', 'Adaptability', '& Shift'],
    ['Selective Focus', '& Attentional', 'Control'],
    ['Impulse &', 'Quality Control'],
    ['Team', 'Collaboration', '& Social Trust'],
    ['Strategic', 'Resilience', '& Boundaries'],
  ];
  const values = [
    radar.axes.strategicCourage,
    radar.axes.cognitiveAdaptability,
    radar.axes.selectiveFocus,
    radar.axes.impulseControl,
    radar.axes.collaborationTrust,
    radar.axes.strategicResilience,
  ];
  const N = 6;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.30;

  const accent = cssVar('--accent') || '#2D6A4F';
  const gold = cssVar('--gold') || '#B97920';
  const text = cssVar('--text') || '#1B2B1E';
  const textFaint = cssVar('--text-faint') || '#7D9B82';
  const border = cssVar('--border') || 'rgba(45,106,79,0.15)';
  const surface2 = cssVar('--surface-2') || '#F2F8F2';
  const fontBody = cssVar('--font-body') || 'sans-serif';

  function pt(i: number, r: number): [number, number] {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  }

  ctx.clearRect(0, 0, size, size);

  // grid rings
  for (let ring = 1; ring <= 5; ring++) {
    const r = (R * ring) / 5;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const [x, y] = pt(i % N, r);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // spokes + axis labels
  ctx.strokeStyle = border;
  for (let i = 0; i < N; i++) {
    const [x, y] = pt(i, R);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    const [lx, ly] = pt(i, R + 32);
    ctx.fillStyle = text;
    ctx.font = `600 10px ${fontBody}`;
    ctx.textAlign = 'center';
    const lines = labels[i];
    lines.forEach((line, li) => {
      ctx.fillText(line, lx, ly + li * 11 - ((lines.length - 1) * 5.5));
    });
  }

  // data polygon
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const idx = i % N;
    const r = (R * values[idx]) / 100;
    const [x, y] = pt(idx, r);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = accent + '4D';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // data points + value labels
  for (let i = 0; i < N; i++) {
    const r = (R * values[i]) / 100;
    const [x, y] = pt(i, r);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.fillStyle = gold;
    ctx.font = `700 11px ${fontBody}`;
    ctx.textAlign = 'center';
    ctx.fillText(values[i].toFixed(0), x, y - 8);
  }

  // overall index badge
  ctx.fillStyle = surface2;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx - 46, cy - 16, 92, 32, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textFaint;
  ctx.font = `600 8px ${fontBody}`;
  ctx.textAlign = 'center';
  ctx.fillText('OVERALL', cx, cy - 3);
  ctx.fillStyle = gold;
  ctx.font = `700 15px ${fontBody}`;
  ctx.fillText(radar.overallIndex.toFixed(1), cx, cy + 11);
}

function renderSessionSummary() {
  if (!allGamesComplete()) return;

  const inputMetrics: CompleteAssessmentPayload = {
    sessionId: appSessionId,
    game1_bart: savedPayload!.summaryMetrics,
    game2_wcst: savedGame2Payload!.summaryMetrics,
    game3_flanker: savedGame3Payload!.summaryMetrics,
    game4_pgg: savedGame4Payload!.summaryMetrics,
  };
  const radar = calculateRadarProfile(inputMetrics);

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen summary-screen">
      <div class="summary-inner">
        <div class="logo-mark">📊</div>
        <h2 class="gameover-title">Combined Session Results</h2>
        <p class="gameover-sub">6-axis psychometric profile synthesized across all 4 games.</p>

        <div class="summary-canvas-wrap">
          <canvas id="radar-canvas"></canvas>
        </div>

        <div class="metrics-table">
          <div class="metric-row highlight">
            <span class="metric-label">Overall Index</span>
            <span class="metric-value gold">${radar.overallIndex}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Strategic Courage & Risk Acumen</span>
            <span class="metric-value">${radar.axes.strategicCourage}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Cognitive Adaptability & Shift</span>
            <span class="metric-value">${radar.axes.cognitiveAdaptability}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Selective Focus & Attentional Control</span>
            <span class="metric-value">${radar.axes.selectiveFocus}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Impulse & Quality Control</span>
            <span class="metric-value">${radar.axes.impulseControl}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Team Collaboration & Social Trust</span>
            <span class="metric-value">${radar.axes.collaborationTrust}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Strategic Resilience & Boundaries</span>
            <span class="metric-value">${radar.axes.strategicResilience}</span>
          </div>
        </div>

        <div class="gameover-actions">
          <button id="export-summary-btn" class="btn btn-primary">Download Combined JSON</button>
          <button id="home-summary-btn" class="btn btn-secondary">← Game Select</button>
        </div>
        <p class="export-note">Includes all 4 raw payloads (with full trial logs) plus the computed radar profile.</p>
      </div>
    </div>
  `;

  const canvas = qs<HTMLCanvasElement>('#radar-canvas')!;
  const size = 340;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawRadarChart(ctx, size, radar);

  qs<HTMLButtonElement>('#export-summary-btn')!.addEventListener('click', () => exportCombinedJSON(radar));
  qs<HTMLButtonElement>('#home-summary-btn')!.addEventListener('click', renderIntro);
}

async function exportCombinedJSON(radar: RadarChartOutput) {
  const btn = qs<HTMLButtonElement>('#export-summary-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  const reset = (label: string) => {
    btn.textContent = label;
    btn.style.opacity = '0.75';
    setTimeout(() => { btn.textContent = 'Download Combined JSON'; btn.style.opacity = ''; btn.disabled = false; }, 2000);
  };

  const combined = {
    sessionId: appSessionId,
    generatedAt: new Date().toISOString(),
    game1_bart: savedPayload,
    game2_wcst: savedGame2Payload,
    game3_flanker: savedGame3Payload,
    game4_pgg: savedGame4Payload,
    radarProfile: radar,
  };

  try {
    // @ts-ignore — window.claude injected by Artifact runtime
    const dl = await window.claude?.use?.('downloads') ?? null;
    if (!dl) { reset('Download unavailable'); return; }
    const json = JSON.stringify(combined, null, 2);
    await dl.save({ filename: `${appSessionId}_combined_radar.json`, data: json });
    reset('Downloaded ✓');
  } catch (err: any) {
    reset(err?.code === 'declined' ? 'Cancelled' : 'Download failed');
  }
}
