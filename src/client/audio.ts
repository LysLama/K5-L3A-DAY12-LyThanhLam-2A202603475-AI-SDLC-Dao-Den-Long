import type { SimEvent } from '../sim/types';

export class Soundscape {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
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
    this.ensureContext();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gainPeak: number, delay = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  handleEvents(events: ReadonlyArray<SimEvent>): void {
    if (this.muted || events.length === 0) return;
    for (const ev of events) {
      if (ev.name === 'mote_picked') {
        const pitch = 660 + (ev.data.carried % 5) * 65;
        this.tone(pitch, 0.22, 'sine', 0.08);
        this.tone(pitch * 1.5, 0.28, 'triangle', 0.04, 0.04);
      } else if (ev.name === 'deposit') {
        this.tone(440, 0.2, 'triangle', 0.08);
        this.tone(554.37, 0.25, 'sine', 0.06, 0.06);
      } else if (ev.name === 'lantern_lit') {
        [392, 493.88, 587.33, 783.99].forEach((f, idx) => {
          this.tone(f, 0.75, 'sine', 0.08, idx * 0.07);
        });
      } else if (ev.name === 'pulse') {
        this.tone(330, 0.45, 'sine', 0.1);
        this.tone(660, 0.45, 'triangle', 0.07, 0.04);
      } else if (ev.name === 'player_hit') {
        this.tone(180, 0.32, 'sawtooth', 0.07);
        this.tone(130, 0.35, 'sine', 0.08, 0.06);
      } else if (ev.name === 'game_over') {
        if (ev.data.result === 'won') {
          [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
            this.tone(f, 0.9, 'triangle', 0.09, idx * 0.1);
          });
        } else {
          [293.66, 246.94, 196.0].forEach((f, idx) => {
            this.tone(f, 0.6, 'sine', 0.08, idx * 0.14);
          });
        }
      }
    }
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
