import { Flux as FluxGL } from "../flux-gl";
import { Flux } from "../flux";
import { Elm } from "./Main.elm";
import {
  chooseNextPaletteState,
  createBitmapFromPaletteState,
  createInitialPaletteState,
  isGeneratedColorMode,
  timingForPaletteStep,
} from "./color-kit";
import {
  chooseNextFlowTarget,
  createFlowDna,
  createInitialFlowState,
  smoothFlowSettings,
} from "./flow-kit";

let flux;
let currentSettings;
let currentPaletteState;
let currentMotionDna;
let currentFlowDna;
let currentFlowState;
let flowTargetState;
let cycleIndex = 0;
let cycleTimer;
let flowTimer;
let flowStepIndex = 0;
let flowTargetStartedAt = 0;
let lastFlowUpdateAt = 0;
let transitionToken = 0;
let reducedMotionQuery;

function loadImage(imageUrl) {
  return fetch(imageUrl)
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob, { resizeWidth: 500, resizeHeight: 500 }));
}

function applyImageColorMode(settings) {
  const path = settings.colorMode?.ImageFile;

  if (!path) {
    return Promise.resolve();
  }

  if (isGeneratedColorMode(path)) {
    if (!currentPaletteState) {
      currentPaletteState = createInitialPaletteState();
      currentMotionDna = currentPaletteState.motionDna;
    }

    return createBitmapFromPaletteState(currentPaletteState).then((bitmap) => flux.save_image(bitmap));
  }

  return loadImage(path).then((bitmap) => flux.save_image(bitmap));
}

async function applyColorMode(path, options = {}) {
  if (!flux || !currentSettings) return;

  const previousPath = currentSettings.colorMode?.ImageFile;

  if (
    options.transition &&
    previousPath &&
    isGeneratedColorMode(previousPath) &&
    isGeneratedColorMode(path)
  ) {
    if (!currentPaletteState) {
      currentPaletteState = createInitialPaletteState();
      currentMotionDna = currentPaletteState.motionDna;
    }

    const nextState = chooseNextPaletteState(currentPaletteState, cycleIndex + 1);
    const timing = timingForPaletteStep(currentPaletteState, nextState, cycleIndex + 1, {
      reducedMotion: prefersReducedMotion(),
    });

    if (await transitionPaletteState(currentPaletteState, nextState, timing)) {
      currentPaletteState = nextState;
      currentMotionDna = nextState.motionDna;
    }
    return;
  }

  const nextSettings = {
    ...currentSettings,
    colorMode: { ImageFile: path },
  };

  await applyImageColorMode(nextSettings);
  flux.settings = nextSettings;
  currentSettings = nextSettings;
}

async function transitionPaletteState(fromState, toState, timing) {
  if (!fromState || !toState || timing?.reducedMotion) return false;

  const token = (transitionToken += 1);
  const fromBitmap = await createBitmapFromPaletteState(fromState);
  const toBitmap = await createBitmapFromPaletteState(toState);
  const startedAt = performance.now();
  let lastStepAt = 0;

  return new Promise((resolve) => {
    const tick = async (timestamp) => {
      if (token !== transitionToken) {
        resolve(false);
        return;
      }

      const elapsed = timestamp - startedAt;
      const progress = Math.min(1, elapsed / timing.durationMs);
      const eased = minimumJerk(progress);

      if (progress === 1 || timestamp - lastStepAt >= timing.uploadCadenceMs) {
        lastStepAt = timestamp;
        const bitmap = await blendBitmaps(fromBitmap, toBitmap, eased);
        flux.save_image(bitmap);
      }

      if (progress < 1) {
        window.requestAnimationFrame(tick);
        return;
      }

      const nextSettings = {
        ...currentSettings,
        colorMode: { ImageFile: "generated:harmonized" },
      };

      flux.settings = nextSettings;
      currentSettings = nextSettings;
      resolve(true);
    };

    window.requestAnimationFrame(tick);
  });
}

async function blendBitmaps(fromBitmap, toBitmap, progress) {
  const canvas =
    "OffscreenCanvas" in window
      ? new OffscreenCanvas(fromBitmap.width, fromBitmap.height)
      : Object.assign(document.createElement("canvas"), {
          width: fromBitmap.width,
          height: fromBitmap.height,
        });
  const context = canvas.getContext("2d", { alpha: false });

  context.drawImage(fromBitmap, 0, 0);
  context.globalAlpha = progress;
  context.drawImage(toBitmap, 0, 0);
  context.globalAlpha = 1;

  if ("transferToImageBitmap" in canvas) {
    return canvas.transferToImageBitmap();
  }

  return createImageBitmap(canvas);
}

function minimumJerk(progress) {
  return 10 * progress ** 3 - 15 * progress ** 4 + 6 * progress ** 5;
}

function startColorCycle() {
  if (cycleTimer || prefersReducedMotion()) return;

  cycleTimer = true;

  const applyNext = async () => {
    while (cycleTimer) {
      const nextState = chooseNextPaletteState(currentPaletteState, cycleIndex + 1);
      const timing = timingForPaletteStep(currentPaletteState, nextState, cycleIndex + 1, {
        reducedMotion: prefersReducedMotion(),
      });

      cycleIndex += 1;
      const completed = await transitionPaletteState(currentPaletteState, nextState, timing);
      if (timing.reducedMotion) break;
      if (!completed) continue;

      currentPaletteState = nextState;
      currentMotionDna = nextState.motionDna;
    }
  };

  applyNext();
}

function stopColorCycle() {
  cycleTimer = false;
  transitionToken += 1;
}

function startFlowCycle() {
  if (flowTimer || prefersReducedMotion() || !flux || !currentSettings || !currentPaletteState) return;

  currentFlowDna = currentFlowDna || createFlowDna(currentPaletteState.seedDna);
  currentFlowState = currentFlowState || createInitialFlowState(currentSettings, currentFlowDna);
  flowTargetState = flowTargetState || chooseNextFlowTarget(currentFlowState, flowStepIndex + 1);
  lastFlowUpdateAt = performance.now();
  flowTargetStartedAt = lastFlowUpdateAt;

  flowTimer = window.setInterval(updateFlowSettings, currentFlowDna.updateCadenceMs);
}

function stopFlowCycle() {
  if (flowTimer) {
    window.clearInterval(flowTimer);
  }

  flowTimer = undefined;
}

function updateFlowSettings() {
  if (prefersReducedMotion() || !flux || !currentSettings || !currentFlowDna) {
    stopFlowCycle();
    return;
  }

  const now = performance.now();
  const elapsedMs = now - lastFlowUpdateAt;

  lastFlowUpdateAt = now;

  if (!flowTargetState || now - flowTargetStartedAt >= flowTargetState.durationMs) {
    currentFlowState = createInitialFlowState(currentSettings, currentFlowDna);
    flowStepIndex += 1;
    flowTargetState = chooseNextFlowTarget(currentFlowState, flowStepIndex);
    flowTargetStartedAt = now;
  }

  const nextSettings = smoothFlowSettings(currentSettings, flowTargetState, elapsedMs);
  const mergedSettings = {
    ...nextSettings,
    colorMode: currentSettings.colorMode,
  };

  flux.settings = mergedSettings;
  currentSettings = mergedSettings;
}

function prefersReducedMotion() {
  return reducedMotionQuery?.matches || false;
}

function setupReducedMotionListener() {
  if (!window.matchMedia) return;

  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handleChange = () => {
    if (prefersReducedMotion()) {
      stopColorCycle();
      stopFlowCycle();
      return;
    }

    startColorCycle();
    startFlowCycle();
  };

  reducedMotionQuery.addEventListener?.("change", handleChange);
}

function setupFlux() {
  const ui = Elm.Main.init({
    node: document.getElementById("controls"),
  });

  ui.ports.initFlux.subscribe(async function(settings) {
    if (navigator.gpu) {
      console.log("Backend: WebGPU");
      flux = await new Flux(settings);
    } else {
      console.log("Backend: WebGL2");
      flux = new FluxGL(settings);
    }

    currentSettings = settings;
    await applyImageColorMode(settings);
    setupReducedMotionListener();
    startColorCycle();
    startFlowCycle();

    function animate(timestamp) {
      flux.animate(timestamp);
      window.requestAnimationFrame(animate);
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      let { width, height } = entry.contentRect;
      flux.resize(width, height);
    });
    resizeObserver.observe(document.getElementById("canvas"));

    window.requestAnimationFrame(animate);
  });

  ui.ports.setSettings.subscribe(async function(newSettings) {
    await applyImageColorMode(newSettings);
    flux.settings = newSettings;
    currentSettings = newSettings;
    currentFlowState = currentFlowDna ? createInitialFlowState(currentSettings, currentFlowDna) : currentFlowState;
  });
}

setupFlux();
