import {
  measureLineStats,
  prepareWithSegments,
} from "@chenglou/pretext";
import { glyphData } from "./data/glyphs.runtime.js";

const canvas = document.querySelector("#glyph-rain");
const ctx = canvas.getContext("2d", { alpha: false });
const activePalette = enrichPalette({
  background: "#120f0c",
  glyphHead: "#e0d4c1",
  glyphTail: "#36312b",
});

const glyphsByFamily = new Map();
for (const glyph of glyphData.glyphs) {
  if (!glyphsByFamily.has(glyph.family)) glyphsByFamily.set(glyph.family, []);
  glyphsByFamily.get(glyph.family).push(glyph);
}
const familyNames = [...glyphsByFamily.keys()];

let width = 0;
let height = 0;
let dpr = 1;
let cell = 22;
let laneCount = 1;
let streams = [];
let targetStreamCount = 0;
let densityScale = 0.92;
let frameAverage = 16.7;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastFrame = performance.now();
let glyphCycleClock = 0;
let glyphCycleStep = 0;
let glyphCycleFlash = 0;

const cycleStrides = [1, 5, 11, 17, 23, 31, 37, 43];

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

function laneStep(count) {
  let step = Math.max(1, Math.floor(count * 0.61803398875));
  while (gcd(step, count) !== 1) step += 1;
  return step;
}

function distributedLane(slot) {
  const count = Math.max(1, laneCount);
  return (slot * laneStep(count)) % count;
}

function xForSlot(slot, seed) {
  const count = Math.max(1, laneCount);
  const spacing = width / count;
  const jitter = (((seed >>> 15) % 100) / 100 - 0.5) * Math.min(cell * 0.34, spacing * 0.38);
  return Math.max(cell * 0.35, Math.min(width - cell * 0.35, (distributedLane(slot) + 0.5) * spacing + jitter));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "").trim();
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  const int = Number.parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function mixRgb(from, to, amount) {
  return {
    r: Math.round(from.r + (to.r - from.r) * amount),
    g: Math.round(from.g + (to.g - from.g) * amount),
    b: Math.round(from.b + (to.b - from.b) * amount),
  };
}

function enrichPalette(palette) {
  return {
    ...palette,
    backgroundRgb: hexToRgb(palette.background),
    glyphHeadRgb: hexToRgb(palette.glyphHead),
    glyphTailRgb: hexToRgb(palette.glyphTail),
  };
}

function applyActivePalette() {
  document.documentElement.style.setProperty("--surface-bg", activePalette.background);
  document.documentElement.style.setProperty("--glyph-head", activePalette.glyphHead);
  document.documentElement.style.setProperty("--glyph-tail", activePalette.glyphTail);
  paintInitialBackground();
}

function fillBackground(alpha) {
  ctx.fillStyle = rgba(activePalette.backgroundRgb, alpha);
  ctx.fillRect(0, 0, width, height);
}

function paintInitialBackground() {
  if (!width || !height) return;
  fillBackground(1);
}

function scheduleFrame() {
  window.setTimeout(() => frame(performance.now()), reducedMotion ? 120 : 33);
}

function prepareStream(family, seed, length) {
  const source = glyphsByFamily.get(family);
  const items = [];
  for (let i = 0; i < length; i++) {
    items.push(source[Math.abs(seed + i * 7919) % source.length]);
  }
  const text = items.map((item) => item.c).join(" ");
  const font = `${cell}px "${family}"`;
  let advance = cell;
  try {
    const prepared = prepareWithSegments(text, font, { wordBreak: "keep-all" });
    const stats = measureLineStats(prepared, Math.max(cell, cell * 1.12));
    advance = Math.max(1, stats.maxLineWidth || cell);
  } catch {
    advance = Math.max(1, items.length * cell * 0.62);
  }
  return {
    family,
    text,
    glyphs: items,
    advance,
  };
}

function makeStream(index) {
  const seed = (index + 1) * 1103515245;
  const family = familyNames[Math.abs(seed) % familyNames.length];
  const length = 80 + ((seed >>> 11) % 96);
  const depthRoll = (seed >>> 24) % 100;
  const depth = depthRoll < 50 ? 0 : depthRoll < 88 ? 1 : 2;
  const scale = depth === 0 ? 0.5 + ((seed >>> 3) % 14) / 100 : depth === 1 ? 0.72 : 0.96;
  const opacity = depth === 0 ? 0.18 : depth === 1 ? 0.42 : 0.82;
  const trail = Math.round((9 + ((seed >>> 21) % 12)) + (depth === 0 ? 9 : depth === 1 ? 4 : 0));
  const initialBand = Math.max(1, Math.floor(height + trail * cell * scale));
  return {
    slot: index,
    x: xForSlot(index, seed),
    y: ((seed >>> 7) % initialBand) - trail * cell * scale * 0.35,
    speed: reducedMotion ? 0 : (34 + ((seed >>> 13) % 98)) * (depth === 0 ? 0.32 : depth === 1 ? 0.58 : 0.82),
    trail,
    spawnDelay: ((seed >>> 4) % 1800) / 1000,
    depth,
    scale,
    opacity,
    seed,
    stream: prepareStream(family, seed, length),
    offset: (seed >>> 5) % length,
  };
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cell = Math.max(18, Math.min(27, Math.round(width / 58)));
  laneCount = Math.max(1, Math.floor(width / (cell * 1.14)));
  targetStreamCount = Math.max(42, Math.min(150, Math.floor((width / (cell * 1.08)) * densityScale)));
  streams = Array.from({ length: targetStreamCount }, (_, index) => makeStream(index));
}

function fade() {
  fillBackground(reducedMotion ? 0.98 : 0.34);
}

function recycle(stream) {
  stream.seed = (stream.seed * 1664525 + 1013904223) | 0;
  const depthRoll = (stream.seed >>> 24) % 100;
  stream.depth = depthRoll < 50 ? 0 : depthRoll < 88 ? 1 : 2;
  stream.scale =
    stream.depth === 0 ? 0.5 + ((stream.seed >>> 3) % 14) / 100 : stream.depth === 1 ? 0.72 : 0.96;
  stream.opacity = stream.depth === 0 ? 0.18 : stream.depth === 1 ? 0.42 : 0.82;
  stream.x = xForSlot(stream.slot, stream.seed);
  stream.y = -cell * (3 + ((stream.seed >>> 7) % 100));
  stream.speed =
    reducedMotion ? 0 : (34 + ((stream.seed >>> 13) % 98)) * (stream.depth === 0 ? 0.32 : stream.depth === 1 ? 0.58 : 0.82);
  stream.trail = Math.round((9 + ((stream.seed >>> 21) % 12)) + (stream.depth === 0 ? 9 : stream.depth === 1 ? 4 : 0));
  stream.spawnDelay = 0.65 + ((stream.seed >>> 4) % 3400) / 1000;
  const family = familyNames[Math.abs(stream.seed) % familyNames.length];
  stream.stream = prepareStream(family, stream.seed, 80 + ((stream.seed >>> 11) % 96));
  stream.offset = Math.abs(stream.seed) % stream.stream.glyphs.length;
}

function advanceGlyphCycle(dt) {
  if (reducedMotion) return;
  glyphCycleClock += dt;
  if (glyphCycleClock >= 0.46) {
    const steps = Math.floor(glyphCycleClock / 0.46);
    glyphCycleClock -= steps * 0.46;
    glyphCycleStep += steps;
    glyphCycleFlash = 1;
  } else {
    glyphCycleFlash = Math.max(0, glyphCycleFlash - dt * 2.1);
  }
}

function glyphForCell(glyphItems, stream, index) {
  const stride = cycleStrides[glyphCycleStep % cycleStrides.length];
  const phase = Math.floor(glyphCycleStep / cycleStrides.length);
  const cellSalt = (stream.seed >>> (index % 19)) & 31;
  const depthSalt = stream.depth * 13;
  const beat = glyphCycleStep * (3 + stream.depth * 2);
  const streamIndex =
    Math.abs(stream.offset + beat + index * stride + phase * (7 + depthSalt) + cellSalt) %
    glyphItems.length;
  return glyphItems[streamIndex].c;
}

function drawStream(stream, dt, time) {
  if (stream.spawnDelay > 0) {
    stream.spawnDelay -= dt;
    return;
  }

  stream.y += stream.speed * dt;
  if (stream.y - stream.trail * cell > height + cell) recycle(stream);

  const preparedStream = stream.stream;
  const glyphItems = preparedStream.glyphs;
  const drift = Math.sin(time * 0.14 + stream.seed) * (0.6 + stream.depth * 0.18);
  ctx.font = `${Math.round(cell * 1.08 * stream.scale)}px "${preparedStream.family}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < stream.trail; i++) {
    if (i > 2 && ((stream.seed >>> (i % 16)) + i) % 7 === 0) continue;
    const y = stream.y - i * cell * stream.scale + (((stream.seed >>> (i + 3)) % 5) - 2);
    if (y < -cell || y > height + cell) continue;
    const age = i / stream.trail;
    const alpha = Math.max(0, 1 - age);
    const warm = i === 0 ? 1 : alpha;
    const color = mixRgb(activePalette.glyphTailRgb, activePalette.glyphHeadRgb, warm);
    const char = glyphForCell(glyphItems, stream, i);

    const pulse = 1 + glyphCycleFlash * Math.max(0, 0.2 - age * 0.08);
    const a = Math.min(1, (i === 0 ? 0.9 : alpha * 0.5) * stream.opacity * pulse);
    ctx.fillStyle = rgba(color, a);
    ctx.fillText(char, stream.x + drift, y);
  }
}

function adaptDensity(dtMs) {
  frameAverage = frameAverage * 0.94 + dtMs * 0.06;
  if (frameAverage > 24 && densityScale > 0.48) {
    densityScale *= 0.92;
    streams.length = Math.max(24, Math.floor(streams.length * 0.92));
  } else if (frameAverage < 17.5 && densityScale < 0.92 && streams.length < targetStreamCount) {
    densityScale = Math.min(0.92, densityScale * 1.03);
    streams.push(makeStream(streams.length));
  }
}

function frame(now) {
  try {
    const frameMs = now - lastFrame;
    const dt = Math.min(0.05, frameMs / 1000);
    lastFrame = now;
    const time = now / 1000;
    advanceGlyphCycle(dt);
    adaptDensity(frameMs);
    fade();
    for (const stream of streams) {
      if (stream.depth === 0) drawStream(stream, dt, time);
    }
    for (const stream of streams) {
      if (stream.depth === 1) drawStream(stream, dt, time);
    }
    for (const stream of streams) {
      if (stream.depth === 2) drawStream(stream, dt, time);
    }
  } catch (error) {
    console.error(error);
  }
  scheduleFrame();
}

async function start() {
  const fontLoads = glyphData.fontFaces.map((font) => {
    const sample = glyphsByFamily.get(font.family)?.[0]?.c || "●";
    return document.fonts.load(`22px "${font.family}"`, sample);
  });
  await Promise.race([Promise.allSettled(fontLoads), new Promise((resolve) => setTimeout(resolve, 900))]);
  resize();
  paintInitialBackground();
  scheduleFrame();
}

applyActivePalette();

window.addEventListener("resize", resize);
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
  reducedMotion = event.matches;
  resize();
});

start().catch(() => {
  resize();
  paintInitialBackground();
  scheduleFrame();
});
