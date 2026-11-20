import { TUNING } from '../sim/constants';
import type { SimState } from '../sim/types';
import { distXZ } from '../sim/world';

export class HudController {
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly carriedEl = document.getElementById('hud-carried')!;
  private readonly lanternsEl = document.getElementById('hud-lanterns')!;
  private readonly timerEl = document.getElementById('hud-timer')!;
  private readonly scoreEl = document.getElementById('hud-score')!;
  private readonly pulseStatusEl = document.getElementById('hud-pulse')!;
  private readonly promptEl = document.getElementById('hud-prompt')!;
  private readonly pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
  private readonly muteBtn = document.getElementById('btn-mute') as HTMLButtonElement;
  private readonly overlayEl = document.getElementById('game-overlay')!;
  private readonly overlayTitleEl = document.getElementById('overlay-title')!;
  private readonly overlaySubEl = document.getElementById('overlay-sub')!;
  private readonly overlayScoreEl = document.getElementById('overlay-score')!;
  private readonly retryBtn = document.getElementById('btn-retry') as HTMLButtonElement;

  constructor(
    onRetry: () => void,
    onTogglePause: () => void,
    onToggleMute: () => boolean
  ) {
    this.retryBtn.addEventListener('click', onRetry);
    this.pauseBtn.addEventListener('click', onTogglePause);
    this.muteBtn.addEventListener('click', () => {
      const muted = onToggleMute();
      this.setMuted(muted);
    });
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇 Âm: Tắt [M]' : '🔊 Âm: Bật [M]';
  }

  setPaused(paused: boolean, status: SimState['status']): void {
    this.pauseBtn.textContent = paused ? '▶ Tiếp tục [P]' : '⏸ Tạm dừng [P]';
    if (status === 'playing') {
      if (paused) {
        this.overlayEl.classList.remove('hidden');
        this.overlayTitleEl.textContent = 'Đang Tạm Dừng';
        this.overlaySubEl.textContent = 'Nhấn P hoặc nút Tiếp tục để quay lại Đảo Bến.';
        this.overlayScoreEl.textContent = '';
        this.retryBtn.textContent = 'Chơi lại từ đầu';
      } else {
        this.overlayEl.classList.add('hidden');
      }
    }
  }

  update(state: SimState, paused: boolean): void {
    const litCount = state.lanterns.filter((l) => l.lit).length;
    this.flamesEl.textContent = `🔥 ${state.player.flames} / ${TUNING.flames}`;
    this.carriedEl.textContent = `✦ ${state.player.carried} / ${TUNING.carry_capacity}`;
    this.lanternsEl.textContent = `🏮 ${litCount} / ${TUNING.lantern_count_night1}`;

    const secs = Math.max(0, Math.ceil(state.timeLeftS));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.timerEl.textContent = `⏳ ${mm}:${ss}`;
    this.scoreEl.textContent = `Điểm: ${state.score}`;

    if (state.player.pulseCooldownRemaining > 0) {
      this.pulseStatusEl.textContent = `Tỏa Sáng: hồi ${state.player.pulseCooldownRemaining.toFixed(1)}s`;
      this.pulseStatusEl.className = 'pill pulse-wait';
    } else if (state.player.carried < TUNING.pulse_cost) {
      this.pulseStatusEl.textContent = `Tỏa Sáng: cần ${TUNING.pulse_cost} đom đóm`;
      this.pulseStatusEl.className = 'pill pulse-wait';
    } else {
      this.pulseStatusEl.textContent = '✨ [Shift / Chuột phải] Tỏa Sáng (Sẵn sàng)';
      this.pulseStatusEl.className = 'pill pulse-ready';
    }

    const nearUnlit = state.lanterns.find(
      (l) => !l.lit && distXZ(state.player.pos, l.pos) <= TUNING.interact_radius
    );
    if (nearUnlit && state.status === 'playing') {
      this.promptEl.classList.remove('hidden');
      if (state.player.carried > 0) {
        this.promptEl.textContent = `[E] Nạp ánh sáng vào ${nearUnlit.id} (${nearUnlit.deposited}/${TUNING.lantern_cost})`;
      } else {
        this.promptEl.textContent = `${nearUnlit.id} (${nearUnlit.deposited}/${TUNING.lantern_cost}) — Cần thu thập thêm đom đóm`;
      }
    } else {
      this.promptEl.classList.add('hidden');
    }

    if (state.status !== 'playing') {
      this.overlayEl.classList.remove('hidden');
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
      this.overlayScoreEl.textContent = `Tổng điểm: ${state.score} · Đèn sáng: ${litCount}/5`;
      this.retryBtn.textContent = 'Chơi lại [Enter]';
    } else if (!paused) {
      this.overlayEl.classList.add('hidden');
    }
  }
}
