import './style.css';
import { BartGameEngine } from './engine';
import type { Game1Payload } from './types';

const MAX_PUMPS = 32;
const TOTAL_TRIALS = 20;
const CANVAS_W = 300;
const CANVAS_H = 380;

// ---- Runtime state ----
let engine: BartGameEngine;
let currentPumps = 0;
let isBusy = false;
let savedPayload: Game1Payload | null = null;
let canvasCtx: CanvasRenderingContext2D | null = null;

// ---- Helpers ----
function qs<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

function genSessionId(): string {
  return `sess_ktp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---- Entry ----
renderIntro();

// ============================================================
// INTRO SCREEN
// ============================================================
function renderIntro() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🌵</div>
        <h1 class="game-title">Jane's Cactus Care</h1>
        <p class="game-subtitle">A Psychometric Session</p>
        <div class="persona-card">
          <p>Jane traded her corporate spreadsheets for cactus soil. Now she runs a small plant
          shop, making gut-feel decisions every day: water more or hold back?</p>
          <p><em>How far do you push before you pull back?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule">
            <span class="rule-num">1</span>
            Pump to grow your cactus and earn points.
          </div>
          <div class="rule">
            <span class="rule-num">2</span>
            Bank at any time to lock in what you've earned.
          </div>
          <div class="rule">
            <span class="rule-num">3</span>
            Over-pump and the cactus bursts — those points are gone.
          </div>
        </div>
        <button id="begin-btn" class="btn btn-primary">Begin Session</button>
        <p class="session-note">20 cacti &nbsp;·&nbsp; no time limit</p>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#begin-btn')!.addEventListener('click', startGame);
}

// ============================================================
// TRIAL SCREEN
// ============================================================
function startGame() {
  engine = new BartGameEngine(genSessionId());
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
          <button id="export-btn" class="btn btn-primary">Export Payload (JSON)</button>
          <button id="replay-btn" class="btn btn-secondary">Play Again</button>
        </div>
        <p class="export-note">JSON payload conforms to Game1Payload (BART) schema.</p>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#export-btn')!.addEventListener('click', exportJSON);
  qs<HTMLButtonElement>('#replay-btn')!.addEventListener('click', renderIntro);
}

function exportJSON() {
  if (!savedPayload) return;
  const json = JSON.stringify(savedPayload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${savedPayload.sessionId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const btn = qs<HTMLButtonElement>('#export-btn');
  if (btn) {
    btn.textContent = 'Downloaded ✓';
    btn.style.opacity = '0.75';
    setTimeout(() => {
      btn.textContent = 'Export Payload (JSON)';
      btn.style.opacity = '';
    }, 2000);
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
