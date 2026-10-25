"""Métricas de estilo de imagen para comparar capturas del juego con un conjunto de referencia.

Uso:
  python3 tests/judge/style.py <imagen o carpeta> [...] [--json salida.json]

Se excluyen las zonas de interfaz (esquinas superiores) para medir solo la escena. Todas las
métricas trabajan en CIE L*a*b* sobre la imagen escalada a 640 px de ancho.

- black_pct: % de píxeles con L* < 6 (masas negras de primer plano y marcos de corte).
- l_p5 / l_p50 / l_p95: percentiles de luminosidad.
- chroma_mean / chroma_p95: croma C*ab media y percentil 95.
- accent_pct: % de píxeles con C* > 45 y L* > 55 (acentos luminosos saturados: efectos, luces).
- hue_unity: fracción de los píxeles cromáticos (C* > 8) cuyo tono cae a ±35° del tono dominante
  (unidad cromática de la sala).
- detail: % de píxeles con gradiente de L* > 12 por píxel (riqueza de detalle).
- contrast: desviación típica de L*.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HUD_BOXES = [(0.0, 0.0, 0.25, 0.2), (0.82, 0.0, 1.0, 0.22)]  # fracciones x0, y0, x1, y1


def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return L, a, b


def metrics(path):
    im = Image.open(path).convert('RGB')
    w = 640
    h = round(im.size[1] * w / im.size[0])
    im = im.resize((w, h), Image.LANCZOS)
    rgb = np.asarray(im).astype(np.float64)
    L, a, b = srgb_to_lab(rgb)
    mask = np.ones(L.shape, bool)
    for x0, y0, x1, y1 in HUD_BOXES:
        mask[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = False
    Lm = L[mask]
    C = np.hypot(a, b)
    Cm = C[mask]
    hue = (np.degrees(np.arctan2(b, a)) + 360) % 360
    chrom = mask & (C > 8)
    hv = hue[chrom]
    unity = 0.0
    dom = None
    if hv.size:
        hist, _ = np.histogram(hv, bins=36, range=(0, 360), weights=C[chrom])
        k = int(np.argmax(hist))
        dom = k * 10 + 5
        d = np.abs(((hv - dom) + 180) % 360 - 180)
        unity = float((d <= 35).mean())
    gy, gx = np.gradient(L)
    g = np.hypot(gx, gy)
    return {
        'black_pct': round(float((Lm < 6).mean() * 100), 1),
        'l_p5': round(float(np.percentile(Lm, 5)), 1),
        'l_p50': round(float(np.percentile(Lm, 50)), 1),
        'l_p95': round(float(np.percentile(Lm, 95)), 1),
        'contrast': round(float(Lm.std()), 1),
        'chroma_mean': round(float(Cm.mean()), 1),
        'chroma_p95': round(float(np.percentile(Cm, 95)), 1),
        'accent_pct': round(float(((Cm > 45) & (Lm > 55)).mean() * 100), 2),
        'hue_unity': round(unity, 2),
        'hue_dom': dom,
        'detail': round(float((g[mask] > 12).mean() * 100), 1),
    }


def main(argv):
    out = None
    if '--json' in argv:
        i = argv.index('--json')
        out = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    files = []
    for p in argv:
        if os.path.isdir(p):
            files += sorted(os.path.join(p, f) for f in os.listdir(p) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')) and not f.startswith(('A', 'mosaico')))
        else:
            files.append(p)
    res = {os.path.basename(f): metrics(f) for f in files}
    keys = ['black_pct', 'l_p5', 'l_p50', 'l_p95', 'contrast', 'chroma_mean', 'chroma_p95', 'accent_pct', 'hue_unity', 'detail']
    print('| imagen | ' + ' | '.join(keys) + ' |')
    print('|---' * (len(keys) + 1) + '|')
    for k, v in res.items():
        print(f'| {k} | ' + ' | '.join(str(v[q]) for q in keys) + ' |')
    med = {q: round(float(np.median([v[q] for v in res.values()])), 2) for q in keys}
    print('| **mediana** | ' + ' | '.join(str(med[q]) for q in keys) + ' |')
    if out:
        json.dump({'images': res, 'median': med}, open(out, 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])
