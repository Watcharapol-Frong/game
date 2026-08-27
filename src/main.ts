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
import {
  unlockAudio, isMuted, toggleMuted,
  playPump, playBank, playBurst, playCorrect, playIncorrect, playClick, playComplete,
} from './shared/audio';

import cactusStage0Src from './assets/game1/cactus-stage-0.png';
import cactusStage1Src from './assets/game1/cactus-stage-1.png';
import cactusStage2Src from './assets/game1/cactus-stage-2.png';
import cactusStage3Src from './assets/game1/cactus-stage-3.png';
import cactusStage4Src from './assets/game1/cactus-stage-4.png';
import explosionSmallSrc from './assets/game1/explosion-small.png';
import explosionBigSrc from './assets/game1/explosion-big.webp';
import btnPumpSrc from './assets/game1/btn-pump.png';
import btnBankSrc from './assets/game1/btn-bank.png';
import backgroundSrc from './assets/game1/background.jpg';
import iconCoinSrc from './assets/game1/icon-coin.png';
import iconWaterSrc from './assets/game1/icon-water.png';

import wagashiFlowerSrc from './assets/game2/wagashi-flower.webp';
import wagashiLeafSrc from './assets/game2/wagashi-leaf.webp';
import wagashiRoundSrc from './assets/game2/wagashi-round.webp';
import trayGreenSrc from './assets/game2/tray_green.webp';
import trayBlueSrc from './assets/game2/tray_blue.webp';
import trayRedSrc from './assets/game2/tray_red.webp';
import wcstIconCorrectSrc from './assets/game2/icon-correct.webp';
import wcstIconIncorrectSrc from './assets/game2/icon-incorrect.webp';
import wcstBackgroundSrc from './assets/game2/background.webp';

import flankerBackgroundSrc from './assets/game3/background.webp';
import flankerArrowLeftSrc from './assets/game3/arrow-left.webp';
import flankerArrowRightSrc from './assets/game3/arrow-right.webp';
import flankerFixationSrc from './assets/game3/fixation-cross.webp';
import flankerBtnLeftSrc from './assets/game3/btn-left.webp';
import flankerBtnRightSrc from './assets/game3/btn-right.webp';
import flankerTimeoutSrc from './assets/game3/timeout.webp';

import pggBackgroundStartSrc from './assets/game4/background-start.webp';
import pggBackgroundThrivingSrc from './assets/game4/background-thriving.webp';
import pggBackgroundDecliningSrc from './assets/game4/background-declining.webp';
import pggAvatarMaleeSrc from './assets/game4/avatar-malee.webp';
import pggAvatarEkSrc from './assets/game4/avatar-ek.webp';
import pggAvatarBoySrc from './assets/game4/avatar-boy.webp';
import pggAvatarPlayerSrc from './assets/game4/avatar-player.webp';
import pggCoinSrc from './assets/game4/coin.webp';
import pggSliderPlusSrc from './assets/game4/slider-plus.webp';
import pggSliderMinusSrc from './assets/game4/slider-minus.webp';

// Fixed aiId->role mapping lives in the engine; this only decides the display
// name/portrait shown for each role, so it's safe to keep separate from the
// exported payload's underlying "AI 1"/"AI 2"/"AI 3" data.
const PGG_ROLE_INFO: Record<string, { displayName: string; avatar: string }> = {
  'Stable Cooperator': { displayName: 'ป้ามาลี', avatar: pggAvatarMaleeSrc },
  'Conditional Cooperator': { displayName: 'พี่เอก', avatar: pggAvatarEkSrc },
  'Persistent Free-rider': { displayName: 'บอย', avatar: pggAvatarBoySrc },
};

const wagashiShapeSrc: Record<WagashiShape, string> = {
  flower: wagashiFlowerSrc,
  leaf: wagashiLeafSrc,
  round: wagashiRoundSrc,
};
const wagashiTraySrc: Record<'green' | 'blue' | 'red', string> = {
  green: trayGreenSrc,
  blue: trayBlueSrc,
  red: trayRedSrc,
};

const flankerArrowSrc: Record<TargetDirection, string> = {
  left: flankerArrowLeftSrc,
  right: flankerArrowRightSrc,
};

const assetSources = {
  cactusStage0: cactusStage0Src,
  cactusStage1: cactusStage1Src,
  cactusStage2: cactusStage2Src,
  cactusStage3: cactusStage3Src,
  cactusStage4: cactusStage4Src,
  explosionSmall: explosionSmallSrc,
  explosionBig: explosionBigSrc,
  btnPumpImg: btnPumpSrc,
  btnBankImg: btnBankSrc,
  backgroundImg: backgroundSrc,
  iconCoin: iconCoinSrc,
  iconWater: iconWaterSrc,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let assets: { [K in keyof typeof assetSources]: HTMLImageElement } | null = null;
const assetsReady: Promise<void> = (async () => {
  const keys = Object.keys(assetSources) as (keyof typeof assetSources)[];
  const loaded = await Promise.all(keys.map((k) => loadImage(assetSources[k])));
  assets = Object.fromEntries(keys.map((k, i) => [k, loaded[i]])) as typeof assets extends infer T
    ? NonNullable<T>
    : never;
})();

// NOTE: the UI deliberately does not know or show the burst ceiling. Exposing
// it (as a "max 32" label or a bar filling toward it) hands players the optimal
// stopping point — for a uniform 1..32 threshold that is exactly 16 pumps, i.e.
// a half-full bar — which would make adjustedAveragePumps measure whether they
// spotted that cue rather than their actual risk appetite. The cactus art
// (growing, then sweating at the top stage) carries the risk feedback instead,
// matching how the original BART leaves the ceiling to be learned by experience.
const TOTAL_TRIALS = 20;
const CANVAS_W = 300; // fallback only; the live width is measured from the card
const CANVAS_H = 380;
// Actual CSS-pixel width of the trial canvas, set when the screen renders.
let canvasW = CANVAS_W;

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

// ---- Audio ----

// Browsers block audio until a real user gesture, so the first click anywhere
// unlocks the context. Kept as a capture-phase listener so it runs before the
// handler that may want to play a sound on that same click.
document.addEventListener('pointerdown', () => unlockAudio(), { capture: true });

function renderMuteButton(): void {
  let btn = qs<HTMLButtonElement>('#mute-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'mute-btn';
    btn.className = 'mute-btn';
    document.body.appendChild(btn);
    btn.addEventListener('click', () => {
      toggleMuted();
      syncMuteButton();
    });
  }
  syncMuteButton();
}

function syncMuteButton(): void {
  const btn = qs<HTMLButtonElement>('#mute-btn');
  if (!btn) return;
  const off = isMuted();
  btn.textContent = off ? '🔇' : '🔊';
  btn.setAttribute('aria-label', off ? 'Unmute sound' : 'Mute sound');
  btn.setAttribute('aria-pressed', String(off));
  btn.classList.toggle('is-muted', off);
}

// ---- Entry ----
renderMuteButton();
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
        <h1 class="game-title">4 Little Games</h1>
        <p class="game-subtitle">Pick a game to start playing</p>
        <div class="game-select-row">
          <button id="game1-btn" class="btn btn-primary" style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="font-size:22px">🌵</span>
            <span style="text-align:left"><strong>Game 1: Jane's Cactus Care</strong><br><small style="font-weight:400;opacity:.8">How much risk do you take?</small></span>
          </button>
          <button id="game2-btn" class="btn btn-secondary" style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="font-size:22px">🍡</span>
            <span style="text-align:left"><strong>Game 2: Poom's Wagashi Sorting</strong><br><small style="font-weight:400;opacity:.8">Adapt when the rules change</small></span>
          </button>
          <button id="game3-btn" class="btn btn-secondary" style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="font-size:22px">🎯</span>
            <span style="text-align:left"><strong>Game 3: Meen's Focus Mode</strong><br><small style="font-weight:400;opacity:.8">Stay focused, ignore the noise</small></span>
          </button>
          <button id="game4-btn" class="btn btn-secondary" style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span style="font-size:22px">🤝</span>
            <span style="text-align:left"><strong>Game 4: Kong's Neighborhood Sprint</strong><br><small style="font-weight:400;opacity:.8">Share and work with others</small></span>
          </button>
        </div>
        ${combinedResultsButtonHTML()}
        <p class="session-note">No right or wrong answers, just play naturally</p>
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
        <p class="game-subtitle">Take it slow, or go for it?</p>
        <div class="persona-card">
          <p>Jane traded her corporate spreadsheets for cactus soil. Now she runs a small plant
          shop, making gut-feel decisions every day: water more or hold back?</p>
          <p><em>How far do you push before you pull back?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule"><span class="rule-num">1</span>Pump to grow your cactus and earn points.</div>
          <div class="rule"><span class="rule-num">2</span>Bank at any time to lock in what you've earned.</div>
          <div class="rule"><span class="rule-num">3</span>Over-pump and the cactus bursts, and those points are gone.</div>
        </div>
        <button id="begin-btn" class="btn btn-primary">Start</button>
        <button id="back-btn" class="btn btn-secondary" style="margin-top:-6px">Back</button>
        <p class="session-note">20 cacti, no time limit</p>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#begin-btn')!.addEventListener('click', startGame);
  qs<HTMLButtonElement>('#back-btn')!.addEventListener('click', renderIntro);
}

// ============================================================
// TRIAL SCREEN
// ============================================================
async function startGame() {
  engine = new BartGameEngine(appSessionId);
  engine.initializeGame();
  currentPumps = 0;
  isBusy = false;

  await assetsReady;
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
          <span class="hud-value score-num icon-value">
            <img src="${assets!.iconCoin.src}" class="hud-inline-icon" alt="" />
            <span id="total-score">0</span>
          </span>
        </div>
      </div>

      <div class="canvas-wrap" id="canvas-wrap">
        <canvas id="cactus-canvas"></canvas>
        <div class="canvas-overlay" id="canvas-overlay" aria-live="assertive" aria-atomic="true"></div>
      </div>

      <div class="pump-info">
        <img src="${assets!.iconWater.src}" class="hud-inline-icon" alt="Pumps" />
        <span class="pump-count-val" id="pump-count">0</span>
        <span class="pump-info-divider">&nbsp;·&nbsp;</span>
        <img src="${assets!.iconCoin.src}" class="hud-inline-icon" alt="Coins" />
        <span class="unbanked-val" id="unbanked-pts">0</span>
      </div>

      <div class="action-row">
        <button id="pump-btn" class="btn-img-action"><img src="${assets!.btnPumpImg.src}" alt="Pump" /></button>
        <button id="bank-btn" class="btn-img-action" disabled><img src="${assets!.btnBankImg.src}" alt="Bank" /></button>
      </div>
    </div>
  `;

  const canvas = qs<HTMLCanvasElement>('#cactus-canvas')!;
  const wrap = qs<HTMLElement>('#canvas-wrap')!;
  // Fill the card's full width so the background art reaches both edges
  // (the wrap's own background used to show through as bars on the sides).
  canvasW = Math.round(wrap.clientWidth) || CANVAS_W;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvasW * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = `${canvasW}px`;
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
    // The burst art carries the moment on its own — no text overlay or tint.
    playBurst();
    shakeCanvas();

    setTimeout(() => {
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
    // Pitch climbs with the plant so later pumps sound more strained. Scaled
    // against the stage bands, not the hidden ceiling, so it leaks nothing.
    playPump(Math.min(1, (getCactusStage(currentPumps) - 1) / 3));
    setButtonsEnabled(true, true);
    isBusy = false;
  }
}

function handleBank() {
  if (isBusy || currentPumps === 0) return;
  isBusy = true;

  const result = engine.bank();
  playBank();
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
  playComplete();
  savedPayload = engine.getPayload();
  const m = savedPayload.summaryMetrics;

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen gameover-screen">
      <div class="gameover-inner">
        <div class="logo-mark">🌵</div>
        <h2 class="gameover-title">All Done!</h2>
        <p class="gameover-sub">Here's how Jane tended her 20 cacti.</p>

        <div class="metrics-table">
          <div class="metric-row">
            <span class="metric-label">Total Points Earned</span>
            <span class="metric-value gold">${m.totalPointsEarned}</span>
          </div>
          <div class="metric-row highlight">
            <span class="metric-label">How Much Risk You Took</span>
            <span class="metric-value">${m.adjustedAveragePumps}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Cacti Burst</span>
            <span class="metric-value danger">${m.explodedTrialsCount} / ${m.totalTrials}</span>
          </div>
        </div>

        <div class="gameover-actions">
          <button id="next-game-btn" class="btn btn-primary">Next: Poom's Wagashi Sorting</button>
          ${combinedResultsButtonHTML()}
          <button id="replay-btn" class="btn btn-secondary">Play Again</button>
          <button id="home-btn" class="btn btn-secondary">Game Select</button>
        </div>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#next-game-btn')!.addEventListener('click', renderGame2Intro);
  qs<HTMLButtonElement>('#replay-btn')!.addEventListener('click', renderGame1Intro);
  qs<HTMLButtonElement>('#home-btn')!.addEventListener('click', renderIntro);
  attachCombinedResultsButton();
}

// ============================================================
// CANVAS — CACTUS RENDERER (image-based)
// ============================================================

// pumps 0 -> empty pot; 1-8/9-16/17-24/25-32 -> growth stages 1-4
function getCactusStage(pumps: number): 0 | 1 | 2 | 3 | 4 {
  if (pumps <= 0) return 0;
  if (pumps <= 8) return 1;
  if (pumps <= 16) return 2;
  if (pumps <= 24) return 3;
  return 4;
}

interface ImageMetrics {
  // Bounding box of non-transparent pixels, in source-image pixels.
  x: number; y: number; w: number; h: number;
  // Width and centre-x of the widest row in the bottom band of that content —
  // for the plant art this is the pot, which is what should stay a consistent
  // size across stages (the cactus above it varies a lot).
  baseW: number;
  baseCx: number;
}

const imageMetricsCache = new Map<HTMLImageElement, ImageMetrics>();

// Art files carry wildly different amounts of transparent padding (the empty
// pot has 21% dead space below it, the cactus stages only 4%), so anchoring by
// raw image edges makes some stages float and renders them at inconsistent
// scales. Measure the real content instead.
function getImageMetrics(img: HTMLImageElement): ImageMetrics {
  const cached = imageMetricsCache.get(img);
  if (cached) return cached;

  let metrics: ImageMetrics = {
    x: 0, y: 0, w: img.width, h: img.height,
    baseW: img.width, baseCx: img.width / 2,
  };

  try {
    const off = document.createElement('canvas');
    off.width = img.width;
    off.height = img.height;
    const octx = off.getContext('2d', { willReadFrequently: true })!;
    octx.drawImage(img, 0, 0);
    const data = octx.getImageData(0, 0, img.width, img.height).data;
    const alphaAt = (x: number, y: number) => data[(y * img.width + x) * 4 + 3];

    let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (alphaAt(x, y) > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX >= minX && maxY >= minY) {
      const bandTop = Math.max(minY, maxY - Math.round(img.height * 0.12));
      let baseW = 0;
      let baseCx = (minX + maxX) / 2;
      for (let y = bandTop; y <= maxY; y++) {
        let rowMin = img.width, rowMax = -1;
        for (let x = 0; x < img.width; x++) {
          if (alphaAt(x, y) > 10) {
            if (x < rowMin) rowMin = x;
            if (x > rowMax) rowMax = x;
          }
        }
        if (rowMax >= rowMin && rowMax - rowMin + 1 > baseW) {
          baseW = rowMax - rowMin + 1;
          baseCx = (rowMin + rowMax) / 2;
        }
      }
      metrics = {
        x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
        baseW: baseW || maxX - minX + 1,
        baseCx,
      };
    }
  } catch {
    // getImageData can throw on a tainted canvas; fall back to raw image bounds.
  }

  imageMetricsCache.set(img, metrics);
  return metrics;
}

// Draws the plant so its pot is `potWidth` wide, horizontally centred on
// `centerX`, with the visible bottom of the art resting exactly on `groundY`.
function drawPlant(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerX: number,
  groundY: number,
  potWidth: number,
) {
  const m = getImageMetrics(img);
  const scale = potWidth / m.baseW;
  ctx.drawImage(
    img,
    centerX - m.baseCx * scale,
    groundY - (m.y + m.h) * scale,
    img.width * scale,
    img.height * scale,
  );
}

// Draws a radial burst centred on a point, sized by its visible content.
function drawBurst(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerX: number,
  centerY: number,
  width: number,
) {
  const m = getImageMetrics(img);
  const scale = width / m.w;
  ctx.drawImage(
    img,
    centerX - (m.x + m.w / 2) * scale,
    centerY - (m.y + m.h / 2) * scale,
    img.width * scale,
    img.height * scale,
  );
}

// Scale-to-cover (like CSS `background-size: cover`): fills the canvas
// completely, center-cropping whichever axis overflows, so the art always
// reaches every edge without distortion at any canvas size.
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
}

function drawCactus(
  ctx: CanvasRenderingContext2D,
  pumps: number,
  state: 'normal' | 'exploded',
) {
  if (!assets) return;
  const W = canvasW;
  const H = CANVAS_H;
  ctx.clearRect(0, 0, W, H);
  drawImageCover(ctx, assets.backgroundImg, W, H);

  const cx = W / 2;
  // The tabletop surface line in the background art.
  const groundY = H * 0.815;
  const stage = getCactusStage(pumps);

  if (state === 'exploded') {
    const explosionImg = stage <= 2 ? assets.explosionSmall : assets.explosionBig;
    const burstW = stage <= 2 ? 190 : 250;
    // Centred just above the tabletop, where the plant was.
    drawBurst(ctx, explosionImg, cx, groundY - burstW * 0.28, burstW);
    return;
  }

  const stageImages = [
    assets.cactusStage0,
    assets.cactusStage1,
    assets.cactusStage2,
    assets.cactusStage3,
    assets.cactusStage4,
  ];
  // The empty pot is drawn with a much wider rim relative to its base than the
  // cactus-sheet pots, so it needs a smaller base target to read the same size.
  const potWidths = [70, 84, 84, 84, 84];
  drawPlant(ctx, stageImages[stage], cx, groundY, potWidths[stage]);
}


// ============================================================
// GAME 2 — WCST (Poom's Wagashi Sorting)
// ============================================================

const WCST_TOTAL = 40;

function wagashiCardHTML(card: WagashiCard, extraClass = '', index?: number): string {
  const shapeSrc = wagashiShapeSrc[card.shape];
  const symbols = Array.from({ length: card.count }, () => `<img class="card-symbol-img" src="${shapeSrc}" alt="">`).join('');
  const indexPin = index !== undefined ? `<span class="plate-index">${index + 1}</span>` : '';
  const traySrc = wagashiTraySrc[card.color];
  return `<div class="wagashi-card ${extraClass}" style="background-image:url('${traySrc}')" role="button" tabindex="0" aria-label="Plate ${index !== undefined ? index + 1 : ''}">${indexPin}<div class="card-symbols">${symbols}</div></div>`;
}

// ---- Game 2 intro screen ----
function renderGame2Intro() {
  const app = document.getElementById('app')!;
  const eng = new WcstGameEngine('_preview');
  const plates = eng.targetPlates;
  const platesHTML = plates.map((p, i) => wagashiCardHTML(p, 'target-plate intro-preview-plate', i)).join('');

  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🍡</div>
        <h1 class="game-title">Poom's Wagashi Sorting</h1>
        <p class="game-subtitle">Watch the rules, they might change</p>
        <div class="persona-card">
          <p>ภูมิ (Poom) left his office job to become a matcha barista. Every day he arranges
          wagashi sweets on paper trays, but the customer's sorting rule changes without warning.</p>
          <p><em>Can you adapt when the rules shift under you?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule"><span class="rule-num">1</span>A wagashi card appears. Sort it onto one of the 3 reference trays.</div>
          <div class="rule"><span class="rule-num">2</span>You'll be told Correct or Incorrect, but never why.</div>
          <div class="rule"><span class="rule-num">3</span>After 6 correct in a row the sorting rule changes silently.</div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;padding:4px 0">
          ${platesHTML}
        </div>
        <button id="begin-wcst-btn" class="btn btn-primary">Start</button>
        <button id="back-btn" class="btn btn-secondary" style="margin-top:-6px">Back</button>
        <p class="session-note">40 cards, no time limit</p>
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
    <div class="screen wcst-trial-screen" style="background-image:url('${wcstBackgroundSrc}')">
      <div class="hud hud-overlay">
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
        <div class="wcst-feedback-overlay" id="wcst-feedback" aria-live="assertive"></div>
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
  if (result.isCorrect) playCorrect(); else playIncorrect();
  const fb = qs<HTMLElement>('#wcst-feedback');
  if (fb) {
    const icon = result.isCorrect ? wcstIconCorrectSrc : wcstIconIncorrectSrc;
    const label = result.isCorrect ? 'Correct' : 'Incorrect';
    fb.innerHTML = `<img class="wcst-feedback-icon" src="${icon}" alt="${label}">`;
    fb.className = `wcst-feedback-overlay ${result.isCorrect ? 'correct' : 'incorrect'}`;
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
      if (fb) { fb.innerHTML = ''; fb.className = 'wcst-feedback-overlay'; }
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
  playComplete();
  savedGame2Payload = wcstEngine.getPayload();
  const m = savedGame2Payload.summaryMetrics;
  const peRate = m.totalErrors > 0 ? `${(m.perseverativeErrorRate * 100).toFixed(0)}%` : 'N/A';

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen wcst-gameover-screen">
      <div class="wcst-gameover-inner">
        <div class="logo-mark">🍡</div>
        <h2 class="gameover-title">All Done!</h2>
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
            <span class="metric-label">Stuck on the Old Rule</span>
            <span class="metric-value danger">${m.perseverativeErrors} &nbsp;<small style="font-weight:400;color:var(--text-faint)">${peRate}</small></span>
          </div>
        </div>

        <div class="gameover-actions">
          <button id="next-game-btn" class="btn btn-primary">Next: Meen's Focus Mode</button>
          ${combinedResultsButtonHTML()}
          <button id="replay-wcst-btn" class="btn btn-secondary">Play Again</button>
          <button id="home-wcst-btn" class="btn btn-secondary">Game Select</button>
        </div>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#next-game-btn')!.addEventListener('click', () => {
    wcstCorrectCount = 0;
    renderGame3Intro();
  });
  qs<HTMLButtonElement>('#replay-wcst-btn')!.addEventListener('click', () => {
    wcstCorrectCount = 0;
    renderGame2Intro();
  });
  qs<HTMLButtonElement>('#home-wcst-btn')!.addEventListener('click', renderIntro);
  attachCombinedResultsButton();
}

// ============================================================
// GAME 3 — MEEN'S FOCUS MODE (Flanker Task)
// ============================================================

const FLANKER_TOTAL = 48;

function flankerArrowImgHTML(direction: TargetDirection): string {
  return `<img class="flanker-arrow-img" src="${flankerArrowSrc[direction]}" alt="${direction === 'left' ? '←' : '→'}">`;
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
      return `<div class="${cls}" aria-label="${label}" data-dir="${dir}">${flankerArrowImgHTML(dir)}</div>`;
    })
    .join('');
}

/** Fixation cross shown briefly before each trial's arrows, to anchor gaze at a
 *  consistent point so the stimulus's onset location is never a surprise. */
function flankerFixationHTML(): string {
  return `<div class="flanker-card-row flanker-fixation-row"><img class="flanker-fixation-img" src="${flankerFixationSrc}" alt="Get ready"></div>`;
}

// ---- Game 3 intro screen ----
function renderGame3Intro() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🎯</div>
        <h1 class="game-title">Meen's Focus Mode</h1>
        <p class="game-subtitle">Block out the noise</p>
        <div class="persona-card">
          <p>มีน (Meen) is studying for her university entrance exam. Her phone
          never stops buzzing, and every notification pulls her attention away from
          the lesson summary she needs to read.</p>
          <p><em>Can you focus on what matters and ignore the noise?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule"><span class="rule-num">1</span>Five cards appear, focus on the <strong>center card</strong>.</div>
          <div class="rule"><span class="rule-num">2</span>Tap the left or right button (or press <kbd>←</kbd> or <kbd>→</kbd>) to match its arrow.</div>
          <div class="rule"><span class="rule-num">3</span>The surrounding notifications may point a different way, ignore them.</div>
        </div>
        <div class="flanker-demo-row">
          <div class="flanker-card notification">${flankerArrowImgHTML('right')}</div>
          <div class="flanker-card notification">${flankerArrowImgHTML('right')}</div>
          <div class="flanker-card center-card">${flankerArrowImgHTML('left')}</div>
          <div class="flanker-card notification">${flankerArrowImgHTML('right')}</div>
          <div class="flanker-card notification">${flankerArrowImgHTML('right')}</div>
        </div>
        <button id="begin-flanker-btn" class="btn btn-primary">Start</button>
        <button id="back-btn" class="btn btn-secondary" style="margin-top:-6px">Back</button>
        <p class="session-note">48 rounds, react quickly</p>
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
  renderGame3Shell();
  const firstTrial = flankerEngine.startGame();
  startGame3Trial(firstTrial);
}

// A 250-450ms cross before each trial anchors gaze at a fixed point, so the
// arrows' onset location never surprises the participant mid-scan.
const FLANKER_FIXATION_MS = 350;

// ---- Build the trial screen once per session ----
// Everything that doesn't change between trials (background, HUD chrome,
// response buttons) is only ever written to the DOM here. Re-writing the whole
// screen on every trial - including the background image - was causing a
// visible flash each time; now only the small bits that actually change
// (trial number, condition label, the stimulus itself) get updated in place.
function renderGame3Shell() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen flanker-trial-screen" id="flanker-screen" style="background-image:url('${flankerBackgroundSrc}')">
      <div class="hud hud-overlay">
        <div class="hud-trial">
          <span class="hud-label">Round</span>
          <span class="hud-value" id="flanker-trial-num">1 <span class="hud-of">of ${FLANKER_TOTAL}</span></span>
        </div>
      </div>
      <div class="flanker-stimulus-area">
        <div id="flanker-stimulus-slot"></div>
        <div class="flanker-key-hint">Tap a side, or press <kbd>←</kbd> or <kbd>→</kbd></div>
        <div class="flanker-feedback" id="flanker-feedback" aria-live="assertive"></div>
      </div>
      <div class="flanker-response-row">
        <button id="flanker-left-btn" class="btn-img-action" aria-label="Respond left"><img src="${flankerBtnLeftSrc}" alt="←"></button>
        <button id="flanker-right-btn" class="btn-img-action" aria-label="Respond right"><img src="${flankerBtnRightSrc}" alt="→"></button>
      </div>
    </div>
  `;
  qs<HTMLButtonElement>('#flanker-left-btn')!.addEventListener('click', () => handleFlankerInput('left'));
  qs<HTMLButtonElement>('#flanker-right-btn')!.addEventListener('click', () => handleFlankerInput('right'));
}

// ---- Update the parts of the shell that change for this trial/phase ----
function updateGame3Stimulus(trial: FlankerTrial, phase: 'fixation' | 'stimulus') {
  const trialIdx = flankerEngine.getCurrentTrialIndex() + 1;
  const trialNumEl = qs<HTMLElement>('#flanker-trial-num');
  if (trialNumEl) trialNumEl.innerHTML = `${trialIdx} <span class="hud-of">of ${FLANKER_TOTAL}</span>`;

  const slot = qs<HTMLElement>('#flanker-stimulus-slot');
  if (slot) {
    slot.innerHTML = phase === 'fixation'
      ? flankerFixationHTML()
      : `<div class="flanker-card-row" id="flanker-card-row">${flankerCardRowHTML(trial)}</div>`;
  }
}

// ---- Start a trial: fixation cross, then the arrow row (+ timeout + keys) ----
function startGame3Trial(trial: FlankerTrial) {
  const screen = qs<HTMLElement>('#flanker-screen');
  screen?.classList.remove('glow-correct', 'shake-wrong');
  const fb = qs<HTMLElement>('#flanker-feedback');
  if (fb) { fb.innerHTML = ''; fb.className = 'flanker-feedback'; }

  updateGame3Stimulus(trial, 'fixation');
  flankerBusy = true;
  setTimeout(() => {
    updateGame3Stimulus(trial, 'stimulus');
    // Stay busy until the card has actually painted, so a response landing in the gap
    // between render and paint can't be scored against a stale RT clock.
    requestAnimationFrame(() => {
      flankerEngine.showStimulus();
      flankerBusy = false;
      document.addEventListener('keydown', handleFlankerKey);
      flankerTimeoutHandle = setTimeout(() => {
        submitFlankerResponse('timeout');
      }, 1200);
    });
  }, FLANKER_FIXATION_MS);
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

  // Fired only after handleResponse() has already stamped the reaction time, so
  // audio scheduling can't perturb the measurement.
  if (result.isCorrect) playCorrect(); else playIncorrect();

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
      fb.innerHTML = response === 'timeout' ? `<img class="flanker-timeout-icon" src="${flankerTimeoutSrc}" alt="Time out">` : '✗';
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
  playComplete();
  savedGame3Payload = flankerEngine.getPayload();
  const m = savedGame3Payload.summaryMetrics;
  const fxStr = m.flankerEffectMs >= 0 ? `+${m.flankerEffectMs}` : String(m.flankerEffectMs);

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen wcst-gameover-screen">
      <div class="wcst-gameover-inner">
        <div class="logo-mark">🎯</div>
        <h2 class="gameover-title">All Done!</h2>
        <p class="gameover-sub">Here's how Meen managed distractions.</p>

        <div class="metrics-table">
          <div class="metric-row highlight">
            <span class="metric-label">Overall Accuracy</span>
            <span class="metric-value gold">${m.totalCorrect} / ${m.totalTrials}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Distraction Cost</span>
            <span class="metric-value">${fxStr} ms</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Missed in Time</span>
            <span class="metric-value ${m.timeouts > 0 ? 'danger' : ''}">${m.timeouts} &nbsp;<small style="font-weight:400;color:var(--text-faint)">(${(m.timeoutRate * 100).toFixed(0)}%)</small></span>
          </div>
        </div>

        <div class="gameover-actions">
          <button id="next-game-btn" class="btn btn-primary">Next: Kong's Neighborhood Sprint</button>
          ${combinedResultsButtonHTML()}
          <button id="replay-flanker-btn" class="btn btn-secondary">Play Again</button>
          <button id="home-flanker-btn" class="btn btn-secondary">Game Select</button>
        </div>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#next-game-btn')!.addEventListener('click', renderGame4Intro);
  qs<HTMLButtonElement>('#replay-flanker-btn')!.addEventListener('click', renderGame3Intro);
  qs<HTMLButtonElement>('#home-flanker-btn')!.addEventListener('click', renderIntro);
  attachCombinedResultsButton();
}

// ============================================================
// GAME 4 — KONG'S NEIGHBORHOOD SPRINT (Public Goods Game)
// ============================================================

const PGG_TOTAL_ROUNDS = 8;

// Average per-player contribution (0-10) recorded after each round, reset at
// the start of every session. Drives which of the 3 neighborhood scenes shows.
let pggContribHistory: number[] = [];

function pggBackgroundSrc(): string {
  if (pggContribHistory.length === 0) return pggBackgroundStartSrc;
  // A lifetime average barely moves after a few rounds, so the scene would look
  // frozen for most of an 8-round session. A window over the most recent rounds
  // keeps it reacting to how the group has been behaving lately.
  const recent = pggContribHistory.slice(-3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const rate = avg / 10;
  if (rate >= 0.6) return pggBackgroundThrivingSrc;
  if (rate <= 0.3) return pggBackgroundDecliningSrc;
  return pggBackgroundStartSrc;
}

// ---- Game 4 intro screen ----
function renderGame4Intro() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen intro-screen">
      <div class="intro-inner">
        <div class="logo-mark">🤝</div>
        <h1 class="game-title">Kong's Neighborhood Sprint</h1>
        <p class="game-subtitle">Play nice with your neighbors</p>
        <div class="persona-card">
          <p>พี่ก้อง (Kong) organizes a shared community fund with 3 neighbors every
          sprint. Everyone chips in what they choose, the pooled amount grows, then
          gets split evenly among the whole group.</p>
          <p><em>How much do you contribute when others might not?</em></p>
        </div>
        <div class="intro-rules">
          <div class="rule"><span class="rule-num">1</span>Each round you and 3 teammates get 10 coins.</div>
          <div class="rule"><span class="rule-num">2</span>Choose how much to put into the shared pool, the rest you keep.</div>
          <div class="rule"><span class="rule-num">3</span>The pool is multiplied ×1.6 and split evenly among all 4 players.</div>
        </div>
        <button id="begin-pgg-btn" class="btn btn-primary">Start</button>
        <button id="back-btn" class="btn btn-secondary" style="margin-top:-6px">Back</button>
        <p class="session-note">8 rounds, 10 seconds each</p>
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
  pggContribHistory = [];
  const roundInfo = pggEngine.startRound();
  renderGame4Round(roundInfo);
}

// ---- Render a round (contribution selector + countdown) ----
function renderGame4Round(roundInfo: { roundIndex: number; endowment: number; timeLimitMs: number }) {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div class="screen pgg-trial-screen" style="background-image:url('${pggBackgroundSrc()}')">
      <div class="hud hud-overlay">
        <div class="hud-trial">
          <span class="hud-label">Round</span>
          <span class="hud-value">${roundInfo.roundIndex} <span class="hud-of">of ${PGG_TOTAL_ROUNDS}</span></span>
        </div>
        <div class="hud-score">
          <span class="hud-label">Cumulative Payoff</span>
          <span class="hud-value score-num" id="pgg-cumulative">${pggLastCumulative}</span>
        </div>
      </div>

      <div class="pgg-countdown-wrap">
        <div class="pgg-countdown-track">
          <div class="pgg-countdown-fill" id="pgg-countdown-fill" style="width:100%"></div>
        </div>
        <span class="pgg-countdown-num" id="pgg-countdown-num">10s</span>
      </div>

      <div class="pgg-round-body">
        <div class="pgg-round-card">
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
            <div class="pgg-slider-row">
              <button type="button" class="pgg-stepper-btn" id="pgg-minus-btn" aria-label="Decrease"><img src="${pggSliderMinusSrc}" alt="−"></button>
              <input type="range" min="0" max="10" step="1" value="5" id="pgg-slider" class="pgg-slider" />
              <button type="button" class="pgg-stepper-btn" id="pgg-plus-btn" aria-label="Increase"><img src="${pggSliderPlusSrc}" alt="+"></button>
            </div>
          </div>

          <button id="pgg-confirm-btn" class="btn btn-primary">Confirm Contribution</button>
        </div>
      </div>
    </div>
  `;

  const slider = qs<HTMLInputElement>('#pgg-slider')!;
  const contribEl = qs<HTMLElement>('#pgg-contrib-val')!;
  const keepEl = qs<HTMLElement>('#pgg-keep-val')!;
  const updateReadout = (v: number) => {
    contribEl.textContent = String(v);
    keepEl.textContent = String(10 - v);
  };
  slider.addEventListener('input', () => updateReadout(Number(slider.value)));

  qs<HTMLButtonElement>('#pgg-minus-btn')!.addEventListener('click', () => {
    slider.value = String(Math.max(0, Number(slider.value) - 1));
    updateReadout(Number(slider.value));
  });
  qs<HTMLButtonElement>('#pgg-plus-btn')!.addEventListener('click', () => {
    slider.value = String(Math.min(10, Number(slider.value) + 1));
    updateReadout(Number(slider.value));
  });

  qs<HTMLButtonElement>('#pgg-confirm-btn')!.addEventListener('click', () => {
    submitPggRound(Number(slider.value), false);
  });

  // ---- 10s countdown ----
  const startTs = Date.now();
  const fillEl = qs<HTMLElement>('#pgg-countdown-fill')!;
  const numEl = qs<HTMLElement>('#pgg-countdown-num')!;
  pggCountdownInterval = setInterval(() => {
    const elapsed = Date.now() - startTs;
    const remainingMs = Math.max(0, 10000 - elapsed);
    const pct = Math.max(0, 100 * (1 - elapsed / 10000));
    fillEl.style.width = `${pct}%`;
    fillEl.style.background = pct < 25 ? 'var(--danger)' : pct < 55 ? 'var(--gold)' : 'var(--accent)';
    numEl.textContent = `${Math.ceil(remainingMs / 1000)}s`;
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
  pggContribHistory.push(roundLog.totalPool / 4);
  // Coins land when the pool pays out; a timeout forfeits the round instead.
  if (isTimeout) playIncorrect(); else playBank();
  pggLastCumulative = roundLog.userCumulativePayoff;
  showPggContributionPopup(roundLog.userContribution, () => renderGame4RoundResult(roundLog));
}

// A brief "you contributed N coins" toast before the full round summary, so
// the amount just chosen registers on its own before the pool math appears.
function showPggContributionPopup(amount: number, onDone: () => void): void {
  const popup = document.createElement('div');
  popup.className = 'pgg-contrib-popup';
  popup.innerHTML = `<img src="${pggCoinSrc}" alt="" class="pgg-contrib-popup-coin"><span>You contributed ${amount} coin${amount === 1 ? '' : 's'}</span>`;
  document.body.appendChild(popup);
  requestAnimationFrame(() => popup.classList.add('show'));
  setTimeout(() => {
    popup.classList.remove('show');
    setTimeout(() => { popup.remove(); onDone(); }, 200);
  }, 800);
}

// ---- Round result reveal screen ----
function renderGame4RoundResult(roundLog: PggRoundLog) {
  const app = document.getElementById('app')!;
  const isLastRound = pggEngine.isGameOver();

  const aiCardsHTML = roundLog.aiContributions.map((ai) => {
    const info = PGG_ROLE_INFO[ai.role];
    return `
    <div class="pgg-ai-card">
      <img class="pgg-ai-avatar" src="${info.avatar}" alt="">
      <span class="pgg-ai-name">${info.displayName}</span>
      <span class="pgg-ai-coins">${ai.contribution} <small>coins</small></span>
    </div>
  `;
  }).join('');

  app.innerHTML = `
    <div class="screen pgg-result-screen" style="background-image:url('${pggBackgroundSrc()}')">
      <p class="pgg-result-label">Round ${roundLog.roundIndex} Results ${roundLog.isTimeout ? '<span class="danger">(Timed out)</span>' : ''}</p>
      <div class="pgg-result-inner">
        <div class="pgg-ai-panel">
          <div class="pgg-ai-card pgg-ai-card-user">
            <img class="pgg-ai-avatar" src="${pggAvatarPlayerSrc}" alt="">
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

        <button id="pgg-continue-btn" class="btn btn-primary">${isLastRound ? 'View Final Results' : 'Continue'}</button>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#pgg-continue-btn')!.addEventListener('click', () => {
    playClick();
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
  playComplete();
  savedGame4Payload = pggEngine.getPayload();
  const m = savedGame4Payload.summaryMetrics;
  const slopeStr = m.cooperationDecaySlope >= 0 ? `+${m.cooperationDecaySlope}` : String(m.cooperationDecaySlope);

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="screen wcst-gameover-screen">
      <div class="wcst-gameover-inner">
        <div class="logo-mark">🤝</div>
        <h2 class="gameover-title">All Done!</h2>
        <p class="gameover-sub">Here's how Kong contributed to the neighborhood fund.</p>

        <div class="metrics-table">
          <div class="metric-row highlight">
            <span class="metric-label">Total Points Earned</span>
            <span class="metric-value gold">${m.finalCumulativePayoff} pts</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Average Contribution</span>
            <span class="metric-value">${m.averageContribution} / 10</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Giving Trend Over Time</span>
            <span class="metric-value">${slopeStr}</span>
          </div>
        </div>

        <div class="gameover-actions">
          ${combinedResultsButtonHTML()}
          <button id="replay-pgg-btn" class="btn btn-secondary">Play Again</button>
          <button id="home-pgg-btn" class="btn btn-secondary">Game Select</button>
        </div>
      </div>
    </div>
  `;

  qs<HTMLButtonElement>('#replay-pgg-btn')!.addEventListener('click', () => {
    pggLastCumulative = 0;
    renderGame4Intro();
  });
  qs<HTMLButtonElement>('#home-pgg-btn')!.addEventListener('click', renderIntro);
  attachCombinedResultsButton();
}

// ============================================================
// COMBINED SESSION SUMMARY — Radar Chart + Full JSON Export
// ============================================================

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawRadarChart(ctx: CanvasRenderingContext2D, size: number, radar: RadarChartOutput) {
  const labels: string[][] = [
    ['Risk', 'Tolerance'],
    ['Learning', 'Agility'],
    ['Critical', 'Thinking'],
    ['Decision Making', 'Under Pressure'],
    ['Collaboration', 'Mindset'],
    ['Resilience &', 'Adaptability'],
  ];
  const values = [
    radar.axes.riskTolerance,
    radar.axes.learningAgility,
    radar.axes.criticalThinking,
    radar.axes.decisionMakingUnderPressure,
    radar.axes.collaborationMindset,
    radar.axes.resilienceAndAdaptability,
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
        <h2 class="gameover-title">Your Full Results</h2>
        <p class="gameover-sub">A snapshot of how you played across all 4 games.</p>

        <div class="summary-canvas-wrap">
          <canvas id="radar-canvas"></canvas>
        </div>

        <div class="metrics-table">
          <div class="metric-row highlight">
            <span class="metric-label">Overall Score</span>
            <span class="metric-value gold">${radar.overallIndex}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Risk Tolerance</span>
            <span class="metric-value">${radar.axes.riskTolerance}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Learning Agility</span>
            <span class="metric-value">${radar.axes.learningAgility}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Critical Thinking</span>
            <span class="metric-value">${radar.axes.criticalThinking}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Decision Making Under Pressure</span>
            <span class="metric-value">${radar.axes.decisionMakingUnderPressure}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Collaboration Mindset</span>
            <span class="metric-value">${radar.axes.collaborationMindset}</span>
          </div>
          <div class="metric-row">
            <span class="metric-label">Resilience & Adaptability</span>
            <span class="metric-value">${radar.axes.resilienceAndAdaptability}</span>
          </div>
        </div>

        <div class="gameover-actions">
          <button id="home-summary-btn" class="btn btn-secondary">Game Select</button>
        </div>
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

  qs<HTMLButtonElement>('#home-summary-btn')!.addEventListener('click', renderIntro);
}
