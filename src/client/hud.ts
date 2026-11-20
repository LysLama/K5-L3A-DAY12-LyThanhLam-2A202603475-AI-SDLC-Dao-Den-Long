import * as THREE from 'three';
import { DT, FUEL_MAX_TICKS, LOW_FUEL_TICKS, TUNING } from '../sim/constants';
import { getMapConfig } from '../sim/maps';
import type { NightId, SimEvent, SimState } from '../sim/types';
import { distXZ, fuelTicksToValue } from '../sim/world';
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
  colorblind: boolean;
}

export type UiScreen = 'menu' | 'intro' | 'playing' | 'paused' | 'result';

interface NightLore {
  kicker: string;
  title: string;
  quote: string;
  lanternNeedLabel: string;
  durationLabel: string;
  featureLabel: string;
}

const NIGHT_LORE: Record<NightId, NightLore> = {
  1: {
    kicker: 'Đêm Thứ Nhất',
    title: 'Đảo Bến — Giữ Lửa Tới Bình Minh',
    quote:
      '“Sương đen vừa nuốt chửng bến thuyền, mà dầu đèn lại cạn từng giây. Mây à, hãy thắp và châm dầu để giữ ít nhất 3/5 Đèn Lồng sáng đến bình minh!” — Ông Đăng',
    lanternNeedLabel: '≥ 3/5 Đèn',
    durationLabel: '04:00',
    featureLabel: 'Dầu 100 · Sức chứa 10→20'
  },
  2: {
    kicker: 'Đêm Thứ Hai',
    title: 'Đảo Cau — Cây Cầu Trong Sương',
    quote:
      '“Đèn yếu dưới 30% sẽ mất vùng an toàn và thu hút Bóng Mực tới hút dầu. Hãy giữ vững ít nhất 4/6 Đèn Lồng trên cả hai đảo trước Gió Lạc!” — Ông Đăng',
    lanternNeedLabel: '≥ 4/6 Đèn',
    durationLabel: '04:30',
    featureLabel: '2 Đảo · Cầu Tre · Bùa Gió'
  },
  3: {
    kicker: 'Đêm Thứ Ba',
    title: 'Đảo Chuông — Bình Minh Sau Cơn Gió',
    quote:
      '“Đêm cuối dài 5 phút với gió mạnh từng cơn và Bóng Mực hung hãn. Giữ tối thiểu 5/7 Đèn Lồng bừng sáng đến bình minh để cứu quần đảo!” — Ông Đăng',
    lanternNeedLabel: '≥ 5/7 Đèn',
    durationLabel: '05:00',
    featureLabel: '3 Tầng · Tháp Chuông · Gió'
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
  private readonly lowFuelBadgeEl = document.getElementById('hud-lowfuel-badge')!;
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
  private readonly colorblindInput = document.getElementById('input-colorblind') as HTMLInputElement;
  private readonly colorblindVal = document.getElementById('val-colorblind')!;

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
  private colorblindMode = false;
  private readonly projVec = new THREE.Vector3();
  private readonly lastHtmlCache = new Map<HTMLElement, string>();

  private setHtmlIfChanged(el: HTMLElement, html: string): void {
    if (this.lastHtmlCache.get(el) === html) return;
    this.lastHtmlCache.set(el, html);
    el.innerHTML = html;
  }

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

    // Settings inputs
    this.applySettingsToInputs(initialSettings);
    const emitSettings = () => {
      const next: GameSettings = {
        volume: Number(this.volumeInput.value),
        sensitivity: Number(this.sensitivityInput.value),
        colorblind: this.colorblindInput.checked
      };
      this.applySettingsToInputs(next);
      cb.onChangeSettings(next);
    };
    this.volumeInput.addEventListener('input', emitSettings);
    this.sensitivityInput.addEventListener('input', emitSettings);
    this.colorblindInput.addEventListener('change', emitSettings);
  }

  private applySettingsToInputs(s: GameSettings): void {
    this.volumeInput.value = String(s.volume);
    this.volumeVal.textContent = `${s.volume}%`;
    this.sensitivityInput.value = String(s.sensitivity);
    this.sensitivityVal.textContent = `${(s.sensitivity / 100).toFixed(1)}×`;
    this.colorblindInput.checked = s.colorblind;
    this.colorblindVal.textContent = s.colorblind ? 'Bật' : 'Tắt';
    this.colorblindMode = s.colorblind;
    document.body.classList.toggle('is-colorblind', s.colorblind);
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

  showScreen(screen: UiScreen, night: NightId, fpsAvg = 60): void {
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
        <div class="stat-box"><div class="stat-label">Ngưỡng thắng</div><div class="stat-val">${lore.lanternNeedLabel}</div></div>
        <div class="stat-box"><div class="stat-label">Thời gian</div><div class="stat-val">${lore.durationLabel}</div></div>
        <div class="stat-box"><div class="stat-label">Luật Phase 3</div><div class="stat-val" style="font-size:12.5px">${lore.featureLabel}</div></div>
      `;
    } else if (screen === 'paused') {
      this.settingsFromMenu = false;
      const mapCfg = getMapConfig(night);
      this.pauseTitleEl.textContent = 'Đang Tạm Dừng';
      this.pauseSubEl.textContent = `Đêm ${night} · ${mapCfg.name} (${Math.round(fpsAvg)} FPS) vẫn lặng lẽ đợi ánh lửa từ bạn.`;
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
        const relabel = ev.data.relight ? 'đã được thắp lại' : 'đã bừng sáng';
        this.showToast(
          `Đèn ${ev.data.lantern_id} ${relabel}! (${litCount}/${total} · Sức chứa ${state.player.capacity})`
        );
      } else if (ev.name === 'refuel') {
        this.showToast(`Đã châm dầu Đèn ${ev.data.lantern_id} (${ev.data.fuel}%)`);
      } else if (ev.name === 'lantern_out') {
        const warn = this.colorblindMode ? '⚠ ' : '';
        this.showToast(`${warn}Đèn ${ev.data.lantern_id} đã cạn dầu và tắt!`);
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

  renderResult(state: SimState, campaignMode: boolean, campaignTotalScore: number): void {
    this.showScreen('result', state.night);
    const mapCfg = getMapConfig(state.night);
    const totalLanterns = state.lanterns.length;
    const litCount = state.lanterns.filter((l) => l.lit).length;
    const needed = Math.ceil(TUNING.win_ratio * totalLanterns);

    const isDawnVictory = state.status === 'won' && state.night === 3;
    this.screenResult.classList.toggle('is-dawn', isDawnVictory);
    this.resultEmblemEl.innerHTML =
      state.status === 'won' ? svgLantern(true) : svgFlame(state.player.flames > 0);

    const warnPrefix = this.colorblindMode ? '⚠ ' : '';
    if (isDawnVictory) {
      this.resultTitleEl.textContent = 'Bình Minh Đã Ló Dạng!';
      this.resultSubEl.textContent = campaignMode
        ? `Mây đã giữ sáng ${litCount}/${totalLanterns} Đèn Lồng qua Ba Đêm và mang bình minh trở lại!`
        : `Đảo Chuông giữ vững ${litCount}/${totalLanterns} Đèn Lồng đến bình minh!`;
    } else if (state.status === 'won') {
      this.resultTitleEl.textContent = `Sống Sót Qua Đêm ${state.night} — ${mapCfg.name}!`;
      this.resultSubEl.textContent = `Mây đã giữ sáng ${litCount}/${totalLanterns} Đèn Lồng (đạt ngưỡng ≥ ${needed}) tới bình minh.`;
    } else if (state.player.flames <= 0) {
      this.resultTitleEl.textContent = `${warnPrefix}Ngọn Lửa Đã Tắt...`;
      this.resultSubEl.textContent = 'Bóng Mực hoặc vực sâu đã làm Mây mất hết Ngọn Lửa.';
    } else {
      this.resultTitleEl.textContent = `${warnPrefix}Bình Minh Chưa Đủ Sáng`;
      this.resultSubEl.textContent = `Hết giờ Đêm ${state.night}: chỉ còn ${litCount}/${totalLanterns} Đèn sáng (cần ≥ ${needed}).`;
    }

    const scoreTitle = campaignMode ? 'Điểm Chiến dịch' : 'Điểm Đêm';
    const scoreValue = campaignMode ? campaignTotalScore : state.score;

    this.resultStatsEl.innerHTML = `
      <div class="stat-box"><div class="stat-label">Đèn sáng</div><div class="stat-val">${litCount}/${totalLanterns}</div></div>
      <div class="stat-box"><div class="stat-label">Ngọn lửa</div><div class="stat-val">${state.player.flames}/${TUNING.flames}</div></div>
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
    const warnGlyph = this.colorblindMode ? '⚠ ' : '';

    // Flames
    let flamesHtml = '';
    for (let i = 0; i < TUNING.flames; i++) {
      flamesHtml += svgFlame(i < state.player.flames);
    }
    if (this.colorblindMode && state.player.flames <= 1) {
      flamesHtml = `<span>⚠</span>${flamesHtml}`;
    }
    this.setHtmlIfChanged(this.flamesEl, flamesHtml);

    // Bùa Gió badge
    if (state.player.charmTicks > 0) {
      const charmSecs = (state.player.charmTicks * DT).toFixed(1);
      this.charmBadgeEl.classList.remove('hidden');
      this.setHtmlIfChanged(this.charmBadgeEl, `${svgDash()}<span>Bùa Gió · ${charmSecs}s</span>`);
    } else {
      this.charmBadgeEl.classList.add('hidden');
    }

    // Low-fuel blinking warning pill (1 Hz)
    const weakLanterns = state.lanterns.filter((l) => l.lit && l.fuelTicks < LOW_FUEL_TICKS);
    if (weakLanterns.length > 0) {
      this.lowFuelBadgeEl.classList.remove('hidden');
      this.setHtmlIfChanged(
        this.lowFuelBadgeEl,
        `<span>⚠ Dầu yếu: ${weakLanterns.map((l) => l.id).join(', ')}</span>`
      );
    } else {
      this.lowFuelBadgeEl.classList.add('hidden');
    }

    // Wind Gust warning / active badge (Night 3)
    if (state.wind.enabled && (state.wind.warning || state.wind.active)) {
      this.windBadgeEl.classList.remove('hidden');
      this.windBadgeEl.classList.toggle('is-active', state.wind.active);
      this.setHtmlIfChanged(
        this.windBadgeEl,
        state.wind.active
          ? `${svgWind()}<span>${warnGlyph}GIÓ MẠNH đang thổi!</span>`
          : `${svgWind()}<span>⚠ Gió lớn sắp nổi!</span>`
      );
    } else {
      this.windBadgeEl.classList.add('hidden');
    }

    // Dynamic capacity Firefly bar (10..20 slots)
    const cap = state.player.capacity;
    let slotsHtml = `${svgMote()}<span class="mote-slots">`;
    for (let i = 0; i < cap; i++) {
      slotsHtml += `<span class="slot-pip ${i < state.player.carried ? 'is-filled' : ''}"></span>`;
    }
    slotsHtml += `</span><span>${state.player.carried}/${cap}</span>`;
    this.setHtmlIfChanged(this.carriedEl, slotsHtml);

    // Lanterns + survival threshold
    let litCount = 0;
    let lanternsHtml = '';
    for (const l of state.lanterns) {
      if (l.lit) litCount += 1;
      lanternsHtml += svgLantern(l.lit);
    }
    const needed = Math.ceil(TUNING.win_ratio * state.lanterns.length);
    lanternsHtml += `<span class="hud-lantern-count">${litCount}/${state.lanterns.length} (≥${needed})</span>`;
    this.setHtmlIfChanged(this.lanternsEl, lanternsHtml);

    // Timer & Score (blinking red #FF5A5F / #FFFFFF + ⚠ when <= 30s)
    const secs = Math.max(0, Math.ceil(state.timeLeftS));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    const isUrgent = secs <= 30 && state.status === 'playing';
    this.setHtmlIfChanged(
      this.timerEl,
      `${svgClock()}<span>${isUrgent ? warnGlyph : ''}${mm}:${ss}</span>`
    );
    this.timerEl.classList.toggle('is-urgent', isUrgent);
    this.setHtmlIfChanged(
      this.scoreEl,
      `<span>Điểm</span><span class="hud-score-val">${state.score}</span>`
    );

    // Dash Cooldown Ability Pill
    const dashCdS = state.player.dashCdTicks * DT;
    if (state.player.charmTicks > 0) {
      this.dashEl.className = 'pill ability-pill is-ready';
      this.setHtmlIfChanged(this.dashEl, `${svgDash()}<span>Lướt [Shift] · ∞</span>`);
    } else if (dashCdS > 0) {
      const ratio = Math.min(1, Math.max(0, (TUNING.dash_cooldown_s - dashCdS) / TUNING.dash_cooldown_s)).toFixed(3);
      this.dashEl.className = 'pill ability-pill is-wait';
      this.setHtmlIfChanged(
        this.dashEl,
        `${svgDash()}<span>Lướt ${dashCdS.toFixed(1)}s</span><span class="ability-progress"><span class="ability-progress-fill" style="transform:scaleX(${ratio})"></span></span>`
      );
    } else {
      this.dashEl.className = 'pill ability-pill is-ready';
      this.setHtmlIfChanged(this.dashEl, `${svgDash()}<span>Lướt [Shift]</span>`);
    }

    // Pulse Cooldown Ability Pill
    const pulseCdS = state.player.pulseCdTicks * DT;
    if (pulseCdS > 0) {
      const ratio = Math.min(1, Math.max(0, (TUNING.pulse_cooldown_s - pulseCdS) / TUNING.pulse_cooldown_s)).toFixed(3);
      this.pulseEl.className = 'pill ability-pill is-wait';
      this.setHtmlIfChanged(
        this.pulseEl,
        `${svgPulse()}<span>Tỏa Sáng ${pulseCdS.toFixed(1)}s</span><span class="ability-progress"><span class="ability-progress-fill" style="transform:scaleX(${ratio})"></span></span>`
      );
    } else if (state.player.carried < TUNING.pulse_cost) {
      this.pulseEl.className = 'pill ability-pill is-wait';
      this.setHtmlIfChanged(this.pulseEl, `${svgPulse()}<span>Cần ${TUNING.pulse_cost} đom đóm</span>`);
    } else {
      this.pulseEl.className = 'pill ability-pill is-ready';
      this.setHtmlIfChanged(this.pulseEl, `${svgPulse()}<span>Tỏa Sáng [Q / RMB]</span>`);
    }

    // Contextual interact prompt (nearest receivable unlit or non-full lit lantern)
    let bestReceivable: (typeof state.lanterns)[number] | null = null;
    let bestDist = Infinity;
    for (const l of state.lanterns) {
      if (l.lit && fuelTicksToValue(l.fuelTicks) >= TUNING.fuel_max) continue;
      const d = distXZ(state.player.pos, l.pos);
      if (d <= TUNING.interact_radius && Math.abs(state.player.pos[1] - l.pos[1]) <= 2.5 && d < bestDist) {
        bestDist = d;
        bestReceivable = l;
      }
    }
    if (bestReceivable && state.status === 'playing') {
      this.promptEl.classList.remove('hidden');
      if (!bestReceivable.lit) {
        const req = bestReceivable.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
        const actionLabel = bestReceivable.everLit ? 'Thắp lại' : 'Nạp ánh sáng';
        this.promptEl.textContent =
          state.player.carried > 0
            ? `E — ${actionLabel} (${bestReceivable.deposited}/${req}) · ${bestReceivable.id}`
            : `${bestReceivable.id} (${bestReceivable.deposited}/${req}) — Thu thập thêm đom đóm`;
      } else {
        const pct = Math.round((bestReceivable.fuelTicks / FUEL_MAX_TICKS) * 100);
        this.promptEl.textContent =
          state.player.carried > 0
            ? `E — Châm dầu ${bestReceivable.id} (${pct}%)`
            : `${bestReceivable.id} (Dầu ${pct}%) — Thu thập thêm đom đóm để châm dầu`;
      }
    } else {
      this.promptEl.classList.add('hidden');
    }

    this.updateOffscreenLanternArrow(state, camera);
  }

  private updateOffscreenLanternArrow(state: SimState, camera: THREE.PerspectiveCamera): void {
    if (state.status !== 'playing') {
      this.arrowEl.classList.add('hidden');
      return;
    }

    let nearest: (typeof state.lanterns)[number] | null = null;
    let bestDist = Infinity;
    // Prefer unlit lanterns; if all lit, point toward nearest low-fuel (< 30) lantern
    const candidates = state.lanterns.some((l) => !l.lit)
      ? state.lanterns.filter((l) => !l.lit)
      : state.lanterns.filter((l) => l.lit && l.fuelTicks < LOW_FUEL_TICKS);

    for (const l of candidates) {
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
