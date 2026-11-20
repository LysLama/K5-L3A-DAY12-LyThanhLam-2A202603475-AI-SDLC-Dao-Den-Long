import type { SimEvent } from '../sim/types';

export class Soundscape {
  private ctx: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private ambientOscs: OscillatorNode[] = [];
  muted = false;
  volume = 0.75;

  private ensureContext(): AudioContext | null {
    if (this.muted || this.volume <= 0.001 || typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && !this.ambientGain) {
      this.startAmbientDrone(ctx);
    }
  }

  setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.ambientGain && this.ctx) {
      const target = this.muted ? 0.0001 : Math.max(0.0001, 0.022 * this.volume);
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ambientGain && this.ctx) {
      const target = this.muted ? 0.0001 : Math.max(0.0001, 0.022 * this.volume);
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
    return this.muted;
  }

  private startAmbientDrone(ctx: AudioContext): void {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;

    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0.0001 : Math.max(0.0001, 0.022 * this.volume);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // Warm pentatonic night drone (D3 + A3)
    const freqs = [146.83, 220.0];
    this.ambientOscs = freqs.map((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start();
      return osc;
    });
    this.ambientGain = gain;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gainPeak: number,
    delay = 0,
    sweepToFreq?: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (sweepToFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepToFreq), now + dur);
    }
    const peak = Math.max(0.0001, gainPeak * this.volume);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playJump(): void {
    this.tone(280, 0.14, 'sine', 0.06, 0, 510);
  }

  playWindCue(active: boolean): void {
    if (active) {
      this.tone(240, 0.48, 'triangle', 0.07, 0, 180);
    } else {
      this.tone(660, 0.25, 'sine', 0.045, 0, 587);
    }
  }

  playCountdownTick(secsLeft: number): void {
    const pitch = secsLeft <= 3 ? 987.77 : 783.99;
    this.tone(pitch, 0.11, 'sine', 0.055);
  }

  playUiClick(): void {
    this.tone(540, 0.07, 'sine', 0.05, 0, 680);
  }

  handleEvents(events: ReadonlyArray<SimEvent>): void {
    if (this.muted || events.length === 0) return;
    for (const ev of events) {
      if (ev.name === 'mote_picked') {
        const pitch = 660 + (ev.data.carried % 5) * 65;
        this.tone(pitch, 0.2, 'sine', 0.08);
        this.tone(pitch * 1.5, 0.24, 'triangle', 0.04, 0.03);
      } else if (ev.name === 'dash') {
        this.tone(420, 0.16, 'triangle', 0.075, 0, 860);
      } else if (ev.name === 'charm_picked') {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
          this.tone(f, 0.35, 'sine', 0.07, idx * 0.045);
        });
      } else if (ev.name === 'deposit') {
        this.tone(440, 0.18, 'triangle', 0.08);
        this.tone(554.37, 0.22, 'sine', 0.06, 0.05);
      } else if (ev.name === 'lantern_lit') {
        [392, 493.88, 587.33, 783.99].forEach((f, idx) => {
          this.tone(f, 0.72, 'sine', 0.08, idx * 0.07);
        });
      } else if (ev.name === 'pulse') {
        this.tone(330, 0.42, 'sine', 0.1);
        this.tone(660, 0.42, 'triangle', 0.07, 0.04);
      } else if (ev.name === 'drifter_steal') {
        this.tone(920, 0.28, 'sine', 0.075, 0, 440);
      } else if (ev.name === 'drifter_drop') {
        this.tone(680, 0.24, 'triangle', 0.07, 0, 960);
      } else if (ev.name === 'shade_spawned') {
        this.tone(110, 0.45, 'triangle', 0.06, 0, 82);
      } else if (ev.name === 'player_hit') {
        this.tone(180, 0.32, 'sawtooth', 0.07);
        this.tone(130, 0.35, 'sine', 0.08, 0.06);
      } else if (ev.name === 'game_over') {
        if (ev.data.result === 'won') {
          [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
            this.tone(f, 0.85, 'triangle', 0.09, idx * 0.09);
          });
        } else {
          [293.66, 246.94, 196.0].forEach((f, idx) => {
            this.tone(f, 0.6, 'sine', 0.08, idx * 0.13);
          });
        }
      }
    }
  }

  dispose(): void {
    for (const osc of this.ambientOscs) {
      try {
        osc.stop();
      } catch {
        // ignore stopped osc
      }
    }
    this.ambientOscs = [];
    this.ambientGain = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
