"""Juez v3 · compone la lámina del motor y la mide recuadro a recuadro.

Uso:
  python3 tests/judge/sheet.py <carpeta> [--ref <lámina de referencia>] [--cmp <salida.jpg>]
                               [--write-ref tests/judge/referencia_mago.json]

<carpeta> contiene las capturas del estudio (front, face, back, seed, condense, eclipse, launch).
Se escribe <carpeta>/lamina.png (1536×1024, misma composición que la referencia) y
<carpeta>/metricas.json. Con --ref se miden también los recuadros de la referencia y se informan las
proporciones motor/referencia; --cmp guarda una comparación lado a lado (fuera del repositorio: la
lámina de referencia no se versiona); --write-ref guarda solo las cifras de la referencia.

Métricas por recuadro (CIE L*a*b* al tamaño del recuadro):
- detail: % de píxeles con gradiente de L* > 12 (bordes y relieves legibles).
- fine: energía de alta frecuencia (media de |laplaciano de L*|): textura fina (poros, hebras,
  cuero, bordados). Es la cifra que más separa una pintura detallada de un render liso.
- contrast: desviación típica de L*; l_p50 / l_p95: luminosidad mediana y altas luces.
- violet_pct: % de píxeles violetas (tono 255–320°, saturación > 0,25, valor > 0,2).
- palette: intersección de histogramas (L*, a*, b*) con la referencia (1 = misma paleta).
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1536, 1024
BOXES = {
    'front': (0, 0, 630, 665),
    'face': (630, 0, 1200, 665),
    'back': (1200, 0, 1536, 665),
    'seed': (0, 668, 384, 988),
    'condense': (384, 668, 768, 988),
    'eclipse': (768, 668, 1152, 988),
    'launch': (1152, 668, 1536, 988),
}
LABELS = {'seed': 'SEMILLA', 'condense': 'CONDENSACIÓN', 'eclipse': 'ECLIPSE', 'launch': 'LANZAMIENTO'}


def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return 116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])


def hist3(L, a, b):
    h1, _ = np.histogram(L, bins=16, range=(0, 100))
    h2 = np.histogram2d(a.ravel(), b.ravel(), bins=12, range=[[-40, 40], [-40, 40]])[0]
    h1 = h1 / max(1, h1.sum())
    h2 = h2.ravel() / max(1, h2.sum())
    return h1, h2


def measure(im):
    rgb = np.asarray(im.convert('RGB')).astype(np.float64)
    L, a, b = srgb_to_lab(rgb)
    gy, gx = np.gradient(L)
    g = np.hypot(gx, gy)
    lap = np.abs(4 * L[1:-1, 1:-1] - L[:-2, 1:-1] - L[2:, 1:-1] - L[1:-1, :-2] - L[1:-1, 2:])
    hsv = np.asarray(im.convert('HSV')).astype(np.float64)
    hue = hsv[..., 0] * 360 / 255
    vio = (hue >= 255) & (hue <= 320) & (hsv[..., 1] > 64) & (hsv[..., 2] > 51)
    return {
        'detail': round(float((g > 12).mean() * 100), 2),
        'fine': round(float(lap.mean()), 3),
        'contrast': round(float(L.std()), 2),
        'l_p50': round(float(np.percentile(L, 50)), 1),
        'l_p95': round(float(np.percentile(L, 95)), 1),
        'violet_pct': round(float(vio.mean() * 100), 2),
    }, hist3(L, a, b)


def fit(im, w, h):
    # recorte centrado al tamaño del recuadro (las capturas pueden venir supermuestreadas)
    s = max(w / im.size[0], h / im.size[1])
    im = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
    x0, y0 = (im.size[0] - w) // 2, (im.size[1] - h) // 2
    return im.crop((x0, y0, x0 + w, y0 + h))


def font(size):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', '/usr/share/fonts/truetype/freefont/FreeSerif.ttf']:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def compose(folder):
    sheet = Image.new('RGB', (W, H), (16, 15, 18))
    panels = {}
    for k, (x0, y0, x1, y1) in BOXES.items():
        p = os.path.join(folder, f'{k}.png')
        if not os.path.exists(p):
            continue
        im = fit(Image.open(p).convert('RGB'), x1 - x0, y1 - y0)
        panels[k] = im
        sheet.paste(im, (x0, y0))
    d = ImageDraw.Draw(sheet)
    d.line([(0, 666), (W, 666)], fill=(150, 130, 110), width=2)
    f = font(17)
    for k, t in LABELS.items():
        x0, _, x1, _ = BOXES[k]
        tw = d.textlength(t, font=f)
        d.text(((x0 + x1 - tw) / 2, 996), t, fill=(196, 188, 176), font=f)
    sheet.save(os.path.join(folder, 'lamina.png'))
    return sheet, panels


def main():
    args = sys.argv[1:]
    folder = args[0]
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    ref, cmp, write_ref = opt('--ref'), opt('--cmp'), opt('--write-ref')
    sheet, panels = compose(folder)
    out = {'motor': {}, 'referencia': {}, 'proporcion': {}}
    hists = {}
    for k, im in panels.items():
        m, h = measure(im)
        out['motor'][k] = m
        hists[k] = h
    refm = None
    if ref:
        R = Image.open(ref).convert('RGB').resize((W, H), Image.LANCZOS)
        refm = {}
        for k, box in BOXES.items():
            m, h = measure(R.crop(box))
            m['hist_L'] = [round(float(v), 5) for v in h[0]]
            m['hist_ab'] = [round(float(v), 5) for v in h[1]]
            refm[k] = m
        if write_ref:
            with open(write_ref, 'w') as fh:
                json.dump({'fuente': 'lámina «UMBRAL · Mago de Sombras» (solo cifras; la imagen no se versiona)', 'recuadros': refm}, fh, indent=1, ensure_ascii=False)
        if cmp:
            c = Image.new('RGB', (W, H * 2 + 8), (0, 0, 0))
            c.paste(R, (0, 0))
            c.paste(sheet, (0, H + 8))
            c.convert('RGB').save(cmp, quality=90)
    elif os.path.exists('tests/judge/referencia_mago.json'):
        with open('tests/judge/referencia_mago.json') as fh:
            refm = json.load(fh)['recuadros']
    if refm:
        for k, m in out['motor'].items():
            r = refm[k]
            out['referencia'][k] = {q: r[q] for q in m}
            prop = {q: round(m[q] / r[q], 2) if r[q] else None for q in ('detail', 'fine', 'contrast', 'violet_pct')}
            hL, hab = hists[k]
            prop['palette'] = round(float(0.5 * np.minimum(hL, np.array(r['hist_L'])).sum() + 0.5 * np.minimum(hab, np.array(r['hist_ab'])).sum()), 3)
            out['proporcion'][k] = prop
    with open(os.path.join(folder, 'metricas.json'), 'w') as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    # tabla breve
    rows = ['| Recuadro | detail (m/r) | fine (m/r) | contraste (m/r) | violeta % (m/r) | paleta |', '|---|---|---|---|---|---|']
    for k, m in out['motor'].items():
        r = out['referencia'].get(k, {})
        p = out['proporcion'].get(k, {})
        f = lambda q: f"{m[q]} / {r.get(q, '–')}"
        rows.append(f"| {k} | {f('detail')} | {f('fine')} | {f('contrast')} | {f('violet_pct')} | {p.get('palette', '–')} |")
    print('\n'.join(rows))


if __name__ == '__main__':
    main()
