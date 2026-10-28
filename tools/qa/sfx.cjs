// Прослушать звуки барабана без игры: рычаг, вращение трёх барабанов и звон — офлайн в браузере, в WAV.
// Нужен запущенный `npx vite --port 5174`. Запуск: node tools/qa/sfx.cjs [файл.wav] (по умолчанию shots/sfx.wav).
// Печатает пик и время остановки барабанов; громче 0,99 — звук обрезается.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = process.argv[2] || path.join(process.env.SHOTS || 'shots', 'sfx.wav');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:5174/');
  const res = await p.evaluate(async () => {
    const { leverSound, reelsSound } = await import('/src/sfx.ts');
    const { reelTiming } = await import('/src/ui/Slots.tsx');
    const sr = 44100;
    const c = new OfflineAudioContext(2, sr * 6, sr);
    // Как в игре: рычаг, через 0,45 с — барабаны (2,3 / 3,2 / 4,1 с, по 27 строк).
    const reels = [2300, 3200, 4100].map((d) => reelTiming(d, 27));
    leverSound(c, c.destination, 0.2);
    reelsSound(c, c.destination, 0.65, reels);
    const buf = await c.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0;
    const pcm = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) {
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767;
      pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
    }
    const head = new DataView(new ArrayBuffer(44));
    const w = (o, s) => [...s].forEach((ch, i) => head.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); head.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVE'); w(12, 'fmt ');
    head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 2, true); head.setUint32(24, sr, true);
    head.setUint32(28, sr * 4, true); head.setUint16(32, 4, true); head.setUint16(34, 16, true); w(36, 'data'); head.setUint32(40, pcm.byteLength, true);
    const bytes = new Uint8Array(44 + pcm.byteLength);
    bytes.set(new Uint8Array(head.buffer), 0);
    bytes.set(new Uint8Array(pcm.buffer), 44);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { wav: btoa(bin), peak, ticks: reels.map((r) => r.ticks.length), land: reels.map((r) => +r.land.toFixed(2)) };
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(res.wav, 'base64'));
  console.log(`${out}: пик ${res.peak.toFixed(2)}${res.peak > 0.99 ? ' — ОБРЕЗАЕТСЯ' : ''}; щелчков по барабанам ${res.ticks.join('/')}; встают через ${res.land.join(' / ')} с`);
  await b.close();
  process.exit(res.peak > 0.99 ? 1 : 0);
})();
