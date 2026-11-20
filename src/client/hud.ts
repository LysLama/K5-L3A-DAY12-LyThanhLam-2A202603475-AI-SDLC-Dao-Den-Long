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
import {
  DEFAULT_KEYBINDINGS,
  KEY_ACTION_LABELS,
  KEY_ACTION_ORDER,
  detectKeyConflict,
  formatKeyCodeLabel,
  type KeyAction,
  type KeyBindings
} from './inputMapper';
import { fetchLeaderboard, saveLeaderboardScore, validatePlayerName } from './leaderboard';

export interface GameSettings {
  volume: number; // 0..100
  sensitivity: number; // 40..200 (100 = 1.0x)
  colorblind: boolean;
  reduceMotion: boolean;
  largeText: boolean;
  keybindings: KeyBindings;
}

export type UiScreen = 'menu' | 'intro' | 'playing' | 'paused' | 'result' | 'bench' | 'leaderboard';

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
  private readonly captionsEl = document.getElementById('hud-captions')!;
  private readonly promptEl = document.getElementById('hud-prompt')!;
  private readonly toastEl = document.getElementById('hud-toast')!;
  private readonly vignetteEl = document.getElementById('hit-vignette')!;
  private readonly controlsBar = document.getElementById('controls-bar')!;
  private readonly arrowEl = document.getElementById('hud-lantern-arrow')!;
  private readonly arrowRotatorEl = document.getElementById('hud-arrow-rotator')!;
  private readonly arrowLabelEl = document.getElementById('hud-arrow-label')!;
  private readonly shadeArrowEl = document.getElementById('hud-shade-arrow')!;
  private readonly shadeRotatorEl = document.getElementById('hud-shade-rotator')!;
  private readonly shadeLabelEl = document.getElementById('hud-shade-label')!;

  private readonly pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
  private readonly muteBtn = document.getElementById('btn-mute') as HTMLButtonElement;
  private readonly helpBtn = document.getElementById('btn-help') as HTMLButtonElement;

  private readonly screenMenu = document.getElementById('screen-menu')!;
  private readonly screenLeaderboard = document.getElementById('screen-leaderboard')!;
  private readonly screenIntro = document.getElementById('screen-intro')!;
  private readonly screenPause = document.getElementById('screen-pause')!;
  private readonly screenResult = document.getElementById('screen-result')!;

  private readonly leaderboardWrapEl = document.getElementById('leaderboard-table-wrap')!;

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
  private readonly reduceMotionInput = document.getElementById('input-reduce-motion') as HTMLInputElement;
  private readonly reduceMotionVal = document.getElementById('val-reduce-motion')!;
  private readonly largeTextInput = document.getElementById('input-large-text') as HTMLInputElement;
  private readonly largeTextVal = document.getElementById('val-large-text')!;
  private readonly keybindGridEl = document.getElementById('keybind-grid')!;
  private readonly keybindConflictEl = document.getElementById('keybind-conflict-msg')!;
  private readonly resetKeybindsBtn = document.getElementById('btn-reset-keybinds') as HTMLButtonElement;

  private readonly resultEmblemEl = document.getElementById('result-emblem')!;
  private readonly resultTitleEl = document.getElementById('result-title')!;
  private readonly resultSubEl = document.getElementById('result-sub')!;
  private readonly resultStatsEl = document.getElementById('result-stats')!;
  private readonly resultSavePanelEl = document.getElementById('result-save-panel')!;
  private readonly playerNameInput = document.getElementById('input-player-name') as HTMLInputElement;
  private readonly saveScoreBtn = document.getElementById('btn-save-score') as HTMLButtonElement;
  private readonly saveScoreMsgEl = document.getElementById('result-save-msg')!;
  private readonly resultNextBtn = document.getElementById('btn-result-next') as HTMLButtonElement;
  private readonly resultRetryBtn = document.getElementById('btn-result-retry') as HTMLButtonElement;
  private readonly resultMenuBtn = document.getElementById('btn-result-menu') as HTMLButtonElement;

  private toastTimer = 0;
  private hitFlashTimer = 0;
  private shadeSpawnCaptionTimer = 0;
  private lastSpawnedShadeId: string | null = null;
  private controlsVisible = true;
  private settingsOpen = false;
  private settingsFromMenu = false;
  private colorblindMode = false;
  private reduceMotionMode = false;
  private currentSettings: GameSettings;
  private listeningAction: KeyAction | null = null;
  private pendingResultRecord: { score: number; nightsWon: number; seed: number; saved: boolean } | null =
    null;
  private readonly onChangeSettingsCb: (s: GameSettings) => void;
  private readonly projVec = new THREE.Vector3();
  private readonly lastHtmlCache = new Map<HTMLElement, string>();

  private setHtmlIfChanged(el: HTMLElement, html: string): void {
    if (this.lastHtmlCache.get(el) === html) return;
    this.lastHtmlCache.set(el, html);
    el.innerHTML = html;
  }

  constructor(initialSettings: GameSettings, cb: HudCallbacks) {
    this.currentSettings = {
      ...initialSettings,
      keybindings: { ...DEFAULT_KEYBINDINGS, ...initialSettings.keybindings }
    };
    this.onChangeSettingsCb = cb.onChangeSettings;

    document.getElementById('menu-emblem')!.innerHTML = svgLantern(true);
    document.getElementById('intro-emblem')!.innerHTML = svgLantern(true);
    document.getElementById('pause-emblem')!.innerHTML = svgLantern(true);
    this.arrowRotatorEl.innerHTML = svgDirectionArrow();
    this.shadeRotatorEl.innerHTML = svgDirectionArrow();

    this.helpBtn.innerHTML = `${svgHelp()}<span>[H]</span>`;
    this.setMuted(false);

    // Menu buttons
    document.getElementById('btn-start-campaign')!.addEventListener('click', () => cb.onStartCampaign());
    document.getElementById('btn-pick-night-1')!.addEventListener('click', () => cb.onStartNight(1));
    document.getElementById('btn-pick-night-2')!.addEventListener('click', () => cb.onStartNight(2));
    document.getElementById('btn-pick-night-3')!.addEventListener('click', () => cb.onStartNight(3));
    document.getElementById('btn-menu-leaderboard')!.addEventListener('click', () => {
      void this.openLeaderboard();
    });
    document.getElementById('btn-leaderboard-close')!.addEventListener('click', () => {
      this.closeLeaderboard();
    });
    document.getElementById('btn-menu-settings')!.addEventListener('click', () => this.openMenuSettings());

    // Intro buttons
    document.getElementById('btn-intro-play')!.addEventListener('click', () => cb.onBeginPlayFromIntro());
    document.getElementById('btn-intro-menu')!.addEventListener('click', () => cb.onBackToMenu());

    // Pause buttons
    this.pauseResumeBtn.addEventListener('click', () => {
      this.listeningAction = null;
      this.renderKeybinds();
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
    this.pauseMenuBtn.addEventListener('click', () => {
      this.listeningAction = null;
      cb.onBackToMenu();
    });

    // Result buttons & score save
    this.resultNextBtn.addEventListener('click', () => cb.onNextNight());
    this.resultRetryBtn.addEventListener('click', () => cb.onRetryNight());
    this.resultMenuBtn.addEventListener('click', () => cb.onBackToMenu());
    this.saveScoreBtn.addEventListener('click', () => {
      void this.handleSaveScore();
    });

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
    this.applySettingsToInputs(this.currentSettings);
    const emitSettings = () => {
      const next: GameSettings = {
        volume: Number(this.volumeInput.value),
        sensitivity: Number(this.sensitivityInput.value),
        colorblind: this.colorblindInput.checked,
        reduceMotion: this.reduceMotionInput.checked,
        largeText: this.largeTextInput.checked,
        keybindings: { ...this.currentSettings.keybindings }
      };
      this.currentSettings = next;
      this.applySettingsToInputs(next);
      this.onChangeSettingsCb(next);
    };
    this.volumeInput.addEventListener('input', emitSettings);
    this.sensitivityInput.addEventListener('input', emitSettings);
    this.colorblindInput.addEventListener('change', emitSettings);
    this.reduceMotionInput.addEventListener('change', emitSettings);
    this.largeTextInput.addEventListener('change', emitSettings);

    this.resetKeybindsBtn.addEventListener('click', () => {
      this.listeningAction = null;
      this.keybindConflictEl.classList.add('hidden');
      this.currentSettings = {
        ...this.currentSettings,
        keybindings: { ...DEFAULT_KEYBINDINGS }
      };
      this.applySettingsToInputs(this.currentSettings);
      this.onChangeSettingsCb(this.currentSettings);
    });

    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (!this.listeningAction) return;
        e.preventDefault();
        e.stopPropagation();

        if (e.code === 'Escape') {
          this.listeningAction = null;
          this.renderKeybinds();
          return;
        }

        const conflict = detectKeyConflict(
          this.currentSettings.keybindings,
          this.listeningAction,
          e.code
        );
        if (conflict) {
          this.keybindConflictEl.textContent = `⚠ Phím [${formatKeyCodeLabel(e.code)}] đang dùng cho "${KEY_ACTION_LABELS[conflict]}". Hãy chọn phím khác!`;
          this.keybindConflictEl.classList.remove('hidden');
          this.listeningAction = null;
          this.renderKeybinds();
          return;
        }

        this.keybindConflictEl.classList.add('hidden');
        this.currentSettings = {
          ...this.currentSettings,
          keybindings: {
            ...this.currentSettings.keybindings,
            [this.listeningAction]: e.code
          }
        };
        this.listeningAction = null;
        this.applySettingsToInputs(this.currentSettings);
        this.onChangeSettingsCb(this.currentSettings);
      },
      true
    );
  }

  isCapturingKeybind(): boolean {
    return this.listeningAction !== null;
  }

  private renderKeybinds(): void {
    let html = '';
    for (const action of KEY_ACTION_ORDER) {
      const code = this.currentSettings.keybindings[action];
      const isListening = this.listeningAction === action;
      const btnText = isListening ? 'Nhấn phím...' : formatKeyCodeLabel(code);
      html += `<div class="keybind-row"><span>${KEY_ACTION_LABELS[action]}</span><button class="keybind-btn ${isListening ? 'is-listening' : ''}" type="button" data-action="${action}">${btnText}</button></div>`;
    }
    this.keybindGridEl.innerHTML = html;
    this.keybindGridEl.querySelectorAll<HTMLButtonElement>('.keybind-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.action as KeyAction;
        this.listeningAction = this.listeningAction === act ? null : act;
        this.renderKeybinds();
      });
    });
  }

  private renderControlsBar(): void {
    const kb = this.currentSettings.keybindings;
    const mv = `${formatKeyCodeLabel(kb.up)}/${formatKeyCodeLabel(kb.left)}/${formatKeyCodeLabel(kb.down)}/${formatKeyCodeLabel(kb.right)}`;
    const html = `
      <span><b>${mv}</b> Di chuyển</span>
      <span><b>${formatKeyCodeLabel(kb.jump)}</b> Nhảy</span>
      <span><b>${formatKeyCodeLabel(kb.dash)}</b> Lướt</span>
      <span><b>${formatKeyCodeLabel(kb.interact)}</b> Nạp/Châm</span>
      <span><b>${formatKeyCodeLabel(kb.pulse)} / RMB</b> Tỏa Sáng</span>
      <span><b>${formatKeyCodeLabel(kb.pause)} / Esc</b> Dừng</span>
    `;
    this.setHtmlIfChanged(this.controlsBar, html);
  }

  private applySettingsToInputs(s: GameSettings): void {
    this.volumeInput.value = String(s.volume);
    this.volumeVal.textContent = `${s.volume}%`;
    this.sensitivityInput.value = String(s.sensitivity);
    this.sensitivityVal.textContent = `${(s.sensitivity / 100).toFixed(1)}×`;
    this.colorblindInput.checked = s.colorblind;
    this.colorblindVal.textContent = s.colorblind ? 'Bật' : 'Tắt';
    this.reduceMotionInput.checked = s.reduceMotion;
    this.reduceMotionVal.textContent = s.reduceMotion ? 'Bật' : 'Tắt';
    this.largeTextInput.checked = s.largeText;
    this.largeTextVal.textContent = s.largeText ? 'Bật' : 'Tắt';

    this.colorblindMode = s.colorblind;
    this.reduceMotionMode = s.reduceMotion;
    document.body.classList.toggle('is-colorblind', s.colorblind);
    document.body.classList.toggle('is-reduce-motion', s.reduceMotion);
    document.body.classList.toggle('is-large-text', s.largeText);
    this.renderKeybinds();
    this.renderControlsBar();
  }

  private async openLeaderboard(): Promise<void> {
    this.screenMenu.classList.add('hidden');
    this.screenLeaderboard.classList.remove('hidden');
    this.leaderboardWrapEl.innerHTML = '<p>Đang tải bảng xếp hạng...</p>';
    const entries = await fetchLeaderboard();
    if (entries.length === 0) {
      this.leaderboardWrapEl.innerHTML =
        '<p>Chưa có kỷ lục nào được lưu. Hoàn thành Đêm 3 hoặc kết thúc lượt chơi để ghi tên!</p>';
      return;
    }
    let rows = '';
    entries.forEach((e, idx) => {
      const dateStr = e.achieved_at.replace('T', ' ').slice(0, 16);
      rows += `<tr><td>#${idx + 1}</td><td>${this.escapeHtml(e.name)}</td><td>${e.score}</td><td>${e.nights_won}/3</td><td>${e.seed}</td><td>${this.escapeHtml(dateStr)}</td></tr>`;
    });
    this.leaderboardWrapEl.innerHTML = `
      <table class="leaderboard-table">
        <thead><tr><th>Hạng</th><th>Tên</th><th>Điểm</th><th>Đêm</th><th>Seed</th><th>Thời gian</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private closeLeaderboard(): void {
    this.screenLeaderboard.classList.add('hidden');
    this.screenMenu.classList.remove('hidden');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async handleSaveScore(): Promise<void> {
    if (!this.pendingResultRecord || this.pendingResultRecord.saved) return;
    const raw = this.playerNameInput.value;
    const check = validatePlayerName(raw);
    if (!check.valid) {
      this.saveScoreMsgEl.textContent = check.error ?? 'Tên không hợp lệ';
      this.saveScoreMsgEl.className = 'result-save-msg is-error';
      this.saveScoreMsgEl.classList.remove('hidden');
      return;
    }
    this.saveScoreBtn.disabled = true;
    try {
      await saveLeaderboardScore({
        name: check.normalized,
        score: this.pendingResultRecord.score,
        nights_won: this.pendingResultRecord.nightsWon,
        seed: this.pendingResultRecord.seed
      });
      this.pendingResultRecord.saved = true;
      this.saveScoreMsgEl.textContent = `Đã lưu thành tích "${check.normalized}" (${this.pendingResultRecord.score} điểm) lên đĩa!`;
      this.saveScoreMsgEl.className = 'result-save-msg';
      this.saveScoreMsgEl.classList.remove('hidden');
    } catch (err) {
      this.saveScoreMsgEl.textContent = (err as Error).message;
      this.saveScoreMsgEl.className = 'result-save-msg is-error';
      this.saveScoreMsgEl.classList.remove('hidden');
      this.saveScoreBtn.disabled = false;
    }
  }

  private openMenuSettings(): void {
    this.settingsFromMenu = true;
    this.settingsOpen = true;
    this.listeningAction = null;
    this.keybindConflictEl.classList.add('hidden');
    this.screenMenu.classList.add('hidden');
    this.screenPause.classList.remove('hidden');
    this.pauseTitleEl.textContent = 'Cài đặt & Trợ năng';
    this.pauseSubEl.textContent = 'Tất cả cài đặt được lưu tự động trên trình duyệt.';
    this.pauseSettingsPanel.classList.remove('hidden');
    this.pauseResumeBtn.textContent = 'Quay lại Menu';
    this.pauseRestartBtn.classList.add('hidden');
    this.pauseSettingsBtn.classList.add('hidden');
    this.pauseMenuBtn.classList.add('hidden');
    this.renderKeybinds();
  }

  private closeMenuSettings(): void {
    this.settingsFromMenu = false;
    this.settingsOpen = false;
    this.listeningAction = null;
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
    this.screenLeaderboard.classList.toggle('hidden', screen !== 'leaderboard');
    this.screenIntro.classList.toggle('hidden', screen !== 'intro');
    this.screenPause.classList.toggle('hidden', screen !== 'paused');
    this.screenResult.classList.toggle('hidden', screen !== 'result');
    this.hudLayer.classList.toggle(
      'hidden',
      screen === 'menu' || screen === 'intro' || screen === 'bench' || screen === 'leaderboard'
    );
    if (screen !== 'playing') {
      this.arrowEl.classList.add('hidden');
      this.shadeArrowEl.classList.add('hidden');
    }

    if (screen === 'intro') {
      const lore = NIGHT_LORE[night];
      document.getElementById('intro-kicker')!.textContent = lore.kicker;
      document.getElementById('intro-title')!.textContent = lore.title;
      document.getElementById('intro-quote')!.textContent = lore.quote;
      document.getElementById('intro-meta')!.innerHTML = `
        <div class="stat-box"><div class="stat-label">Ngưỡng thắng</div><div class="stat-val">${lore.lanternNeedLabel}</div></div>
        <div class="stat-box"><div class="stat-label">Thời gian</div><div class="stat-val">${lore.durationLabel}</div></div>
        <div class="stat-box"><div class="stat-label">Đặc trưng</div><div class="stat-val">${lore.featureLabel}</div></div>
      `;
    } else if (screen === 'paused') {
      this.settingsFromMenu = false;
      this.listeningAction = null;
      this.keybindConflictEl.classList.add('hidden');
      const mapCfg = getMapConfig(night);
      const pauseKey = formatKeyCodeLabel(this.currentSettings.keybindings.pause);
      this.pauseTitleEl.textContent = 'Đang Tạm Dừng';
      this.pauseSubEl.textContent = `Đêm ${night} · ${mapCfg.name} (${Math.round(fpsAvg)} FPS) vẫn lặng lẽ đợi ánh lửa từ bạn.`;
      this.pauseSettingsPanel.classList.toggle('hidden', !this.settingsOpen);
      this.pauseResumeBtn.textContent = `Tiếp tục [Esc / ${pauseKey}]`;
      this.pauseRestartBtn.classList.remove('hidden');
      this.pauseSettingsBtn.classList.remove('hidden');
      this.pauseMenuBtn.classList.remove('hidden');
    }
    const pauseKey = formatKeyCodeLabel(this.currentSettings.keybindings.pause);
    this.pauseBtn.innerHTML = `${svgPause(screen === 'paused')}<span>${screen === 'paused' ? 'Tiếp' : `[${pauseKey}]`}</span>`;
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
      } else if (ev.name === 'shade_spawned') {
        this.shadeSpawnCaptionTimer = 4.0;
        this.lastSpawnedShadeId = ev.data.id;
      } else if (ev.name === 'player_hit') {
        if (!this.reduceMotionMode) {
          this.vignetteEl.classList.add('active');
          this.hitFlashTimer = 0.08;
        }
      }
    }
  }

  renderResult(
    state: SimState,
    campaignMode: boolean,
    campaignTotalScore: number,
    nightsWonCount = 0
  ): void {
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

    const eligibleSave = isDawnVictory || state.status === 'lost';
    this.resultSavePanelEl.classList.toggle('hidden', !eligibleSave);
    if (eligibleSave) {
      this.pendingResultRecord = {
        score: campaignTotalScore,
        nightsWon: Math.max(0, Math.min(3, nightsWonCount)),
        seed: state.seed,
        saved: false
      };
      this.playerNameInput.value = '';
      this.saveScoreBtn.disabled = false;
      this.saveScoreMsgEl.classList.add('hidden');
    } else {
      this.pendingResultRecord = null;
    }

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
    if (this.shadeSpawnCaptionTimer > 0) {
      this.shadeSpawnCaptionTimer = Math.max(0, this.shadeSpawnCaptionTimer - frameDt);
      if (this.shadeSpawnCaptionTimer === 0) this.lastSpawnedShadeId = null;
    }

    if (!isPlayingScreen) return;

    const kb = this.currentSettings.keybindings;
    const dashLabel = formatKeyCodeLabel(kb.dash);
    const pulseLabel = formatKeyCodeLabel(kb.pulse);
    const interactLabel = formatKeyCodeLabel(kb.interact);

    this.nightBadgeEl.textContent = `Đ${state.night}`;
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
      this.setHtmlIfChanged(this.charmBadgeEl, `${svgDash()}<span>Bùa ${charmSecs}s</span>`);
    } else {
      this.charmBadgeEl.classList.add('hidden');
    }

    // Low-fuel warning pill (< 30)
    const weakLanterns = state.lanterns.filter((l) => l.lit && l.fuelTicks < LOW_FUEL_TICKS);
    if (weakLanterns.length > 0) {
      this.lowFuelBadgeEl.classList.remove('hidden');
      this.setHtmlIfChanged(
        this.lowFuelBadgeEl,
        `<span>⚠ Dầu yếu: ${weakLanterns.map((l) => l.id).join(',')}</span>`
      );
    } else {
      this.lowFuelBadgeEl.classList.add('hidden');
    }

    // Wind Gust warning / active badge
    if (state.wind.enabled && (state.wind.warning || state.wind.active)) {
      this.windBadgeEl.classList.remove('hidden');
      this.windBadgeEl.classList.toggle('is-active', state.wind.active);
      this.setHtmlIfChanged(
        this.windBadgeEl,
        state.wind.active
          ? `${svgWind()}<span>${warnGlyph}GIÓ MẠNH!</span>`
          : `${svgWind()}<span>⚠ Gió sắp thổi</span>`
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

    // Timer & Score
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

    // Accessibility visual captions (Shade spawned, Wind warning, Final 10s, Fuel < 30)
    const captions: string[] = [];
    if (this.shadeSpawnCaptionTimer > 0 && this.lastSpawnedShadeId) {
      captions.push(`⚠ Bóng Mực ${this.lastSpawnedShadeId} vừa xuất hiện!`);
    }
    if (state.wind.enabled && state.wind.warning) {
      captions.push('⚠ Gió mạnh sắp thổi!');
    }
    if (secs > 0 && secs <= 10 && state.status === 'playing') {
      captions.push(`⚠ Còn ${secs}s đến bình minh!`);
    }
    if (weakLanterns.length > 0) {
      captions.push(`⚠ Đèn có fuel < 30: ${weakLanterns.map((l) => l.id).join(', ')}`);
    }
    if (captions.length > 0 && state.status === 'playing') {
      this.captionsEl.classList.remove('hidden');
      this.setHtmlIfChanged(this.captionsEl, captions.join(' · '));
    } else {
      this.captionsEl.classList.add('hidden');
    }

    // Dash Cooldown Ability Pill
    const dashCdS = state.player.dashCdTicks * DT;
    if (state.player.charmTicks > 0) {
      this.dashEl.className = 'pill ability-pill is-ready';
      this.setHtmlIfChanged(this.dashEl, `${svgDash()}<span>Lướt [${dashLabel}] · ∞</span>`);
    } else if (dashCdS > 0) {
      const ratio = Math.min(1, Math.max(0, (TUNING.dash_cooldown_s - dashCdS) / TUNING.dash_cooldown_s)).toFixed(3);
      this.dashEl.className = 'pill ability-pill is-wait';
      this.setHtmlIfChanged(
        this.dashEl,
        `${svgDash()}<span>Lướt ${dashCdS.toFixed(1)}s</span><span class="ability-progress"><span class="ability-progress-fill" style="transform:scaleX(${ratio})"></span></span>`
      );
    } else {
      this.dashEl.className = 'pill ability-pill is-ready';
      this.setHtmlIfChanged(this.dashEl, `${svgDash()}<span>Lướt [${dashLabel}]</span>`);
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
      this.setHtmlIfChanged(this.pulseEl, `${svgPulse()}<span>Cần ${TUNING.pulse_cost}</span>`);
    } else {
      this.pulseEl.className = 'pill ability-pill is-ready';
      this.setHtmlIfChanged(this.pulseEl, `${svgPulse()}<span>Tỏa Sáng [${pulseLabel}]</span>`);
    }

    // Contextual interact prompt
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
            ? `${interactLabel} — ${actionLabel} (${bestReceivable.deposited}/${req}) · ${bestReceivable.id}`
            : `${bestReceivable.id} (${bestReceivable.deposited}/${req}) — Cần đom đóm`;
      } else {
        const pct = Math.min(99, Math.round((bestReceivable.fuelTicks / FUEL_MAX_TICKS) * 100));
        this.promptEl.textContent =
          state.player.carried > 0
            ? `${interactLabel} — Châm dầu ${bestReceivable.id} (${pct}%)`
            : `${bestReceivable.id} (${pct}%) — Cần đom đóm để châm`;
      }
    } else {
      this.promptEl.classList.add('hidden');
    }

    this.updateOffscreenLanternArrow(state, camera);
    this.updateOffscreenShadeArrow(state, camera);
  }

  private positionEdgeArrow(
    el: HTMLElement,
    rotatorEl: HTMLElement,
    labelEl: HTMLElement,
    worldPos: readonly [number, number, number],
    yOffset: number,
    label: string,
    camera: THREE.PerspectiveCamera
  ): void {
    this.projVec.set(worldPos[0], worldPos[1] + yOffset, worldPos[2]).project(camera);
    const behind = this.projVec.z > 1;
    const nx = behind ? -this.projVec.x : this.projVec.x;
    const ny = behind ? -this.projVec.y : this.projVec.y;

    const inView = !behind && Math.abs(nx) <= 0.88 && Math.abs(ny) <= 0.84;
    if (inView) {
      el.classList.add('hidden');
      return;
    }

    const edgeScale = Math.max(Math.abs(nx) / 0.86, Math.abs(ny) / 0.78, 1e-4);
    const ex = nx / edgeScale;
    const ey = ny / edgeScale;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const px = Math.max(68, Math.min(vw - 68, (ex * 0.5 + 0.5) * vw));
    const py = Math.max(92, Math.min(vh - 122, (-ey * 0.5 + 0.5) * vh));
    const arrowDeg = (Math.atan2(nx, ny) * 180) / Math.PI;

    el.classList.remove('hidden');
    el.style.left = `${px.toFixed(1)}px`;
    el.style.top = `${py.toFixed(1)}px`;
    rotatorEl.style.transform = `rotate(${arrowDeg.toFixed(1)}deg)`;
    labelEl.textContent = label;
  }

  private updateOffscreenLanternArrow(state: SimState, camera: THREE.PerspectiveCamera): void {
    if (state.status !== 'playing') {
      this.arrowEl.classList.add('hidden');
      return;
    }

    let nearest: (typeof state.lanterns)[number] | null = null;
    let bestDist = Infinity;
    const weak = state.lanterns.filter((l) => l.lit && l.fuelTicks < LOW_FUEL_TICKS);
    const unlit = state.lanterns.filter((l) => !l.lit);
    // Prioritize low-fuel warning target if present, else nearest unlit lantern
    const candidates = weak.length > 0 ? weak : unlit;

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
    const prefix = nearest.lit && nearest.fuelTicks < LOW_FUEL_TICKS ? '⚠ ' : '';
    this.positionEdgeArrow(
      this.arrowEl,
      this.arrowRotatorEl,
      this.arrowLabelEl,
      nearest.pos,
      2.8,
      `${prefix}${nearest.id} · ${Math.round(bestDist)}m`,
      camera
    );
  }

  private updateOffscreenShadeArrow(state: SimState, camera: THREE.PerspectiveCamera): void {
    if (state.status !== 'playing' || state.shades.length === 0) {
      this.shadeArrowEl.classList.add('hidden');
      return;
    }

    let targetShade: (typeof state.shades)[number] | undefined =
      this.shadeSpawnCaptionTimer > 0 && this.lastSpawnedShadeId
        ? state.shades.find((s) => s.id === this.lastSpawnedShadeId)
        : undefined;
    let targetDist = targetShade
      ? Math.hypot(
          targetShade.pos[0] - state.player.pos[0],
          targetShade.pos[2] - state.player.pos[2]
        )
      : Infinity;

    if (!targetShade) {
      for (const s of state.shades) {
        const d = Math.hypot(s.pos[0] - state.player.pos[0], s.pos[2] - state.player.pos[2]);
        if (d <= 20 && d < targetDist) {
          targetDist = d;
          targetShade = s;
        }
      }
    }

    if (!targetShade) {
      this.shadeArrowEl.classList.add('hidden');
      return;
    }

    this.positionEdgeArrow(
      this.shadeArrowEl,
      this.shadeRotatorEl,
      this.shadeLabelEl,
      targetShade.pos,
      1.2,
      `⚠ Bóng · ${Math.round(targetDist)}m`,
      camera
    );
  }
}
