export function svgFlame(filled: boolean): string {
  return `<svg class="ico ico-flame ${filled ? 'is-on' : 'is-off'}" viewBox="0 0 24 24" fill="${
    filled ? 'currentColor' : 'none'
  }" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2.5c2.8 3.2 5.5 6.3 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.1 1-4.1 2.2-5.7.4 1.6 1.5 2.4 2.3 2.5-.3-2.5.4-4.7 1-7Z"/>
  </svg>`;
}

export function svgMote(): string {
  return `<svg class="ico ico-mote" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" fill="currentColor"/>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>
  </svg>`;
}

export function svgLantern(lit: boolean): string {
  return `<svg class="ico ico-lantern ${lit ? 'is-on' : 'is-off'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2v2M7 6h10l-1.5-2h-7L7 6Z"/>
    <rect x="6.5" y="6" width="11" height="12" rx="3" fill="${lit ? 'currentColor' : 'none'}" fill-opacity="${lit ? '0.85' : '0'}"/>
    <path d="M8 20h8M12 18v2"/>
  </svg>`;
}

export function svgClock(): string {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3.2 2"/>
  </svg>`;
}

export function svgPulse(): string {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
    <circle cx="12" cy="12" r="7" stroke-dasharray="3 2.5"/>
    <circle cx="12" cy="12" r="10.5" opacity="0.55"/>
  </svg>`;
}

export function svgSound(muted: boolean): string {
  return muted
    ? `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z"/>
        <path d="m21 9-6 6M15 9l6 6"/>
      </svg>`
    : `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z"/>
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>
      </svg>`;
}

export function svgPause(paused: boolean): string {
  return paused
    ? `<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="7 5 19 12 7 19 7 5"/>
      </svg>`
    : `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1"/>
        <rect x="14" y="5" width="4" height="14" rx="1"/>
      </svg>`;
}

export function svgHelp(): string {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/>
    <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2.1-2.4 3.6M12 17.2h.01"/>
  </svg>`;
}
