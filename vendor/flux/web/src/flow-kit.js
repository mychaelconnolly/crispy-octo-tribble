export const FLOW_SCHEMA = {
  version: 1,
  model: "seeded-flow-dna",
  principles: [
    "stable-fluids-safe-bounds",
    "curl-noise-style-coherent-turbulence",
    "fbm-octave-balance",
    "low-pass-steering",
  ],
  animatedSettings: [
    "viscosity",
    "velocityDissipation",
    "fluidTimestep",
    "noiseMultiplier",
    "lineVariance",
    "lineLength",
    "noiseChannels.scale",
    "noiseChannels.multiplier",
    "noiseChannels.offsetIncrement",
  ],
  staticSettings: [
    "fluidSize",
    "gridSpacing",
    "pressureIterations",
    "diffusionIterations",
    "pressureMode",
    "lineWidth",
    "viewScale",
  ],
};

const DEFAULT_CHANNELS = [
  { scale: 2.8, multiplier: 1.0, offsetIncrement: 0.001 },
  { scale: 15.0, multiplier: 0.7, offsetIncrement: 0.006 },
  { scale: 30.0, multiplier: 0.5, offsetIncrement: 0.012 },
];

const BOUNDS = {
  viscosity: [4.2, 6.4],
  velocityDissipation: [0.0, 0.35],
  fluidTimestep: [1 / 64, 1 / 56],
  noiseMultiplier: [0.32, 0.68],
  lineVariance: [0.42, 0.68],
  lineLength: [390, 520],
  channels: [
    {
      scale: [2.2, 4.2],
      multiplier: [0.78, 1.0],
      offsetIncrement: [0.00055, 0.00155],
    },
    {
      scale: [10, 18],
      multiplier: [0.48, 0.82],
      offsetIncrement: [0.0035, 0.009],
    },
    {
      scale: [22, 30],
      multiplier: [0.25, 0.58],
      offsetIncrement: [0.007, 0.016],
    },
  ],
};

const MAX_DELTA_PER_SECOND = {
  viscosity: 0.12,
  velocityDissipation: 0.018,
  fluidTimestep: 0.00008,
  noiseMultiplier: 0.035,
  lineVariance: 0.025,
  lineLength: 18,
  channels: [
    { scale: 0.22, multiplier: 0.025, offsetIncrement: 0.00008 },
    { scale: 0.75, multiplier: 0.035, offsetIncrement: 0.00035 },
    { scale: 1.1, multiplier: 0.035, offsetIncrement: 0.00055 },
  ],
};

const TARGET_DELTA = {
  viscosity: 0.9,
  velocityDissipation: 0.16,
  fluidTimestep: 0.0012,
  noiseMultiplier: 0.18,
  lineVariance: 0.12,
  lineLength: 80,
  channels: [
    { scale: 1.1, multiplier: 0.16, offsetIncrement: 0.00055 },
    { scale: 4.0, multiplier: 0.2, offsetIncrement: 0.0025 },
    { scale: 5.0, multiplier: 0.2, offsetIncrement: 0.004 },
  ],
};

const FLOW_MODES = [
  "calm-drift",
  "broad-pull",
  "turbulent-veil",
  "silk-lines",
  "fine-shimmer",
];

export function createFlowDna(seedDna) {
  const seed = seedDna?.seed || "flow";
  const random = seededRandom(`${seed}:flow-dna`);
  const calmnessBias = clamp(0.5 + (seedDna?.atmosphereBias || random()) * 0.35 + range(random, -0.12, 0.12), 0.35, 0.88);
  const turbulenceBias = clamp(1 - calmnessBias + range(random, -0.1, 0.16), 0.18, 0.72);
  const cycleMs = Math.round(range(random, 22000, 38000));

  return {
    version: 1,
    seed,
    calmnessBias,
    turbulenceBias,
    viscosityBias: range(random, -0.35, 0.35),
    timestepBias: range(random, -0.25, 0.25),
    dissipationBias: range(random, -0.18, 0.22),
    octaveBalance: [
      range(random, 0.84, 1.0),
      range(random, 0.54, 0.86),
      range(random, 0.28, 0.62),
    ],
    targetCycleMs: cycleMs,
    targetCycleVariance: range(random, 0.08, 0.16),
    updateCadenceMs: 500,
    halfLifeMs: Math.round(range(random, 6500, 11000)),
  };
}

export function createInitialFlowState(settings, flowDna) {
  return {
    version: 1,
    flowDna,
    mode: "initial",
    durationMs: flowDna.targetCycleMs,
    halfLifeMs: flowDna.halfLifeMs,
    settings: normalizeFlowSettings(settings),
  };
}

export function chooseNextFlowTarget(flowState, stepIndex) {
  const flowDna = flowState.flowDna;
  const random = seededRandom(`${flowDna.seed}:flow-target:${stepIndex}`);
  const mode = FLOW_MODES[Math.floor(random() * FLOW_MODES.length)];
  const previous = flowState.settings;
  const desired = targetForMode(previous, flowDna, mode, random);
  const settings = limitTargetDistance(previous, desired);
  const durationVariance = range(random, -flowDna.targetCycleVariance, flowDna.targetCycleVariance);

  return {
    version: 1,
    flowDna,
    mode,
    durationMs: Math.round(clamp(flowDna.targetCycleMs * (1 + durationVariance), 22000, 38000)),
    halfLifeMs: flowDna.halfLifeMs,
    settings,
  };
}

export function smoothFlowSettings(currentSettings, targetState, elapsedMs) {
  if (!targetState?.settings) return currentSettings;

  const dt = Math.max(0.001, elapsedMs / 1000);
  const amount = 1 - 0.5 ** (elapsedMs / targetState.halfLifeMs);
  const current = normalizeFlowSettings(currentSettings);
  const target = targetState.settings;
  const next = {
    ...currentSettings,
    viscosity: smoothScalar(current.viscosity, target.viscosity, amount, MAX_DELTA_PER_SECOND.viscosity, dt, BOUNDS.viscosity),
    velocityDissipation: smoothScalar(
      current.velocityDissipation,
      target.velocityDissipation,
      amount,
      MAX_DELTA_PER_SECOND.velocityDissipation,
      dt,
      BOUNDS.velocityDissipation,
    ),
    fluidTimestep: smoothScalar(
      current.fluidTimestep,
      target.fluidTimestep,
      amount,
      MAX_DELTA_PER_SECOND.fluidTimestep,
      dt,
      BOUNDS.fluidTimestep,
    ),
    noiseMultiplier: smoothScalar(
      current.noiseMultiplier,
      target.noiseMultiplier,
      amount,
      MAX_DELTA_PER_SECOND.noiseMultiplier,
      dt,
      BOUNDS.noiseMultiplier,
    ),
    lineVariance: smoothScalar(
      current.lineVariance,
      target.lineVariance,
      amount,
      MAX_DELTA_PER_SECOND.lineVariance,
      dt,
      BOUNDS.lineVariance,
    ),
    lineLength: smoothScalar(
      current.lineLength,
      target.lineLength,
      amount,
      MAX_DELTA_PER_SECOND.lineLength,
      dt,
      BOUNDS.lineLength,
    ),
  };

  next.noiseChannels = current.noiseChannels.map((channel, index) => {
    const targetChannel = target.noiseChannels[index];
    const bounds = BOUNDS.channels[index];
    const caps = MAX_DELTA_PER_SECOND.channels[index];

    return {
      scale: smoothScalar(channel.scale, targetChannel.scale, amount, caps.scale, dt, bounds.scale),
      multiplier: smoothScalar(
        channel.multiplier,
        targetChannel.multiplier,
        amount,
        caps.multiplier,
        dt,
        bounds.multiplier,
      ),
      offsetIncrement: smoothScalar(
        channel.offsetIncrement,
        targetChannel.offsetIncrement,
        amount,
        caps.offsetIncrement,
        dt,
        bounds.offsetIncrement,
      ),
    };
  });

  return next;
}

function targetForMode(previous, flowDna, mode, random) {
  const calm = flowDna.calmnessBias;
  const turbulence = flowDna.turbulenceBias;
  const target = cloneFlowSettings(previous);

  target.viscosity = rangeByBias(BOUNDS.viscosity, calm + flowDna.viscosityBias * 0.25, random);
  target.velocityDissipation = rangeByBias(BOUNDS.velocityDissipation, calm + flowDna.dissipationBias, random);
  target.fluidTimestep = rangeByBias(BOUNDS.fluidTimestep, 0.5 + flowDna.timestepBias, random);
  target.noiseMultiplier = rangeByBias(BOUNDS.noiseMultiplier, turbulence, random);
  target.lineVariance = rangeByBias(BOUNDS.lineVariance, turbulence, random);
  target.lineLength = rangeByBias(BOUNDS.lineLength, calm, random);

  if (mode === "calm-drift") {
    target.viscosity = rangeByBias(BOUNDS.viscosity, 0.78, random);
    target.velocityDissipation = rangeByBias(BOUNDS.velocityDissipation, 0.28, random);
    target.noiseMultiplier = rangeByBias(BOUNDS.noiseMultiplier, 0.25, random);
    target.lineVariance = rangeByBias(BOUNDS.lineVariance, 0.18, random);
  }

  if (mode === "broad-pull") {
    target.noiseChannels[0].multiplier = rangeByBias(BOUNDS.channels[0].multiplier, 0.95, random);
    target.noiseChannels[0].scale = rangeByBias(BOUNDS.channels[0].scale, 0.25, random);
    target.noiseChannels[1].multiplier = rangeByBias(BOUNDS.channels[1].multiplier, 0.42, random);
    target.noiseChannels[2].multiplier = rangeByBias(BOUNDS.channels[2].multiplier, 0.26, random);
  }

  if (mode === "turbulent-veil") {
    target.noiseMultiplier = rangeByBias(BOUNDS.noiseMultiplier, 0.72, random);
    target.lineVariance = rangeByBias(BOUNDS.lineVariance, 0.74, random);
    target.noiseChannels[1].multiplier = rangeByBias(BOUNDS.channels[1].multiplier, 0.85, random);
    target.noiseChannels[2].multiplier = rangeByBias(BOUNDS.channels[2].multiplier, 0.7, random);
  }

  if (mode === "silk-lines") {
    target.lineLength = rangeByBias(BOUNDS.lineLength, 0.8, random);
    target.lineVariance = rangeByBias(BOUNDS.lineVariance, 0.28, random);
    target.velocityDissipation = rangeByBias(BOUNDS.velocityDissipation, 0.2, random);
  }

  if (mode === "fine-shimmer") {
    target.noiseChannels[2].scale = rangeByBias(BOUNDS.channels[2].scale, 0.9, random);
    target.noiseChannels[2].multiplier = rangeByBias(BOUNDS.channels[2].multiplier, 0.86, random);
    target.noiseChannels[2].offsetIncrement = rangeByBias(BOUNDS.channels[2].offsetIncrement, 0.78, random);
  }

  target.noiseChannels = target.noiseChannels.map((channel, index) => shapeOctave(channel, index, flowDna, random));

  return clampFlowSettings(target);
}

function shapeOctave(channel, index, flowDna, random) {
  const bounds = BOUNDS.channels[index];
  const balance = flowDna.octaveBalance[index];

  return {
    scale: rangeByBias(bounds.scale, index === 0 ? 0.28 : 0.52 + balance * 0.24, random),
    multiplier: clamp(channel.multiplier * balance, bounds.multiplier[0], bounds.multiplier[1]),
    offsetIncrement: rangeByBias(bounds.offsetIncrement, 0.35 + flowDna.turbulenceBias * 0.42, random),
  };
}

function limitTargetDistance(previous, desired) {
  const next = {
    ...desired,
    viscosity: limitDelta(previous.viscosity, desired.viscosity, TARGET_DELTA.viscosity, BOUNDS.viscosity),
    velocityDissipation: limitDelta(
      previous.velocityDissipation,
      desired.velocityDissipation,
      TARGET_DELTA.velocityDissipation,
      BOUNDS.velocityDissipation,
    ),
    fluidTimestep: limitDelta(previous.fluidTimestep, desired.fluidTimestep, TARGET_DELTA.fluidTimestep, BOUNDS.fluidTimestep),
    noiseMultiplier: limitDelta(previous.noiseMultiplier, desired.noiseMultiplier, TARGET_DELTA.noiseMultiplier, BOUNDS.noiseMultiplier),
    lineVariance: limitDelta(previous.lineVariance, desired.lineVariance, TARGET_DELTA.lineVariance, BOUNDS.lineVariance),
    lineLength: limitDelta(previous.lineLength, desired.lineLength, TARGET_DELTA.lineLength, BOUNDS.lineLength),
  };

  next.noiseChannels = desired.noiseChannels.map((channel, index) => {
    const previousChannel = previous.noiseChannels[index];
    const maxDelta = TARGET_DELTA.channels[index];
    const bounds = BOUNDS.channels[index];

    return {
      scale: limitDelta(previousChannel.scale, channel.scale, maxDelta.scale, bounds.scale),
      multiplier: limitDelta(previousChannel.multiplier, channel.multiplier, maxDelta.multiplier, bounds.multiplier),
      offsetIncrement: limitDelta(
        previousChannel.offsetIncrement,
        channel.offsetIncrement,
        maxDelta.offsetIncrement,
        bounds.offsetIncrement,
      ),
    };
  });

  return next;
}

function normalizeFlowSettings(settings) {
  const source = settings || {};
  const channels = Array.from({ length: 3 }, (_, index) => ({
    ...DEFAULT_CHANNELS[index],
    ...(source.noiseChannels?.[index] || {}),
  }));

  return clampFlowSettings({
    viscosity: source.viscosity ?? 5.0,
    velocityDissipation: source.velocityDissipation ?? 0.0,
    fluidTimestep: source.fluidTimestep ?? 1 / 60,
    noiseMultiplier: source.noiseMultiplier ?? 0.45,
    lineVariance: source.lineVariance ?? 0.55,
    lineLength: source.lineLength ?? 450,
    noiseChannels: channels,
  });
}

function cloneFlowSettings(settings) {
  return {
    ...settings,
    noiseChannels: settings.noiseChannels.map((channel) => ({ ...channel })),
  };
}

function clampFlowSettings(settings) {
  return {
    ...settings,
    viscosity: clamp(settings.viscosity, ...BOUNDS.viscosity),
    velocityDissipation: clamp(settings.velocityDissipation, ...BOUNDS.velocityDissipation),
    fluidTimestep: clamp(settings.fluidTimestep, ...BOUNDS.fluidTimestep),
    noiseMultiplier: clamp(settings.noiseMultiplier, ...BOUNDS.noiseMultiplier),
    lineVariance: clamp(settings.lineVariance, ...BOUNDS.lineVariance),
    lineLength: clamp(settings.lineLength, ...BOUNDS.lineLength),
    noiseChannels: settings.noiseChannels.map((channel, index) => ({
      scale: clamp(channel.scale, ...BOUNDS.channels[index].scale),
      multiplier: clamp(channel.multiplier, ...BOUNDS.channels[index].multiplier),
      offsetIncrement: clamp(channel.offsetIncrement, ...BOUNDS.channels[index].offsetIncrement),
    })),
  };
}

function smoothScalar(current, target, amount, maxPerSecond, elapsedSeconds, bounds) {
  const smoothed = current + (target - current) * amount;
  const stepped = moveToward(current, smoothed, maxPerSecond * elapsedSeconds);

  return clamp(stepped, bounds[0], bounds[1]);
}

function moveToward(current, target, maxDelta) {
  const delta = target - current;

  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

function limitDelta(current, target, maxDelta, bounds) {
  return clamp(moveToward(current, target, maxDelta), bounds[0], bounds[1]);
}

function rangeByBias(bounds, bias, random) {
  const clampedBias = clamp(bias, 0, 1);
  const jitter = range(random, -0.16, 0.16);
  const amount = clamp(clampedBias + jitter, 0, 1);

  return bounds[0] + (bounds[1] - bounds[0]) * amount;
}

function seededRandom(seed) {
  let state = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return function next() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function range(random, min, max) {
  return min + random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
