# Звуки ролика: вжух на подъёме, вжух на нырке, удар при посадке карточки. Пишет sfx.wav (стерео, 44,1 кГц) длиной в ролик.
# Моменты — из timeline.js (подъём 59,15–60,65, нырок 60,87–61,37).
import sys
import wave
import numpy as np

SR = 44100
DUR = 68.8
RISE = (59.2, 60.65)
DIVE = (60.87, 61.37)
HIT = 61.37
rng = np.random.default_rng(7)
out = np.zeros((int(SR * DUR), 2))


def svf_bandpass(x, f, q):
    """Полосовой фильтр с меняющейся частотой (state variable)."""
    y = np.zeros_like(x)
    low = band = 0.0
    for i in range(len(x)):
        k = 2 * np.sin(np.pi * min(f[i], SR / 6) / SR)
        high = x[i] - low - band / q
        band += k * high
        low += k * band
        y[i] = band
    return y


def whoosh(t0, t1, f0, f1, peak_at, gain, pan0, pan1):
    n = int((t1 - t0) * SR)
    t = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    f = f0 * (f1 / f0) ** (t ** 1.4)
    body = svf_bandpass(noise, f, 1.6)
    # Нарастание до пика и быстрый спад.
    env = np.where(t < peak_at, (t / peak_at) ** 2.2, np.exp(-((t - peak_at) / (1 - peak_at)) * 4.0))
    s = body * env
    s /= np.max(np.abs(s)) + 1e-9
    pan = pan0 + (pan1 - pan0) * t
    i0 = int(t0 * SR)
    out[i0:i0 + n, 0] += s * gain * np.sqrt(1 - pan) * 1.2
    out[i0:i0 + n, 1] += s * gain * np.sqrt(pan) * 1.2


def hit(t0, gain):
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    # Низкий удар с падением высоты + короткий щелчок + мягкий хвост.
    f = 38 + 70 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    thump = np.sin(ph) * np.exp(-t * 7.5)
    click = rng.standard_normal(n) * np.exp(-t * 260) * 0.5
    tail = svf_bandpass(rng.standard_normal(n), np.full(n, 900.0), 0.8) * np.exp(-t * 9) * 0.25
    s = thump + click + tail
    s /= np.max(np.abs(s))
    i0 = int(t0 * SR)
    out[i0:i0 + n, 0] += s * gain
    out[i0:i0 + n, 1] += s * gain


whoosh(RISE[0], RISE[1] + 0.25, 260, 2400, 0.62, 0.30, 0.35, 0.65)
whoosh(DIVE[0] - 0.25, DIVE[1] + 0.05, 2600, 300, 0.85, 0.34, 0.6, 0.45)
hit(HIT - 0.005, 0.5)
out = np.clip(out, -1, 1)
pcm = (out * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'sfx.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('ok')
