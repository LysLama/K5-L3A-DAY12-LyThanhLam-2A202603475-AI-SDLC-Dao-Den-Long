import { TUNING } from '../sim/constants';
import type { SimEvent, SimState } from '../sim/types';
import { distXZ } from '../sim/world';
import {
  svgClock,
  svgFlame,
  svgHelp,
  svgLantern,
  svgMote,
  svgPause,
  svgPulse,
  svgSound
} from './icons';

export class HudController {
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly carriedEl = document.getElementById('hud-carried')!;
  private readonly lanternsEl = document.getElementById('hud-lanterns')!;
  private readonly timerEl = document.getElementById('hud-timer')!;
  private readonly scoreEl = document.getElementById('hud-score')!;
  private readonly pulseEl = document.getElementById('hud-pulse')!;
  private readonly promptEl = document.getElementById('hud-prompt')!;
  private readonly toastEl = document.getElementById('hud-toast')!;
  private readonly vignetteEl = document.getElementById('hit-vignette')!;
  private readonly controlsBar = document.getElementById('controls-bar')!;

  private readonly pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
  private readonly muteBtn = document.getElementById('btn-mute') as HTMLButtonElement;
  private readonly helpBtn = document.getElementById('btn-help') as HTMLButtonElement;
  private readonly overlayEl = document.getElementById('game-overlay')!;
  private readonly overlayEmblemEl = document.getElementById('overlay-emblem')!;
  private readonly overlayTitleEl = document.getElementById('overlay-title')!;
  private readonly overlaySubEl = document.getElementById('overlay-sub')!;
  private readonly overlayStatsEl = document.getElementById('overlay-stats')!;
  private readonly retryBtn = document.getElementById('btn-retry') as HTMLButtonElement;
  private readonly resumeBtn = document.getElementById('btn-resume') as HTMLButtonElement;

  private toastTimer = 0;
  private hitFlashTimer = 0;
  private controlsVisible = true;

  constructor(
    onRetry: () => void,
    onTogglePause: () => void,
    onToggleMute: () => boolean
  ) {
    this.retryBtn.addEventListener('click', () => {
      this.retryBtn.blur();
      onRetry();
    });
    this.resumeBtn.addEventListener('click', () => {
      this.resumeBtn.blur();
      onTogglePause();
    });
    this.pauseBtn.addEventListener('click', () => {
      this.pauseBtn.blur();
      onTogglePause();
    });
    this.muteBtn.addEventListener('click', () => {
      this.muteBtn.blur();
      this.setMuted(onToggleMute());
    });
    this.helpBtn.addEventListener('click', () => {
      this.helpBtn.blur();
      this.toggleHelp();
    });

    this.helpBtn.innerHTML = `${svgHelp()}<span>Phím [H]</span>`;
    this.setMuted(false);
    this.setPaused(false, 'playing');
  }

  toggleHelp(): void {
    this.controlsVisible = !this.controlsVisible;
    this.controlsBar.classList.toggle('hidden', !this.controlsVisible);
  }

  setMuted(muted: boolean): void {
    this.muteBtn.innerHTML = `${svgSound(muted)}<span>${muted ? 'Tắt [M]' : 'Âm [M]'}</span>`;
  }

  setPaused(paused: boolean, status: SimState['status']): void {
    this.pauseBtn.innerHTML = `${svgPause(paused)}<span>${paused ? 'Tiếp [P]' : 'Dừng [P]'}</span>`;
    if (status === 'playing') {
      if (paused) {
        this.overlayEl.classList.remove('hidden');
        this.overlayEmblemEl.innerHTML = svgLantern(true);
        this.overlayTitleEl.textContent = 'Đang Tạm Dừng';
        this.overlaySubEl.textContent = 'Đảo Bến vẫn đang chờ bạn thắp sáng các Đèn Lồng.';
        this.overlayStatsEl.innerHTML = '';
        this.resumeBtn.classList.remove('hidden');
        this.retryBtn.textContent = 'Chơi lại từ đầu';
      } else {
        this.overlayEl.classList.add('hidden');
        this.resumeBtn.classList.add('hidden');
      }
    }
  }

  handleEvents(events: ReadonlyArray<SimEvent>, state: SimState): void {
    for (const ev of events) {
      if (ev.name === 'lantern_lit') {
        const litCount = state.lanterns.filter((l) => l.lit).length;
        this.toastEl.textContent = `Đèn Lồng ${ev.data.lantern_id} đã bừng sáng! (${litCount}/${TUNING.lantern_count_night1})`;
        this.toastEl.classList.remove('hidden');
        this.toastTimer = 2.6;
      } else if (ev.name === 'player_hit') {
        this.vignetteEl.classList.add('active');
        this.hitFlashTimer = 0.08;
      }
    }
  }

  update(state: SimState, paused: boolean, frameDt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer = Math.max(0, this.toastTimer - frameDt);
      if (this.toastTimer === 0) this.toastEl.classList.add('hidden');
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - frameDt);
      if (this.hitFlashTimer === 0) this.vignetteEl.classList.remove('active');
    }

    // Flames
    let flamesHtml = '';
    for (let i = 0; i < TUNING.flames; i++) {
      flamesHtml += svgFlame(i < state.player.flames);
    }
    this.flamesEl.innerHTML = flamesHtml;

    // Carried motes + mini bar
    const carryScale = Math.min(1, Math.max(0, state.player.carried / TUNING.carry_capacity)).toFixed(3);
    this.carriedEl.innerHTML = `${svgMote()}<span>${state.player.carried}/${TUNING.carry_capacity}</span><span class="mini-bar"><span class="mini-bar-fill" style="transform:scaleX(${carryScale})"></span></span>`;

    // Lanterns
    let litCount = 0;
    let lanternsHtml = '';
    for (const l of state.lanterns) {
      if (l.lit) litCount += 1;
      lanternsHtml += svgLantern(l.lit);
    }
    lanternsHtml += `<span class="hud-lantern-count">${litCount}/${TUNING.lantern_count_night1}</span>`;
    this.lanternsEl.innerHTML = lanternsHtml;

    // Timer & Score
    const secs = Math.max(0, Math.ceil(state.timeLeftS));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.timerEl.innerHTML = `${svgClock()}<span>${mm}:${ss}</span>`;
    this.timerEl.classList.toggle('is-urgent', secs <= 30 && state.status === 'playing');
    this.scoreEl.innerHTML = `<span>Điểm</span><span class="hud-score-val">${state.score}</span>`;

    // Pulse bar
    const cd = state.player.pulseCooldownRemaining;
    if (cd > 0) {
      const cdScale = Math.min(1, Math.max(0, (TUNING.pulse_cooldown_s - cd) / TUNING.pulse_cooldown_s)).toFixed(3);
      this.pulseEl.className = 'pill pulse-pill is-wait';
      this.pulseEl.innerHTML = `${svgPulse()}<span>Hồi ${cd.toFixed(1)}s</span><span class="pulse-progress"><span class="pulse-progress-fill" style="transform:scaleX(${cdScale})"></span></span>`;
    } else if (state.player.carried < TUNING.pulse_cost) {
      this.pulseEl.className = 'pill pulse-pill is-wait';
      this.pulseEl.innerHTML = `${svgPulse()}<span>Tỏa Sáng: cần ${TUNING.pulse_cost} đom đóm</span>`;
    } else {
      this.pulseEl.className = 'pill pulse-pill is-ready';
      this.pulseEl.innerHTML = `${svgPulse()}<span>Tỏa Sáng sẵn sàng [Shift / Chuột phải]</span>`;
    }

    // Contextual interact prompt
    const nearUnlit = state.lanterns.find(
      (l) => !l.lit && distXZ(state.player.pos, l.pos) <= TUNING.interact_radius
    );
    if (nearUnlit && state.status === 'playing') {
      this.promptEl.classList.remove('hidden');
      this.promptEl.textContent =
        state.player.carried > 0
          ? `[E] Nạp ánh sáng vào ${nearUnlit.id} (${nearUnlit.deposited}/${TUNING.lantern_cost})`
          : `${nearUnlit.id} (${nearUnlit.deposited}/${TUNING.lantern_cost}) — Hãy thu thập thêm đom đóm`;
    } else {
      this.promptEl.classList.add('hidden');
    }

    // Win/Lose overlay
    if (state.status !== 'playing') {
      this.overlayEl.classList.remove('hidden');
      this.resumeBtn.classList.add('hidden');
      this.overlayEmblemEl.innerHTML =
        state.status === 'won' ? svgLantern(true) : svgFlame(state.player.flames > 0);
      if (state.status === 'won') {
        this.overlayTitleEl.textContent = 'Đảo Bến Đã Bừng Sáng!';
        this.overlaySubEl.textContent = 'Mây đã thắp sáng đủ 5 Đèn Lồng Lớn trước bình minh.';
      } else if (state.player.flames <= 0) {
        this.overlayTitleEl.textContent = 'Ngọn Lửa Đã Tắt...';
        this.overlaySubEl.textContent = 'Bóng Mực hoặc sương sâu đã làm Mây mất hết ánh sáng.';
      } else {
        this.overlayTitleEl.textContent = 'Bình Minh Đã Đến';
        this.overlaySubEl.textContent = 'Hết thời gian của Đêm 1 trước khi thắp đủ 5 Đèn Lồng.';
      }
      this.overlayStatsEl.innerHTML = `
        <div class="stat-box"><div class="stat-label">Đèn Lồng</div><div class="stat-val">${litCount}/${TUNING.lantern_count_night1}</div></div>
        <div class="stat-box"><div class="stat-label">Thời gian dư</div><div class="stat-val">${mm}:${ss}</div></div>
        <div class="stat-box"><div class="stat-label">Tổng điểm</div><div class="stat-val">${state.score}</div></div>
      `;
      this.retryBtn.textContent = 'Chơi lại [Enter]';
    } else if (!paused) {
      this.overlayEl.classList.add('hidden');
    }
  }
}
