# Compone mosaicos 2×2 de las capturas de una iteración (para revisión rápida).
import sys, os
from PIL import Image
it = sys.argv[1]
d = f'tests/output/judge/it{it}'
shots = sorted(f for f in os.listdir(d) if f[:2].isdigit() and f.endswith('.png'))
for i in range(0, len(shots), 4):
    m = Image.new('RGB', (1280, 720), (12, 13, 14))
    for k, f in enumerate(shots[i:i + 4]):
        im = Image.open(os.path.join(d, f)).convert('RGB').resize((640, 360), Image.LANCZOS)
        m.paste(im, ((k % 2) * 640, (k // 2) * 360))
    m.save(os.path.join(d, f'mosaico_{i // 4 + 1}.jpg'), quality=88)
print('ok')
