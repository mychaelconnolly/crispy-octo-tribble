import { Flux as FluxGL } from "../flux-gl";
import { Flux } from "../flux";

const canvas = document.getElementById("canvas");
const fallback = document.getElementById("fallback");
const scriptUrl = new URL(
  document.currentScript?.src || "./public/flux/index.js",
  window.location.href,
);

let flux;
let settings = defaultSettings();
let randomizing = false;

function defaultSettings() {
  return {
    mode: "Normal",
    seed: null,
    fluidSize: 128,
    fluidFrameRate: 60,
    fluidTimestep: 1.0 / 60.0,
    viscosity: 5.0,
    velocityDissipation: 0.0,
    pressureMode: { ClearWith: 0.0 },
    diffusionIterations: 3,
    pressureIterations: 19,
    colorMode: { Preset: "Original" },
    lineLength: 450.0,
    lineWidth: 9.0,
    lineBeginOffset: 0.4,
    lineVariance: 0.55,
    gridSpacing: 15,
    viewScale: 1.6,
    noiseMultiplier: 0.45,
    noiseChannels: [
      {
        scale: 2.8,
        multiplier: 1.0,
        offsetIncrement: 0.001,
      },
      {
        scale: 15.0,
        multiplier: 0.7,
        offsetIncrement: 0.006,
      },
      {
        scale: 30.0,
        multiplier: 0.5,
        offsetIncrement: 0.012,
      },
    ],
  };
}

function showFallback(message) {
  document.body.classList.add("is-fallback");
  if (fallback) {
    fallback.textContent = message;
    fallback.hidden = false;
  }
}

async function createFlux() {
  if (!canvas) {
    showFallback("Flux canvas is missing.");
    return;
  }

  try {
    flux = new FluxGL(settings);
  } catch (error) {
    if (!navigator.gpu) {
      console.error(error);
      showFallback("This browser cannot run the Flux WebGPU/WebGL canvas.");
      return;
    }

    try {
      flux = await new Flux(settings);
    } catch (fallbackError) {
      console.error(error);
      console.error(fallbackError);
      showFallback("This browser cannot run the Flux WebGPU/WebGL canvas.");
      return;
    }
  }

  await applyImagePalette("colors/silver.png");

  const resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    flux.resize(width, height);
  });
  resizeObserver.observe(canvas);

  const animate = (timestamp) => {
    flux.animate(timestamp);
    window.requestAnimationFrame(animate);
  };

  window.requestAnimationFrame(animate);
}

function assetUrl(path) {
  return new URL(path, scriptUrl).toString();
}

async function loadImage(imageUrl) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return createImageBitmap(blob, { resizeWidth: 500, resizeHeight: 500 });
}

async function applyImagePalette(path) {
  const bitmap = await loadImage(assetUrl(path));
  flux.save_image(bitmap);
  settings = {
    ...settings,
    colorMode: { ImageFile: path },
  };
  flux.settings = settings;
}

function nextSeed() {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((part) => part.toString(36)).join("-");
}

function randomBetween(min, max) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return min + (value[0] / 0xffffffff) * (max - min);
}

function oklchToRgb(lightness, chroma, hue) {
  const h = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);

  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return linear.map((channel) => {
    const clamped = Math.max(0, Math.min(1, channel));
    const gamma =
      clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(gamma * 255);
  });
}

function rgbCss([r, g, b]) {
  return `rgb(${r} ${g} ${b})`;
}

function rgbVar([r, g, b]) {
  return `${r} ${g} ${b}`;
}

function applyCssPalette(colors) {
  const root = document.documentElement;
  root.style.setProperty("--flux-a", rgbVar(colors[0]));
  root.style.setProperty("--flux-b", rgbVar(colors[1]));
  root.style.setProperty("--flux-c", rgbVar(colors[2]));
  root.style.setProperty("--flux-d", rgbVar(colors[3]));
}

async function createPaletteBitmap() {
  const size = 500;
  const paletteCanvas =
    "OffscreenCanvas" in window
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement("canvas"), {
          width: size,
          height: size,
        });
  const context = paletteCanvas.getContext("2d", { alpha: false });
  const baseHue = randomBetween(0, 360);
  const spread = randomBetween(52, 156);
  const warmth = randomBetween(-18, 18);
  const stops = [
    { x: 0.0, lightness: randomBetween(0.48, 0.62), chroma: randomBetween(0.06, 0.13), hue: baseHue },
    { x: 0.18, lightness: randomBetween(0.58, 0.76), chroma: randomBetween(0.08, 0.18), hue: baseHue + spread },
    { x: 0.38, lightness: randomBetween(0.36, 0.58), chroma: randomBetween(0.05, 0.15), hue: baseHue + spread * 1.8 + warmth },
    { x: 0.62, lightness: randomBetween(0.68, 0.84), chroma: randomBetween(0.04, 0.13), hue: baseHue - spread * 0.7 },
    { x: 0.82, lightness: randomBetween(0.46, 0.72), chroma: randomBetween(0.08, 0.2), hue: baseHue + 210 + warmth },
    { x: 1.0, lightness: randomBetween(0.74, 0.9), chroma: randomBetween(0.03, 0.1), hue: baseHue + 300 },
  ];

  const colors = stops.map((stop) =>
    oklchToRgb(stop.lightness, stop.chroma, ((stop.hue % 360) + 360) % 360),
  );
  const gradient = context.createLinearGradient(0, 0, size, size);
  for (const stop of stops) {
    gradient.addColorStop(
      stop.x,
      rgbCss(oklchToRgb(stop.lightness, stop.chroma, ((stop.hue % 360) + 360) % 360)),
    );
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = "screen";

  for (let i = 0; i < 18; i += 1) {
    const hue = baseHue + i * 23 + randomBetween(-8, 8);
    const color = rgbCss(oklchToRgb(randomBetween(0.56, 0.84), randomBetween(0.04, 0.16), hue));
    context.fillStyle = color;
    context.globalAlpha = randomBetween(0.05, 0.16);
    context.beginPath();
    context.ellipse(
      randomBetween(-40, size + 40),
      randomBetween(-40, size + 40),
      randomBetween(46, 180),
      randomBetween(18, 92),
      randomBetween(0, Math.PI),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  if ("transferToImageBitmap" in paletteCanvas) {
    return {
      bitmap: paletteCanvas.transferToImageBitmap(),
      colors: [colors[1], colors[3], colors[4], colors[2]],
    };
  }
  return {
    bitmap: await createImageBitmap(paletteCanvas),
    colors: [colors[1], colors[3], colors[4], colors[2]],
  };
}

async function randomizePalette() {
  if (!flux || randomizing) return;
  randomizing = true;

  try {
    const { bitmap, colors } = await createPaletteBitmap();
    applyCssPalette(colors);
    flux.save_image(bitmap);
    settings = {
      ...settings,
      seed: nextSeed(),
      colorMode: { ImageFile: "generated-oklch-palette" },
    };
    flux.settings = settings;
  } catch (error) {
    console.error(error);
  } finally {
    randomizing = false;
  }
}

function bindInteraction() {
  document.addEventListener(
    "pointerup",
    (event) => {
      if (event.button === 0) randomizePalette();
    },
    { passive: true },
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      randomizePalette();
    }
  });
}

function start() {
  bindInteraction();
  createFlux();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
