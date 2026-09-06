import type { SimulationEvent } from "../sim";

export type SoundKind = "shot" | "impact" | "explosion" | "item" | "clear" | "gameOver" | "complete";

export function soundForEvent(event: SimulationEvent): SoundKind {
  switch (event.type) {
    case "shot": return "shot";
    case "impact": return "impact";
    case "explosion": return "explosion";
    case "itemPicked": return "item";
    case "stageClear": return "clear";
    case "gameOver": return "gameOver";
    case "completed": return "complete";
  }
}

export class PixelAudio {
  private context: AudioContext | null = null;
  private unlocked = false;

  unlock(): void {
    if (this.unlocked) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().then(() => { this.unlocked = true; }).catch(() => undefined);
    } catch {
      this.context = null;
    }
  }

  consume(events: readonly SimulationEvent[]): void {
    if (!this.unlocked || this.context === null) return;
    for (const event of events) {
      try {
        this.play(soundForEvent(event));
      } catch {
        // Audio is optional output; synthesis failure must never stop the game loop.
      }
    }
  }

  playUi(kind: "move" | "confirm" | "pause" | "blocked"): void {
    if (!this.unlocked || this.context === null) return;
    try {
      const frequency = { move: 330, confirm: 660, pause: 220, blocked: 110 }[kind];
      this.tone(frequency, 0.045, "square", 0.035);
    } catch {
      // Audio is optional output; synthesis failure must never stop interaction.
    }
  }

  close(): void {
    const context = this.context;
    this.context = null;
    this.unlocked = false;
    if (context !== null) void context.close().catch(() => undefined);
  }

  private play(kind: SoundKind): void {
    switch (kind) {
      case "shot": this.tone(260, 0.055, "square", 0.045, 110); break;
      case "impact": this.noise(0.05, 0.035); break;
      case "explosion": this.noise(0.18, 0.08); this.tone(90, 0.16, "sawtooth", 0.035, 40); break;
      case "item": this.sequence([523, 784], 0.055); break;
      case "clear": this.sequence([392, 523, 659], 0.1); break;
      case "gameOver": this.sequence([294, 220, 147], 0.15); break;
      case "complete": this.sequence([392, 523, 659, 784], 0.1); break;
    }
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFrequency = frequency,
    offset = 0,
  ): void {
    const context = this.context;
    if (context === null) return;
    const start = context.currentTime + offset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.linearRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  private noise(duration: number, volume: number): void {
    const context = this.context;
    if (context === null) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let state = 0x51f15e;
    for (let index = 0; index < length; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      channel[index] = ((state >>> 8) / 0x7fffff - 1) * (1 - index / length);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    source.start();
  }

  private sequence(frequencies: readonly number[], duration: number): void {
    frequencies.forEach((frequency, index) => {
      this.tone(frequency, duration * 0.85, "square", 0.035, frequency, index * duration);
    });
  }
}
