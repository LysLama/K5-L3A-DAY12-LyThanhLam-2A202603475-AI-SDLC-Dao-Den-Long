import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-high-performance-gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
if (process.platform === 'win32') {
  // OpenGL ANGLE avoids Windows D3D11 DXGI WaitForGetOffsetInRange stalls on Iris Xe
  app.commandLine.appendSwitch('use-angle', 'gl');
} else if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

function getFlag(name: string): string {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : '';
}

const url = process.env.DDL_BENCH_URL || getFlag('--url');
const memOut = process.env.DDL_BENCH_MEM_OUT || getFlag('--mem-out');

let peakMemMb = 0;
let pollTimer: NodeJS.Timeout | null = null;

function sampleMetrics(): void {
  try {
    const metrics = app.getAppMetrics();
    let totalKb = 0;
    for (const m of metrics) {
      totalKb += m.memory?.workingSetSize ?? 0;
    }
    const mb = totalKb / 1024;
    if (mb > peakMemMb) peakMemMb = mb;
  } catch {
    // ignore metrics error
  }
}

function flushMem(): void {
  sampleMetrics();
  if (!memOut) return;
  try {
    fs.mkdirSync(path.dirname(memOut), { recursive: true });
    fs.writeFileSync(memOut, JSON.stringify({ peak_mem_mb: Math.round(peakMemMb) }));
  } catch {
    // ignore
  }
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    fullscreen: false,
    resizable: false,
    show: true,
    backgroundColor: '#0e1430',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true
    }
  });

  win.setMenuBarVisibility(false);
  pollTimer = setInterval(sampleMetrics, 1500);

  win.webContents.on('did-finish-load', () => {
    sampleMetrics();
  });

  const finishBench = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    flushMem();
    if (!win.isDestroyed()) win.close();
    app.quit();
  };

  process.on('message', (msg) => {
    if (msg === 'quit') finishBench();
  });

  win.on('closed', () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    flushMem();
  });

  void win.loadURL(url);
});

app.on('window-all-closed', () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  flushMem();
  app.quit();
});
