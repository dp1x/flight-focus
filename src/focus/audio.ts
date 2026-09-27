export type AudioMode =
  | { type: "none" }
  | { type: "white_noise" }
  | { type: "brown_noise" }
  | { type: "cabin_hum" }
  | { type: "binaural_beats"; frequencyHz: number; brainwave: string };

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;
let currentOscLeft: OscillatorNode | null = null;
let currentOscRight: OscillatorNode | null = null;
let currentMerger: ChannelMergerNode | null = null;

export async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  return audioContext;
}

export async function generateNoiseBuffer(
  ctx: AudioContext,
  mode: "white" | "brown",
  seconds = 4,
): Promise<AudioBuffer> {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  if (mode === "white") {
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else {
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + (0.02 * white)) / 1.02;
      data[i] = lastOut * 3.5;
    }
  }

  return buffer;
}

function createCabinHumBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const seconds = 6;
  const length = sampleRate * seconds;
  const buffer = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    const base = ch === 0 ? 60 : 60.5;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const tone =
        Math.sin(2 * Math.PI * base * t) * 0.25 +
        Math.sin(2 * Math.PI * 120 * t) * 0.1 +
        Math.sin(2 * Math.PI * 180 * t + Math.sin(t * 3)) * 0.08;
      const noise = (Math.random() * 2 - 1) * 0.015;
      data[i] = tone + noise;
    }
  }

  return buffer;
}

export async function startAudioForMode(mode: AudioMode, volume = 0.7) {
  const ctx = await ensureAudioContext();
  await stopAudio(0);

  if (mode.type === "none") return;

  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  const merger = ctx.createChannelMerger(2);
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(volume, now + 1.5);
  masterGain.connect(ctx.destination);
  merger.connect(masterGain);

  currentGain = masterGain;
  currentMerger = merger;

  switch (mode.type) {
    case "white_noise":
    case "brown_noise": {
      const kind = mode.type === "white_noise" ? "white" : "brown";
      const buffer = await generateNoiseBuffer(ctx, kind);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(masterGain);
      source.start(0);
      currentSource = source;
      break;
    }
    case "cabin_hum": {
      const buffer = createCabinHumBuffer(ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(masterGain);
      source.start(0);
      currentSource = source;
      break;
    }
    case "binaural_beats": {
      if (currentOscLeft) try { currentOscLeft.stop(); } catch {}
      if (currentOscRight) try { currentOscRight.stop(); } catch {}
      const baseFreq = mode.frequencyHz || 200;
      const beatOffset = mode.brainwave === "delta"
        ? 2
        : mode.brainwave === "theta"
          ? 6
          : mode.brainwave === "alpha"
            ? 10
            : mode.brainwave === "beta"
              ? 18
              : 4;

      const oscL = ctx.createOscillator();
      oscL.type = "sine";
      oscL.frequency.value = baseFreq;
      const gainL = ctx.createGain();
      gainL.gain.value = 0.5;
      oscL.connect(gainL);
      gainL.connect(merger, 0, 0);

      const oscR = ctx.createOscillator();
      oscR.type = "sine";
      oscR.frequency.value = baseFreq + beatOffset;
      const gainR = ctx.createGain();
      gainR.gain.value = 0.5;
      oscR.connect(gainR);
      gainR.connect(merger, 0, 1);

      oscL.start(0);
      oscR.start(0);
      currentOscLeft = oscL;
      currentOscRight = oscR;
      break;
    }
  }
}

export async function stopAudio(fadeMs = 800) {
  const ctx = audioContext;
  if (!ctx) return;
  const now = ctx.currentTime;
  const source = currentSource;
  const oscLeft = currentOscLeft;
  const oscRight = currentOscRight;
  const gain = currentGain;
  const merger = currentMerger;

  currentSource = null;
  currentOscLeft = null;
  currentOscRight = null;
  currentGain = null;
  currentMerger = null;

  const finish = () => {
    if (source) {
      try { source.stop(); } catch {}
      source.disconnect();
    }
    if (oscLeft) {
      try { oscLeft.stop(); } catch {}
      oscLeft.disconnect();
    }
    if (oscRight) {
      try { oscRight.stop(); } catch {}
      oscRight.disconnect();
    }
    if (gain) {
      gain.disconnect();
    }
    if (merger) {
      merger.disconnect();
    }
  };

  if (fadeMs > 0 && gain) {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
      setTimeout(finish, fadeMs + 50);
      return;
    } catch {
      // fallback to immediate stop
    }
  }

  finish();
}

export async function setAudioVolume(level: number) {
  if (!currentGain || !audioContext) return;
  currentGain.gain.linearRampToValueAtTime(
    level,
    audioContext.currentTime + 0.2,
  );
}
