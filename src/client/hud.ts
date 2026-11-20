import * as THREE from 'three';
import { DT, TUNING } from '../sim/constants';
import { getMapConfig } from '../sim/maps';
import type { NightId, SimEvent, SimState } from '../sim/types';
import { distXZ } from '../sim/world';
import {
  svgClock,
  svgDash,
  svgDirectionArrow,
  svgFlame,
  svgHelp,
  svgLantern,
  svgMote,
  svgPause,
  svgPulse,
  svgSound,
  svgWind
} from './icons';

export interface GameSettings {
  volume: number; // 0..100
  sensitivity: number; // 40..200 (100 = 1.0x)
}

export type UiScreen = 'menu' | 'intro' | 'playing' | 'paused' | 'result';

interface NightLore {
  kicker: string;
  title: string;
  quote: string;
  lanternCount: number;
  durationLabel: string;
  featureLabel: string;
}

const NIGHT_LORE: Record<NightId, NightLore> = {
  1: {
    kicker: 'Đêm Thứ Nhất',
    title: 'Đảo Bến — Ngọn Lửa Khởi Hành',
    quote:
      '“Sương đen vừa nuốt chửng bến thuyền đầu làng. Mây à, hãy gom đom đóm và thắp lại 5 ngọn Đèn Lồng trước khi bóng tối siết chặt.” — Ông Đăng',
    lanternCount: 5,
    durationLabel: '05:00',
    featureLabel: '5 Đèn Lồng · Bóng Mực'
  },
  2: {
    kicker: 'Đêm Thứ Hai',
    title: 'Đảo Cau — Cây Cầu Trong Sương',
    quote:
      '“Cây cầu tre qua Đảo Cau vẫn đứng vững, nhưng Gió Lạc tinh quái đã thức giấc. Coi chừng chúng cướp mất ánh sáng trên đường sang đảo!” — Ông Đăng',
    lanternCount: 6,
    durationLabel: '05:30',
    featureLabel: '2 Đảo · Cầu Tre · Gió Lạc'
  },
  3: {
    kicker: 'Đêm Thứ Ba',
    title: 'Đảo Chuông — Bình Minh Sau Cơn Gió',
    quote:
      '“Tháp Chuông cổ trên đỉnh Đảo Chuông là hy vọng cuối cùng. Gió lớn sẽ quật từng cơn mỗi 30 giây — vững bước để thắp sáng cả 7 ngọn đèn!” — Ông Đăng',
    lanternCount: 7,
    durationLabel: '06:00',
    featureLabel: '3 Tầng · Tháp Chuông · Gió Mạnh'
  }
};

export interface HudCallbacks {
  onStartCampaign: () => void;
  onStartNight: (night: NightId) => void;
  onBeginPlayFromIntro: () => void;
  onBackToMenu: () => void;
  onNextNight: () => void;
  onRetryNight: () => void;
  onTogglePause: () => void;
  onToggleMute: () => boolean;
  onChangeSettings: (settings: GameSettings) => void;
}

export class HudController {
  private readonly hudLayer = document.getElementById('hud-layer')!;
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly nightBadgeEl = document.getElementById('hud-night-badge')!;
  private readonly charmBadgeEl = document.getElementById('hud-charm-badge')!;
  private readonly windBadgeEl = document.getElementById('hud-wind-badge')!;
  private readonly carriedEl = document.getElementById('hud-carried')!;
  private readonly lanternsEl = document.getElementById('hud-lanterns')!;
  private readonly timerEl = document.getElementById('hud-timer')!;
  private readonly scoreEl = document.getElementById('hud-score')!;
  private readonly dashEl = document.getElementById('hud-dash')!;
  private readonly pulseEl = document.getElementById('hud-pulse')!;
  private readonly promptEl = document.getElementById('hud-prompt')!;
  private readonly toastEl = document.getElementById('hud-toast')!;
  private readonly vignetteEl = document.getElementById('hit-vignette')!;
  private readonly controlsBar = document.getElementById('controls-bar')!;
  private readonly arrowEl = document.getElementById('hud-lantern-arrow')!;
  private readonly arrowRotatorEl = document.getElementById('hud-arrow-rotator')!;
  private readonly arrowLabelEl = document.getElementById('hud-arrow-label')!;

  private readonly pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
  private readonly muteBtn = document.getElementById('btn-mute') as HTMLButtonElement;
  private readonly helpBtn = document.getElementById('btn-help') as HTMLButtonElement;

  private readonly screenMenu = document.getElementById('screen-menu')!;
  private readonly screenIntro = document.getElementById('screen-intro')!;
  private readonly screenPause = document.getElementById('screen-pause')!;
  private readonly screenResult = document.getElementById('screen-result')!;

  private readonly pauseTitleEl = document.getElementById('pause-title')!;
  private readonly pauseSubEl = document.getElementById('pause-sub')!;
  private readonly pauseSettingsPanel = document.getElementById('pause-settings-panel')!;
  private readonly pauseResumeBtn = document.getElementById('btn-pause-resume') as HTMLButtonElement;
  private readonly pauseRestartBtn = document.getElementById('btn-pause-restart') as HTMLButtonElement;
  private readonly pauseSettingsBtn = document.getElementById('btn-pause-settings') as HTMLButtonElement;
  private readonly pauseMenuBtn = document.getElementById('btn-pause-menu') as HTMLButtonElement;

  private readonly volumeInput = document.getElementById('input-volume') as HTMLInputElement;
  private readonly volumeVal = document.getElementById('val-volume')!;
  private readonly sensitivityInput = document.getElementById('input-sensitivity') as HTMLInputElement;
  private readonly sensitivityVal = document.getElementById('val-sensitivity')!;

  private readonly resultEmblemEl = document.getElementById('result-emblem')!;
  private readonly resultTitleEl = document.getElementById('result-title')!;
  private readonly resultSubEl = document.getElementById('result-sub')!;
  private readonly resultStatsEl = document.getElementById('result-stats')!;
  private readonly resultNextBtn = document.getElementById('btn-result-next') as HTMLButtonElement;
  private readonly resultRetryBtn = document.getElementById('btn-result-retry') as HTMLButtonElement;
  private readonly resultMenuBtn = document.getElementById('btn-result-menu') as HTMLButtonElement;

  private toastTimer = 0;
  private hitFlashTimer = 0;
  private controlsVisible = true;
  private settingsOpen = false;
  private settingsFromMenu = false;
  private readonly projVec = new THREE.Vector3();

  constructor(initialSettings: GameSettings, cb: HudCallbacks) {
    document.getElementById('menu-emblem')!.innerHTML = svgLantern(true);
    document.getElementById('intro-emblem')!.innerHTML = svgLantern(true);
    document.getElementById('pause-emblem')!.innerHTML = svgLantern(true);
    this.arrowRotatorEl.innerHTML = svgDirectionArrow();

    this.helpBtn.innerHTML = `${svgHelp()}<span>Phím [H]</span>`;
    this.setMuted(false);

    // Menu buttons
    document.getElementById('btn-start-campaign')!.addEventListener('click', () => cb.onStartCampaign());
    document.getElementById('btn-pick-night-1')!.addEventListener('click', () => cb.onStartNight(1));
    document.getElementById('btn-pick-night-2')!.addEventListener('click', () => cb.onStartNight(2));
    document.getElementById('btn-pick-night-3')!.addEventListener('click', () => cb.onStartNight(3));
    document.getElementById('btn-menu-settings')!.addEventListener('click', () => this.openMenuSettings());

    // Intro buttons
    document.getElementById('btn-intro-play')!.addEventListener('click', () => cb.onBeginPlayFromIntro());
    document.getElementById('btn-intro-menu')!.addEventListener('click', () => cb.onBackToMenu());

    // Pause buttons
    this.pauseResumeBtn.addEventListener('click', () => {
      if (this.settingsFromMenu) {
        this.closeMenuSettings();
      } else {
        cb.onTogglePause();
      }
    });
    this.pauseRestartBtn.addEventListener('click', () => cb.onRetryNight());
    this.pauseSettingsBtn.addEventListener('click', () => {
      this.settingsOpen = !this.settingsOpen;
      this.pauseSettingsPanel.classList.toggle('hidden', !this.settingsOpen);
    });
    this.pauseMenuBtn.addEventListener('click', () => cb.onBackToMenu());

    // Result buttons
    this.resultNextBtn.addEventListener('click', () => cb.onNextNight());
    this.resultRetryBtn.addEventListener('click', () => cb.onRetryNight());
    this.resultMenuBtn.addEventListener('click', () => cb.onBackToMenu());

    // Top-right HUD quick buttons
    this.pauseBtn.addEventListener('click', () => {
      this.pauseBtn.blur();
      cb.onTogglePause();
    });
    this.muteBtn.addEventListener('click', () => {
      this.muteBtn.blur();
      this.setMuted(cb.onToggleMute());
    });
    this.helpBtn.addEventListener('click', () => {
      this.helpBtn.blur();
      this.toggleHelp();
    });

    // Settings sliders
    this.applySettingsToInputs(initialSettings);
    const emitSettings = () => {
      const next: GameSettings = {
        volume: Number(this.volumeInput.value),
        sensitivity: Number(this.sensitivityInput.value)
      };
      this.applySettingsToInputs(next);
      cb.onChangeSettings(next);
    };
    this.volumeInput.addEventListener('input', emitSettings);
    this.sensitivityInput.addEventListener('input', emitSettings);
  }

  private applySettingsToInputs(s: GameSettings): void {
    this.volumeInput.value = String(s.volume);
    this.volumeVal.textContent = `${s.volume}%`;
    this.sensitivityInput.value = String(s.sensitivity);
    this.sensitivityVal.textContent = `${(s.sensitivity / 100).toFixed(1)}×`;
  }

  private openMenuSettings(): void {
    this.settingsFromMenu = true;
    this.settingsOpen = true;
    this.screenMenu.classList.add('hidden');
    this.screenPause.classList.remove('hidden');
    this.pauseTitleEl.textContent = 'Cài đặt';
    this.pauseSubEl.textContent = 'Cài đặt được lưu tự động cho những lần chơi sau.';
    this.pauseSettingsPanel.classList.remove('hidden');
    this.pauseResumeBtn.textContent = 'Quay lại Menu';
    this.pauseRestartBtn.classList.add('hidden');
    this.pauseSettingsBtn.classList.add('hidden');
    this.pauseMenuBtn.classList.add('hidden');
  }

  private closeMenuSettings(): void {
    this.settingsFromMenu = false;
    this.settingsOpen = false;
    this.screenPause.classList.add('hidden');
    this.screenMenu.classList.remove('hidden');
  }

  toggleHelp(): void {
    this.controlsVisible = !this.controlsVisible;
    this.controlsBar.classList.toggle('hidden', !this.controlsVisible);
  }

  setMuted(muted: boolean): void {
    this.muteBtn.innerHTML = `${svgSound(muted)}<span>${muted ? 'Tắt [M]' : 'Âm [M]'}</span>`;
  }

  showScreen(screen: UiScreen, night: NightId): void {
    this.screenMenu.classList.toggle('hidden', screen !== 'menu');
    this.screenIntro.classList.toggle('hidden', screen !== 'intro');
    this.screenPause.classList.toggle('hidden', screen !== 'paused');
    this.screenResult.classList.toggle('hidden', screen !== 'result');
    this.hudLayer.classList.toggle('hidden', screen === 'menu' || screen === 'intro');
    if (screen !== 'playing') {
      this.arrowEl.classList.add('hidden');
    }

    if (screen === 'intro') {
      const lore = NIGHT_LORE[night];
      document.getElementById('intro-kicker')!.textContent = lore.kicker;
      document.getElementById('intro-title')!.textContent = lore.title;
      document.getElementById('intro-quote')!.textContent = lore.quote;
      document.getElementById('intro-meta')!.innerHTML = `
        <div class="stat-box"><div class="stat-label">Mục tiêu</div><div class="stat-val">${lore.lanternCount} Đèn</div></div>
        <div class="stat-box"><div class="stat-label">Thời gian</div><div class="stat-val">${lore.durationLabel}</div></div>
        <div class="stat-box"><div class="stat-label">Địa hình</div><div class="stat-val" style="font-size:12.5px">${lore.featureLabel}</div></div>
      `;
    } else if (screen === 'paused') {
      this.settingsFromMenu = false;
      const mapCfg = getMapConfig(night);
      this.pauseTitleEl.textContent = 'Đang Tạm Dừng';
      this.pauseSubEl.textContent = `Đêm ${night} · ${mapCfg.name} vẫn lặng lẽ đợi ánh lửa từ bạn.`;
      this.pauseSettingsPanel.classList.toggle('hidden', !this.settingsOpen);
      this.pauseResumeBtn.textContent = 'Tiếp tục [Esc / P]';
      this.pauseRestartBtn.classList.remove('hidden');
      this.pauseSettingsBtn.classList.remove('hidden');
      this.pauseMenuBtn.classList.remove('hidden');
    }
    this.pauseBtn.innerHTML = `${svgPause(screen === 'paused')}<span>${screen === 'paused' ? 'Tiếp [P]' : 'Dừng [P]'}</span>`;
  }

  showToast(text: string, duration = 2.6): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = duration;
  }

  handleEvents(events: ReadonlyArray<SimEvent>, state: SimState): void {
    const total = state.lanterns.length;
    for (const ev of events) {
      if (ev.name === 'lantern_lit') {
        const litCount = state.lanterns.filter((l) => l.lit).length;
        this.showToast(`Đèn Lồng ${ev.data.lantern_id} đã bừng sáng! (${litCount}/${total})`);
      } else if (ev.name === 'charm_picked') {
        this.showToast('Nhặt Bùa Gió! Tốc độ 7.2 m/s & Lướt không hồi chiêu (10s)');
      } else if (ev.name === 'drifter_steal') {
        this.showToast(`Gió Lạc đã cướp ${ev.data.amount} đom đóm! Dùng Tỏa Sáng để đòi lại!`);
      } else if (ev.name === 'drifter_drop') {
        this.showToast(`Gió Lạc đánh rơi ${ev.data.amount} đom đóm!`);
      } else if (ev.name === 'player_hit') {
        this.vignetteEl.classList.add('active');
        this.hitFlashTimer = 0.08;
      }
    }
  }

  renderResult(
    state: SimState,
    campaignMode: boolean,
    campaignTotalScore: number
  ): void {
    this.showScreen('result', state.night);
    const mapCfg = getMapConfig(state.night);
    const totalLanterns = state.lanterns.length;
    const litCount = state.lanterns.filter((l) => l.lit).length;
    const secs = Math.max(0, Math.ceil(state.timeLeftS));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');

    const isDawnVictory = state.status === 'won' && state.night === 3;
    this.screenResult.classList.toggle('is-dawn', isDawnVictory);
    this.resultEmblemEl.innerHTML =
      state.status === 'won' ? svgLantern(true) : svgFlame(state.player.flames > 0);

    if (isDawnVictory) {
      this.resultTitleEl.textContent = 'Bình Minh Đã Ló Dạng!';
      this.resultSubEl.textContent = campaignMode
        ? 'Mây đã chinh phục cả Ba Hòn Đảo, xua tan sương đen và mang bình minh trở lại!'
        : 'Đảo Chuông và Tháp Chuông cổ đã bừng sáng rực rỡ đón bình minh!';
    } else if (state.status === 'won') {
      this.resultTitleEl.textContent = `${mapCfg.name} Đã Bừng Sáng!`;
      this.resultSubEl.textContent = `Mây đã thắp sáng đủ ${totalLanterns} Đèn Lồng Lớn trong Đêm ${state.night}.`;
    } else if (state.player.flames <= 0) {
      this.resultTitleEl.textContent = 'Ngọn Lửa Đã Tắt...';
      this.resultSubEl.textContent = 'Bóng Mực hoặc vực sâu đã làm Mây mất hết Ngọn Lửa.';
    } else {
      this.resultTitleEl.textContent = 'Bình Minh Đã Đến';
      this.resultSubEl.textContent = `Hết thời gian của Đêm ${state.night} trước khi thắp đủ ${totalLanterns} Đèn Lồng.`;
    }

    const scoreTitle = campaignMode ? 'Điểm Chiến dịch' : 'Điểm Đêm';
    const scoreValue = campaignMode ? campaignTotalScore : state.score;

    this.resultStatsEl.innerHTML = `
      <div class="stat-box"><div class="stat-label">Đèn Lồng</div><div class="stat-val">${litCount}/${totalLanterns}</div></div>
      <div class="stat-box"><div class="stat-label">Thời gian dư</div><div class="stat-val">${mm}:${ss}</div></div>
      <div class="stat-box"><div class="stat-label">${scoreTitle}</div><div class="stat-val">${scoreValue}</div></div>
    `;

    const canAdvance = state.status === 'won' && campaignMode && state.night < 3;
    this.resultNextBtn.classList.toggle('hidden', !canAdvance);
    if (canAdvance) {
      const nextCfg = getMapConfig((state.night + 1) as NightId);
      this.resultNextBtn.textContent = `Sang Đêm ${state.night + 1}: ${nextCfg.name} → [Enter]`;
      this.resultRetryBtn.className = 'btn-secondary';
    } else {
      this.resultRetryBtn.className = 'btn-primary';
      this.resultRetryBtn.textContent =
        isDawnVictory && campaignMode ? 'Chơi lại từ Đêm 1 [Enter]' : 'Chơi lại Đêm [Enter]';
    }
  }

  update(state: SimState, frameDt: number, camera: THREE.PerspectiveCamera, isPlayingScreen: boolean): void {
    if (this.toastTimer > 0) {
      this.toastTimer = Math.max(0, this.toastTimer - frameDt);
      if (this.toastTimer === 0) this.toastEl.classList.add('hidden');
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - frameDt);
      if (this.hitFlashTimer === 0) this.vignetteEl.classList.remove('active');
    }

    if (!isPlayingScreen) return;

    const mapCfg = getMapConfig(state.night);
    this.nightBadgeEl.textContent = `Đêm ${state.night} · ${mapCfg.name}`;

    // Flames
    let flamesHtml = '';
    for (let i = 0; i < TUNING.flames; i++) {
      flamesHtml += svgFlame(i < state.player.flames);
    }
    this.flamesEl.innerHTML = flamesHtml;

    // Bùa Gió badge
    if (state.player.charmTicks > 0) {
      const charmSecs = (state.player.charmTicks * DT).toFixed(1);
      this.charmBadgeEl.classList.remove('hidden');
      this.charmBadgeEl.innerHTML = `${svgDash()}<span>Bùa Gió · ${charmSecs}s</span>`;
    } else {
      this.charmBadgeEl.classList.add('hidden');
    }

    // Wind Gust warning / active badge (Night 3)
    if (state.wind.enabled && (state.wind.warning || state.wind.active)) {
      this.windBadgeEl.classList.remove('hidden');
      this.windBadgeEl.classList.toggle('is-active', state.wind.active);
      this.windBadgeEl.innerHTML = state.wind.active
        ? `${svgWind()}<span>GIÓ MẠNH đang thổi!</span>`
        : `${svgWind()}<span>Cảnh báo: Gió lớn sắp nổi!</span>`;
    } else {
      this.windBadgeEl.classList.add('hidden');
    }

    // 10-slot Firefly bar
    let slotsHtml = `${svgMote()}<span class="mote-slots">`;
    for (let i = 0; i < TUNING.carry_capacity; i++) {
      slotsHtml += `<span class="slot-pip ${i < state.player.carried ? 'is-filled' : ''}"></span>`;
    }
    slotsHtml += `</span><span>${state.player.carried}/${TUNING.carry_capacity}</span>`;
    this.carriedEl.innerHTML = slotsHtml;

    // Lanterns
    let litCount = 0;
    let lanternsHtml = '';
    for (const l of state.lanterns) {
      if (l.lit) litCount += 1;
      lanternsHtml += svgLantern(l.lit);
    }
    lanternsHtml += `<span class="hud-lantern-count">${litCount}/${state.lanterns.length}</span>`;
    this.lanternsEl.innerHTML = lanternsHtml;

    // Timer & Score (blinking red #FF5A5F when <= 30s)
    const secs = Math.max(0, Math.ceil(state.timeLeftS));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.timerEl.innerHTML = `${svgClock()}<span>${mm}:${ss}</span>`;
    this.timerEl.classList.toggle('is-urgent', secs <= 30 && state.status === 'playing');
    this.scoreEl.innerHTML = `<span>Điểm</span><span class="hud-score-val">${state.score}</span>`;

    // Dash Cooldown Ability Pill
    const dashCdS = state.player.dashCdTicks * DT;
    if (state.player.charmTicks > 0) {
      this.dashEl.className = 'pill ability-pill is-ready';
      this.dashEl.innerHTML = `${svgDash()}<span>Lướt [Shift] · ∞</span>`;
    } else if (dashCdS > 0) {
      const ratio = Math.min(1, Math.max(0, (TUNING.dash_cooldown_s - dashCdS) / TUNING.dash_cooldown_s)).toFixed(3);
      this.dashEl.className = 'pill ability-pill is-wait';
      this.dashEl.innerHTML = `${svgDash()}<span>Lướt ${dashCdS.toFixed(1)}s</span><span class="ability-progress"><span class="ability-progress-fill" style="transform:scaleX(${ratio})"></span></span>`;
    } else {
      this.dashEl.className = 'pill ability-pill is-ready';
      this.dashEl.innerHTML = `${svgDash()}<span>Lướt [Shift]</span>`;
    }

    // Pulse Cooldown Ability Pill
    const pulseCdS = state.player.pulseCdTicks * DT;
    if (pulseCdS > 0) {
      const ratio = Math.min(1, Math.max(0, (TUNING.pulse_cooldown_s - pulseCdS) / TUNING.pulse_cooldown_s)).toFixed(3);
      this.pulseEl.className = 'pill ability-pill is-wait';
      this.pulseEl.innerHTML = `${svgPulse()}<span>Tỏa Sáng ${pulseCdS.toFixed(1)}s</span><span class="ability-progress"><span class="ability-progress-fill" style="transform:scaleX(${ratio})"></span></span>`;
    } else if (state.player.carried < TUNING.pulse_cost) {
      this.pulseEl.className = 'pill ability-pill is-wait';
      this.pulseEl.innerHTML = `${svgPulse()}<span>Cần ${TUNING.pulse_cost} đom đóm</span>`;
    } else {
      this.pulseEl.className = 'pill ability-pill is-ready';
      this.pulseEl.innerHTML = `${svgPulse()}<span>Tỏa Sáng [Q / RMB]</span>`;
    }

    // Contextual interact prompt: "E — Nạp ánh sáng (x/10)"
    const nearUnlit = state.lanterns.find(
      (l) => !l.lit && distXZ(state.player.pos, l.pos) <= TUNING.interact_radius
    );
    if (nearUnlit && state.status === 'playing') {
      this.promptEl.classList.remove('hidden');
      this.promptEl.textContent =
        state.player.carried > 0
          ? `E — Nạp ánh sáng (${nearUnlit.deposited}/${TUNING.lantern_cost}) · ${nearUnlit.id}`
          : `${nearUnlit.id} (${nearUnlit.deposited}/${TUNING.lantern_cost}) — Hãy thu thập thêm đom đóm`;
    } else {
      this.promptEl.classList.add('hidden');
    }

    // Off-screen nearest unlit lantern directional arrow
    this.updateOffscreenLanternArrow(state, camera);
  }

  private updateOffscreenLanternArrow(state: SimState, camera: THREE.PerspectiveCamera): void {
    if (state.status !== 'playing') {
      this.arrowEl.classList.add('hidden');
      return;
    }

    let nearest: (typeof state.lanterns)[number] | null = null;
    let bestDist = Infinity;
    for (const l of state.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(
        l.pos[0] - state.player.pos[0],
        l.pos[1] - state.player.pos[1],
        l.pos[2] - state.player.pos[2]
      );
      if (d < bestDist) {
        bestDist = d;
        nearest = l;
      }
    }

    if (!nearest) {
      this.arrowEl.classList.add('hidden');
      return;
    }

    this.projVec.set(nearest.pos[0], nearest.pos[1] + 2.8, nearest.pos[2]).project(camera);
    const behind = this.projVec.z > 1;
    const nx = behind ? -this.projVec.x : this.projVec.x;
    const ny = behind ? -this.projVec.y : this.projVec.y;

    const inView = !behind && Math.abs(nx) <= 0.88 && Math.abs(ny) <= 0.84;
    if (inView) {
      this.arrowEl.classList.add('hidden');
      return;
    }

    const edgeScale = Math.max(Math.abs(nx) / 0.86, Math.abs(ny) / 0.78, 1e-4);
    const ex = nx / edgeScale;
    const ey = ny / edgeScale;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const px = Math.max(54, Math.min(vw - 54, (ex * 0.5 + 0.5) * vw));
    const py = Math.max(82, Math.min(vh - 108, (-ey * 0.5 + 0.5) * vh));
    const arrowDeg = (Math.atan2(nx, ny) * 180) / Math.PI;

    this.arrowEl.classList.remove('hidden');
    this.arrowEl.style.left = `${px.toFixed(1)}px`;
    this.arrowEl.style.top = `${py.toFixed(1)}px`;
    this.arrowRotatorEl.style.transform = `rotate(${arrowDeg.toFixed(1)}deg)`;
    this.arrowLabelEl.textContent = `${nearest.id} · ${Math.round(bestDist)}m`;
  }
}
