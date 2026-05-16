const TEXTURE_SIZE = 500;

export const COLOR_THEORY_CORPUS = {
  version: 1,
  sources: [
    {
      id: "pantone-harmonies",
      label: "Pantone Connect harmonies",
      patterns: [
        "analogous",
        "complementary",
        "monochromatic",
        "splitComplementary",
        "triadic",
        "tetradic",
      ],
    },
    {
      id: "adobe-color-wheel",
      label: "Adobe Color wheel",
      patterns: [
        "monochromatic",
        "complementary",
        "analogous",
        "triadic",
        "splitComplementary",
      ],
    },
    {
      id: "munsell",
      label: "Munsell hue value chroma model",
      dimensions: ["hue", "value", "chroma"],
    },
    {
      id: "albers",
      label: "Interaction of Color",
      principles: ["relativity", "temperature", "intensity", "boundary"],
    },
    {
      id: "colorbrewer",
      label: "ColorBrewer scheme families",
      patterns: ["sequential", "diverging", "qualitative"],
    },
    {
      id: "css-color-4",
      label: "CSS Color 4 OKLCH/OKLab",
      colorSpaces: ["oklch", "oklab"],
    },
  ],
  harmonyRules: {
    monochromatic: {
      id: "monochromatic",
      role: "rest",
      hueOffsets: [0],
      harmonyScore: 0.94,
      noveltyTarget: 0.055,
    },
    analogous: {
      id: "analogous",
      role: "drift",
      hueOffsets: [-32, 0, 32],
      harmonyScore: 0.98,
      noveltyTarget: 0.075,
    },
    complementary: {
      id: "complementary",
      role: "contrast",
      hueOffsets: [0, 180],
      harmonyScore: 0.86,
      noveltyTarget: 0.095,
    },
    splitComplementary: {
      id: "splitComplementary",
      role: "accent",
      hueOffsets: [0, 150, 210],
      harmonyScore: 0.9,
      noveltyTarget: 0.1,
    },
    triadic: {
      id: "triadic",
      role: "pivot",
      hueOffsets: [0, 120, 240],
      harmonyScore: 0.82,
      noveltyTarget: 0.115,
    },
    tetradic: {
      id: "tetradic",
      role: "rare",
      hueOffsets: [0, 60, 180, 240],
      harmonyScore: 0.76,
      noveltyTarget: 0.12,
    },
  },
  paletteRoles: ["ground", "body", "lift", "accent", "mist"],
};

export const PALETTE_SCHEMA = {
  version: 1,
  colorSpace: "oklch",
  roles: COLOR_THEORY_CORPUS.paletteRoles,
  motion: {
    model: "seeded-motion-dna",
    easing: "minimum-jerk",
    principle: "ambient full-field motion should stay continuous and low-jolt",
  },
  constraints: {
    dominance: "ground/body carry most of the texture; accent is limited",
    chromaEnvelope: "chroma is reduced near very low and very high lightness",
    gamut: "colors are softened until they fit in sRGB",
    continuity: "each step preserves seed DNA and at least one visible trait",
    novelty: "each step moves hue, lightness, or chroma enough to avoid sameness",
  },
};

const HARMONY_IDS = Object.keys(COLOR_THEORY_CORPUS.harmonyRules);
const CANDIDATE_COUNT = 8;
const ROLE_WEIGHTS = {
  ground: 0.24,
  body: 0.32,
  lift: 0.18,
  accent: 0.12,
  mist: 0.14,
};

const PRESETS = {
  silver: {
    version: 1,
    colorSpace: "oklch",
    seed: "silver",
    step: 0,
    harmonyRule: "monochromatic",
    seedDna: createSeedDna("silver"),
    roles: {
      ground: color(0.19, 0.006, 95),
      body: color(0.5, 0.009, 104),
      lift: color(0.84, 0.009, 98),
      accent: color(0.6, 0.012, 112),
      mist: color(0.7, 0.007, 88),
    },
    texture: {
      glints: 18,
      grain: 0.07,
      angle: 0,
    },
    motionDna: createMotionDna(createSeedDna("silver")),
  },
};

export function generatedPresetEntries() {
  return Object.keys(PRESETS).map((id) => ({
    id,
    name: titleCase(id),
    colorMode: `generated:${id}`,
  }));
}

export function imageReferenceEntries() {
  return [
    ["silver", "colors/silver.png"],
    ["gumdrop", "colors/gumdrop.png"],
    ["freedom", "colors/freedom.png"],
    ["poolside", "colors/poolside.png"],
    ["plasma", "colors/plasma.png"],
    ["original", "colors/original.png"],
  ].map(([name, path]) => ({ name, path }));
}

export function randomGeneratedMode(seed = randomSeed()) {
  return `generated:random:${seed}`;
}

export function nextCycleMode(index) {
  return `generated:cycle:${index}`;
}

export function isGeneratedColorMode(path) {
  return typeof path === "string" && path.startsWith("generated:");
}

export function createInitialPaletteState(seed = randomSeed()) {
  const seedDna = createSeedDna(seed);
  const ruleId = seedDna.harmonySchedule[0];
  const random = seededRandom(`${seed}:initial:${ruleId}`);
  const anchorHue = wrapHue(seedDna.anchorHue + range(random, -12, 12));

  return createPaletteState({
    seed: `${seed}:0`,
    step: 0,
    seedDna,
    harmonyRule: ruleId,
    anchorHue,
    previous: null,
    random,
  });
}

export function chooseNextPaletteState(previousState, stepIndex) {
  const previous = previousState || createInitialPaletteState();
  const candidates = Array.from({ length: CANDIDATE_COUNT }, (_, index) => {
    const ruleId = ruleForCandidate(previous.seedDna, stepIndex, index);
    const random = seededRandom(`${previous.seedDna.seed}:${stepIndex}:${index}:${ruleId}`);
    const anchorHue = nextAnchorHue(previous, ruleId, random, index);

    return createPaletteState({
      seed: `${previous.seedDna.seed}:${stepIndex}:${index}`,
      step: stepIndex,
      seedDna: previous.seedDna,
      harmonyRule: ruleId,
      anchorHue,
      previous,
      random,
    });
  });

  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(previous, candidate),
    }))
    .sort((left, right) => right.score - left.score)[0].candidate;
}

export function createMotionDna(seedDna) {
  const random = seededRandom(`${seedDna.seed}:motion-dna`);
  const tempoBias = range(random, -1, 1);
  const atmosphereTempo = lerp(0.96, 1.04, seedDna.atmosphereBias);
  const basePeriodMs = Math.round(5000 * atmosphereTempo + tempoBias * 120);

  return {
    version: 1,
    seed: seedDna.seed,
    basePeriodMs: clamp(basePeriodMs, 4800, 5200),
    periodVariance: range(random, 0.08, 0.14),
    easingFamily: "minimumJerk",
    uploadCadenceMs: Math.round(range(random, 200, 240)),
    lowMotionCadenceMs: Math.round(range(random, 30000, 42000)),
    luminanceDeltaLimitPerSecond: range(random, 0.09, 0.13),
    chromaDeltaLimitPerSecond: range(random, 0.018, 0.028),
    textureDriftPeriodMs: Math.round(range(random, 18000, 45000)),
  };
}

export function timingForPaletteStep(previousState, nextState, stepIndex, options = {}) {
  const motionDna =
    nextState?.motionDna ||
    previousState?.motionDna ||
    createMotionDna(previousState?.seedDna || createSeedDna(randomSeed()));
  const random = seededRandom(`${motionDna.seed}:motion-step:${stepIndex}`);
  const luminanceDelta = previousState && nextState ? averageRoleDelta(previousState, nextState, "l") : 0;
  const chromaDelta = previousState && nextState ? averageRoleDelta(previousState, nextState, "c") : 0;
  const variance = range(random, -motionDna.periodVariance, motionDna.periodVariance);
  const luminancePerSecond = luminanceDelta / (motionDna.basePeriodMs / 1000);
  const chromaPerSecond = chromaDelta / (motionDna.basePeriodMs / 1000);
  const luminanceBoost = clamp(luminancePerSecond / motionDna.luminanceDeltaLimitPerSecond, 0, 1) * 0.08;
  const chromaBoost = clamp(chromaPerSecond / motionDna.chromaDeltaLimitPerSecond, 0, 1) * 0.06;
  const durationMs = Math.round(
    clamp(motionDna.basePeriodMs * (1 + variance + luminanceBoost + chromaBoost), 4300, 5700),
  );

  if (options.reducedMotion) {
    return {
      durationMs: 0,
      uploadCadenceMs: motionDna.uploadCadenceMs,
      lowMotionCadenceMs: motionDna.lowMotionCadenceMs,
      easingFamily: "none",
      luminanceDelta,
      chromaDelta,
      reducedMotion: true,
    };
  }

  return {
    durationMs,
    uploadCadenceMs: motionDna.uploadCadenceMs,
    lowMotionCadenceMs: motionDna.lowMotionCadenceMs,
    easingFamily: motionDna.easingFamily,
    luminanceDelta,
    chromaDelta,
    reducedMotion: false,
  };
}

export async function createGeneratedColorBitmap(path) {
  return createBitmapFromPaletteState(descriptorFromPath(path));
}

export async function createBitmapFromPaletteState(state) {
  const descriptor = descriptorFromPaletteState(state);
  const canvas = makeCanvas(TEXTURE_SIZE, TEXTURE_SIZE);
  const context = canvas.getContext("2d", { alpha: false });
  const random = seededRandom(descriptor.seed);

  paintGradient(context, descriptor, random);
  paintGlints(context, descriptor, random);
  paintGrain(context, descriptor, random);

  if ("transferToImageBitmap" in canvas) {
    return canvas.transferToImageBitmap();
  }

  return createImageBitmap(canvas);
}

function createSeedDna(seed) {
  const random = seededRandom(seed);
  const schedule = shuffle(HARMONY_IDS, random);

  return {
    version: 1,
    seed,
    anchorHue: random() * 360,
    temperatureBias: range(random, -1, 1),
    contrastBias: range(random, 0.45, 1),
    chromaBias: range(random, 0.68, 1.08),
    atmosphereBias: range(random, 0.2, 1),
    motionBias: range(random, 0.75, 1.25),
    harmonySchedule: schedule,
  };
}

function createPaletteState({ seed, step, seedDna, harmonyRule, anchorHue, previous, random }) {
  const rule = COLOR_THEORY_CORPUS.harmonyRules[harmonyRule];
  const offsets = rule.hueOffsets;
  const temperature = seedDna.temperatureBias;
  const chromaBias = seedDna.chromaBias;
  const contrast = seedDna.contrastBias;
  const atmosphere = seedDna.atmosphereBias;
  const continuity = previous ? continuityTraits(previous, random) : null;
  const baseHue = wrapHue(anchorHue + temperature * 7);
  const companionHue = wrapHue(baseHue + pickOffset(offsets, random, 1) + range(random, -8, 8));
  const accentHue = wrapHue(baseHue + pickOffset(offsets, random, 2) + range(random, -12, 12));
  const mistHue = wrapHue(mixHue(baseHue, companionHue, 0.42) + range(random, -10, 10));

  const lightness = lightnessProfile(contrast, atmosphere, random, continuity);
  const chroma = chromaProfile(chromaBias, harmonyRule, atmosphere, random, continuity);
  const roles = {
    ground: fitColor(lightness.ground, chroma.ground, baseHue),
    body: fitColor(lightness.body, chroma.body, companionHue),
    lift: fitColor(lightness.lift, chroma.lift, mistHue),
    accent: fitColor(lightness.accent, chroma.accent, accentHue),
    mist: fitColor(lightness.mist, chroma.mist, mistHue),
  };

  return {
    ...PALETTE_SCHEMA,
    seed,
    step,
    seedDna,
    motionDna: createMotionDna(seedDna),
    harmonyRule,
    anchorHue: baseHue,
    roles,
    texture: {
      glints: Math.round(range(random, 16, 30) * (0.82 + atmosphere * 0.28)),
      grain: range(random, 0.048, 0.11) * (0.8 + atmosphere * 0.36),
      angle: range(random, -0.25, 0.25),
    },
  };
}

function continuityTraits(previous, random) {
  const trait = random();

  if (trait < 0.34) {
    return { type: "lightness", roles: previous.roles };
  }

  if (trait < 0.67) {
    return { type: "chroma", roles: previous.roles };
  }

  return { type: "temperature", anchorHue: previous.anchorHue };
}

function lightnessProfile(contrast, atmosphere, random, continuity) {
  const lift = range(random, 0.74, 0.89) + contrast * 0.025;
  const ground = range(random, 0.16, 0.27) - contrast * 0.025;
  const body = range(random, 0.4, 0.58);
  const accent = range(random, 0.46, 0.68);
  const mist = range(random, 0.62, 0.78) + atmosphere * 0.035;
  const profile = { ground, body, lift, accent, mist };

  if (continuity?.type === "lightness") {
    for (const role of Object.keys(profile)) {
      profile[role] = lerp(profile[role], continuity.roles[role].l, 0.24);
    }
  }

  return {
    ground: clamp(profile.ground, 0.13, 0.32),
    body: clamp(profile.body, 0.34, 0.64),
    lift: clamp(profile.lift, 0.68, 0.91),
    accent: clamp(profile.accent, 0.38, 0.72),
    mist: clamp(profile.mist, 0.56, 0.84),
  };
}

function chromaProfile(chromaBias, harmonyRule, atmosphere, random, continuity) {
  const rulePush = {
    monochromatic: 0.72,
    analogous: 0.86,
    complementary: 0.98,
    splitComplementary: 1.04,
    triadic: 0.9,
    tetradic: 0.78,
  }[harmonyRule];
  const profile = {
    ground: range(random, 0.016, 0.05),
    body: range(random, 0.04, 0.1),
    lift: range(random, 0.018, 0.07),
    accent: range(random, 0.06, 0.15),
    mist: range(random, 0.012, 0.05),
  };

  for (const role of Object.keys(profile)) {
    profile[role] *= chromaBias * rulePush * (0.9 + atmosphere * 0.18);
  }

  if (continuity?.type === "chroma") {
    for (const role of Object.keys(profile)) {
      profile[role] = lerp(profile[role], continuity.roles[role].c, 0.2);
    }
  }

  if (harmonyRule === "monochromatic") {
    profile.accent *= 0.72;
  }

  if (harmonyRule === "tetradic") {
    profile.ground *= 0.72;
    profile.lift *= 0.76;
    profile.mist *= 0.7;
  }

  return profile;
}

function ruleForCandidate(seedDna, stepIndex, candidateIndex) {
  const schedule = seedDna.harmonySchedule;
  const scheduleIndex = (stepIndex + candidateIndex) % schedule.length;

  if (candidateIndex === 0) return schedule[stepIndex % schedule.length];
  if (candidateIndex === 1) return "analogous";
  if (candidateIndex === 2) return "splitComplementary";
  if (candidateIndex === 3) return "monochromatic";

  return schedule[scheduleIndex];
}

function nextAnchorHue(previous, ruleId, random, candidateIndex) {
  const direction = random() < 0.5 ? -1 : 1;
  const motion = previous.seedDna.motionBias;
  const windows = {
    monochromatic: [18, 30],
    analogous: [24, 48],
    complementary: [18, 42],
    splitComplementary: [32, 58],
    triadic: [42, 72],
    tetradic: [36, 64],
  };
  const [min, max] = windows[ruleId];
  const offset = range(random, min, max) * motion;
  const rareNudge = candidateIndex === 7 ? 180 + range(random, -18, 18) : 0;

  return wrapHue(previous.anchorHue + direction * offset + rareNudge);
}

function scoreCandidate(previous, candidate) {
  const rule = COLOR_THEORY_CORPUS.harmonyRules[candidate.harmonyRule];
  const perceptualDistance = paletteDistance(previous, candidate);
  const hueMove = hueDistance(previous.anchorHue, candidate.anchorHue);
  const novelty = scoreWindow(perceptualDistance, 0.052, 0.15, rule.noveltyTarget);
  const continuity = scoreContinuity(previous, candidate, hueMove);
  const gamutSafety = scoreGamut(candidate);
  const tonalBalance = scoreTonalBalance(candidate);
  const textureUsefulness = scoreTexture(candidate);

  return (
    rule.harmonyScore * 0.28 +
    continuity * 0.22 +
    novelty * 0.2 +
    gamutSafety * 0.14 +
    tonalBalance * 0.1 +
    textureUsefulness * 0.06
  );
}

function scoreContinuity(previous, candidate, hueMove) {
  const motionScore = scoreWindow(hueMove, 18, 86, 44);
  const lightnessDelta = averageRoleDelta(previous, candidate, "l");
  const chromaDelta = averageRoleDelta(previous, candidate, "c");
  const lightnessContinuity = 1 - clamp(lightnessDelta / 0.22, 0, 1);
  const chromaContinuity = 1 - clamp(chromaDelta / 0.1, 0, 1);

  return clamp(motionScore * 0.5 + lightnessContinuity * 0.32 + chromaContinuity * 0.18, 0, 1);
}

function scoreGamut(candidate) {
  const scores = Object.values(candidate.roles).map((role) => {
    const raw = oklchToLinearSrgb(role.l, role.c, role.h);
    const overflow = Math.max(
      Math.abs(Math.min(0, raw.r)),
      Math.abs(Math.min(0, raw.g)),
      Math.abs(Math.min(0, raw.b)),
      Math.max(0, raw.r - 1),
      Math.max(0, raw.g - 1),
      Math.max(0, raw.b - 1),
    );

    return 1 - clamp(overflow * 6, 0, 1);
  });

  return average(scores);
}

function scoreTonalBalance(candidate) {
  const { ground, body, lift, accent, mist } = candidate.roles;
  const ordered = ground.l < body.l && body.l < lift.l;
  const accentInBand = accent.l > 0.36 && accent.l < 0.75;
  const mistInBand = mist.l > body.l && mist.l < 0.86;
  const contrast = lift.l - ground.l;
  const contrastScore = scoreWindow(contrast, 0.38, 0.74, 0.56);

  return clamp(
    contrastScore * 0.55 +
      (ordered ? 0.22 : 0) +
      (accentInBand ? 0.13 : 0) +
      (mistInBand ? 0.1 : 0),
    0,
    1,
  );
}

function scoreTexture(candidate) {
  const chromas = Object.values(candidate.roles).map((role) => role.c);
  const chromaRange = Math.max(...chromas) - Math.min(...chromas);
  const accentDominance = candidate.roles.accent.c / Math.max(0.001, average(chromas));
  const chromaScore = scoreWindow(chromaRange, 0.025, 0.12, 0.065);
  const accentScore = scoreWindow(accentDominance, 1.15, 2.8, 1.85);

  return chromaScore * 0.58 + accentScore * 0.42;
}

function descriptorFromPath(path) {
  const [, kind, seed] = path.split(":");

  if (kind === "random") {
    return createInitialPaletteState(seed || randomSeed());
  }

  if (kind === "cycle") {
    const initial = createInitialPaletteState(seed || randomSeed());
    return chooseNextPaletteState(initial, Number(seed) || 1);
  }

  if (kind === "startup") {
    return createInitialPaletteState();
  }

  return PRESETS[kind] || PRESETS.silver;
}

function descriptorFromPaletteState(state) {
  const { ground, body, lift, accent, mist } = state.roles;
  const shadowHue = mixHue(ground.h, accent.h, 0.18);

  return {
    seed: state.seed,
    stops: [
      [0, ground.l, ground.c, ground.h],
      [0.15, lerp(ground.l, body.l, 0.54), lerp(ground.c, body.c, 0.7), mixHue(ground.h, body.h, 0.62)],
      [0.34, body.l, body.c, body.h],
      [0.55, lift.l, lift.c, lift.h],
      [0.77, accent.l, accent.c, accent.h],
      [1, Math.max(0.14, ground.l + 0.04), Math.max(0.006, mist.c * 0.72), shadowHue],
    ],
    glints: state.texture.glints,
    grain: state.texture.grain,
    angle: state.texture.angle,
  };
}

function paintGradient(context, descriptor, random) {
  const angle = descriptor.angle + range(random, -0.04, 0.04);
  const gradient = context.createLinearGradient(
    TEXTURE_SIZE * (0.08 + angle),
    0,
    TEXTURE_SIZE * (0.95 - angle),
    TEXTURE_SIZE,
  );

  for (const [offset, lightness, chroma, hue] of descriptor.stops) {
    gradient.addColorStop(offset, rgbString(oklchToRgb(lightness, chroma, hue)));
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
}

function paintGlints(context, descriptor, random) {
  context.globalCompositeOperation = "screen";

  for (let index = 0; index < descriptor.glints; index += 1) {
    const stop = descriptor.stops[Math.floor(random() * descriptor.stops.length)];
    const colorValue = oklchToRgb(
      Math.min(0.92, stop[1] + range(random, 0.04, 0.15)),
      Math.max(0.004, stop[2] * range(random, 0.32, 1.08)),
      stop[3] + range(random, -20, 20),
    );

    context.fillStyle = rgbString(colorValue);
    context.globalAlpha = range(random, 0.04, 0.14);
    context.beginPath();
    context.ellipse(
      range(random, -40, TEXTURE_SIZE + 40),
      range(random, -40, TEXTURE_SIZE + 40),
      range(random, 32, 150),
      range(random, 14, 78),
      range(random, 0, Math.PI),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
}

function paintGrain(context, descriptor, random) {
  const imageData = context.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const data = imageData.data;
  const amount = descriptor.grain * 255;

  for (let index = 0; index < data.length; index += 4) {
    const noise = (random() - 0.5) * amount;
    data[index] = clampByte(data[index] + noise);
    data[index + 1] = clampByte(data[index + 1] + noise);
    data[index + 2] = clampByte(data[index + 2] + noise);
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

function fitColor(lightness, chroma, hue) {
  const l = clamp(lightness, 0.08, 0.94);
  let c = Math.min(chroma, chromaLimit(l));
  let attempts = 0;

  while (attempts < 16 && !isInGamut(oklchToLinearSrgb(l, c, hue))) {
    c *= 0.88;
    attempts += 1;
  }

  return color(l, c, hue);
}

function color(l, c, h) {
  return { l, c, h: wrapHue(h) };
}

function chromaLimit(lightness) {
  const edgeFade = Math.sin(clamp(lightness, 0, 1) * Math.PI);
  return 0.02 + edgeFade * 0.15;
}

function makeCanvas(width, height) {
  if ("OffscreenCanvas" in window) {
    return new OffscreenCanvas(width, height);
  }

  return Object.assign(document.createElement("canvas"), { width, height });
}

function randomSeed() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (part) => part.toString(36)).join("-");
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

function shuffle(items, random) {
  const output = [...items];

  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }

  return output;
}

function pickOffset(offsets, random, fallbackIndex) {
  if (!offsets.length) return 0;
  if (offsets.length === 1) return offsets[0];

  const index = Math.min(offsets.length - 1, fallbackIndex);
  return random() < 0.72 ? offsets[index] : offsets[Math.floor(random() * offsets.length)];
}

function hueDistance(left, right) {
  const distance = Math.abs(wrapHue(left) - wrapHue(right));
  return Math.min(distance, 360 - distance);
}

function mixHue(left, right, amount) {
  const a = wrapHue(left);
  const b = wrapHue(right);
  const delta = ((b - a + 540) % 360) - 180;
  return wrapHue(a + delta * amount);
}

function paletteDistance(left, right) {
  const distances = Object.keys(ROLE_WEIGHTS).map((role) => {
    const leftLab = oklchToOklab(left.roles[role]);
    const rightLab = oklchToOklab(right.roles[role]);
    const distance = Math.hypot(
      leftLab.l - rightLab.l,
      leftLab.a - rightLab.a,
      leftLab.b - rightLab.b,
    );

    return distance * ROLE_WEIGHTS[role];
  });

  return distances.reduce((sum, value) => sum + value, 0);
}

function averageRoleDelta(left, right, key) {
  return average(
    Object.keys(ROLE_WEIGHTS).map(
      (role) => Math.abs(left.roles[role][key] - right.roles[role][key]) * ROLE_WEIGHTS[role],
    ),
  );
}

function oklchToOklab({ l, c, h }) {
  const radians = (h * Math.PI) / 180;
  return {
    l,
    a: c * Math.cos(radians),
    b: c * Math.sin(radians),
  };
}

function oklchToRgb(lightness, chroma, hue) {
  const fitted = fitColor(lightness, chroma, hue);
  const rgb = oklchToLinearSrgb(fitted.l, fitted.c, fitted.h);

  return {
    r: linearToSrgb(rgb.r) * 255,
    g: linearToSrgb(rgb.g) * 255,
    b: linearToSrgb(rgb.b) * 255,
  };
}

function oklchToLinearSrgb(lightness, chroma, hue) {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function linearToSrgb(value) {
  const clamped = clamp(value, 0, 1);
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function isInGamut(rgb) {
  return rgb.r >= 0 && rgb.r <= 1 && rgb.g >= 0 && rgb.g <= 1 && rgb.b >= 0 && rgb.b <= 1;
}

function rgbString({ r, g, b }) {
  return `rgb(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)})`;
}

function scoreWindow(value, min, max, target) {
  if (value < min || value > max) {
    const nearest = value < min ? min : max;
    const distance = Math.abs(value - nearest);
    return clamp(1 - distance / Math.max(target, max - min), 0, 1) * 0.48;
  }

  return clamp(1 - Math.abs(value - target) / Math.max(target - min, max - target), 0, 1);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function lerp(left, right, amount) {
  return left + (right - left) * amount;
}

function wrapHue(hue) {
  return ((hue % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampByte(value) {
  return Math.round(clamp(value, 0, 255));
}

function titleCase(value) {
  return value.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? " " : ""}${letter.toUpperCase()}`);
}
