# Acueducto del Alba (proyecto 2.5D medieval)

Videojuego original de acción y exploración medieval 2.5D: personajes y escenarios 3D, movimiento y
colisiones en un plano 2D. Este repositorio contiene **el primer nivel jugable**, pensado para medir
la calidad gráfica, la animación y la sensación de control antes de ampliar el juego.

La especificación de diseño vive en la biblia del proyecto (`2.5D_Medieval_v1.md`, carpeta
compartida). Ruta técnica: **A, Three.js + WebGL2**, empaquetado como un único HTML para navegador
de escritorio.

## Jugar

```bash
npm install
npm run dev            # http://localhost:5173
npm run build:single   # dist-single/index.html: un solo archivo, sin red
```

| Acción | Teclado | Mando |
|---|---|---|
| Moverse / mirar arriba / agacharse | A D W S o flechas | stick izquierdo |
| Saltar (mantener para más altura) | Espacio | A |
| Correr | Shift | gatillos |
| Atacar (cadena de tres cortes) | J | X |
| Esquivar rodando | K | B |
| Parar justo antes del impacto | L | LB |
| Interactuar / usar herramienta | E / Q | Y / RB |
| Pausa / silencio / depuración | Esc / M / F3 | Start / — / — |

Parámetros de URL: `?q=alto|medio|bajo` (perfil gráfico), `?autostart=1`, `?cine=0`.

## Contenido del nivel

Cinco salas conectadas: atrio de llegada, galería de los arcos, pasarela del canal, taller del
maestro y terraza de descarga. Incluye un saqueador con lanza que telegrafía su estocada (se puede
esquivar, parar y contraatacar), un muro agrietado con un fragmento de vida oculto, la clavija de
forja (herramienta que abre la compuerta de bronce), dos fuentes de descanso y un cierre con
estadísticas.

## Pruebas y juez de calidad

```bash
npm test                               # 21 pruebas funcionales deterministas (Chromium sin cabeza)
node tests/judge/capture.mjs <n>       # capturas reales, tiras de animación y métricas
node tests/judge/summary.mjs <n>       # tabla de métricas
```

La rúbrica y los topes automáticos están en [`docs/CALIDAD.md`](docs/CALIDAD.md); los informes de
cada iteración, en [`docs/juez/`](docs/juez/).

## Estructura

```
src/core        entrada, matemáticas, ruido, geometría 2D
src/physics2d   colisiones en el plano de juego
src/actors      Aren (controlador) y saqueador (IA)
src/animation   poses clave, IK y animador procedural
src/render      personajes SDF, materiales, agua, cielo, partículas, cámara, posproceso
src/world       nivel 1 y mecanismos
src/audio       sonido sintetizado
src/ui          HUD y menús
tests           arnés, pruebas funcionales y juez
```

Todo el contenido es original y generado por código; ver [`docs/CREDITOS.md`](docs/CREDITOS.md) y
[`docs/REGISTRO_ACTIVOS.md`](docs/REGISTRO_ACTIVOS.md).
