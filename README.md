# Acueducto del Alba (proyecto 2.5D medieval)

Videojuego original de acción y exploración medieval 2.5D: personajes y escenarios 3D, movimiento y
colisiones en un plano 2D. Este repositorio contiene **el primer nivel jugable**, pensado para medir
la calidad gráfica, la animación y la sensación de control antes de ampliar el juego.

Aren es un **mago de sombras** (diseño a partir de la lámina «UMBRAL · Mago de Sombras»): rostro
descubierto con barba corta, melena oscura semirrecogida, abrigo largo de cuero carbón con bordado de
plata y forro violeta, hombreras de metal grabado y guantes sin dedos. Su combate es a distancia: un
dardo de sombra al pulsar y el **Eclipse de sombras** al mantener, que crece en cuatro fases (semilla,
condensación, eclipse y lanzamiento al soltar), con apuntado en ocho direcciones. Un golpe de éter
cuerpo a cuerpo desvía ataques y abre un contraconjuro.

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
| Moverse / apuntar arriba / deslizarse | A D W S o flechas | stick izquierdo |
| Saltar (mantener para más altura) | Espacio | A |
| Dardo de sombra (pulsar) · Eclipse de sombras (mantener 0,3 / 1,5 / 3 s y soltar) | J | X |
| Apuntado libre en 8 direcciones (plantado) | Shift + dirección | gatillos |
| Paso etéreo (impulso invulnerable, también en el aire) | K | B |
| Golpe de éter (desvía estocadas y orbes) | L | LB |
| Contraconjuro tras un desvío | J | X |
| Interactuar / usar herramienta | E / Q | Y / RB |
| Pausa / silencio / depuración | Esc / M / F3 | Start / — / — |

Parámetros de URL: `?q=alto|medio|bajo` (perfil gráfico), `?autostart=1`, `?cine=0`.

## Contenido del nivel

Cinco salas conectadas: atrio de llegada, galería de servicio, pasarela del canal, taller del
maestro y terraza de descarga. Incluye un sello rúnico que solo cede a las saetas (primera lección
de disparo), saqueadores con lanza que telegrafían su estocada, un vigía de bronce volador que
lanza orbes (se esquivan o se devuelven con el golpe de éter), un muro agrietado con un fragmento
de vida oculto, la clavija de forja (Aren la coge, la guarda en la bolsa y la encaja y gira en la
cerradura de la compuerta), dos fuentes de descanso, minimapa y un cierre con estadísticas. La
maquinaria arcana del acueducto (tuberías de bronce, depósitos de éter, manómetros rúnicos,
engranajes que giran, polipasto y planos del maestro) da a los interiores densidad de detalle, y al
fondo se ven cordilleras de roca pintada, ruinas góticas en la bruma y bandadas de pájaros.

## Pruebas y juez de calidad

```bash
npm test                               # 30 pruebas funcionales deterministas (Chromium sin cabeza)
node tests/judge/capture.mjs <n>       # capturas reales, tiras de animación y métricas
node tests/judge/summary.mjs <n>       # tabla de métricas
node tests/judge/preview.mjs <dir> x,y,pasos,nombre ...   # capturas rápidas por sala
python3 tests/judge/style.py <dir>     # métricas de estilo frente a tests/judge/referencia.json
node tests/judge/sheet.mjs <dir>       # lámina del personaje en el estudio y sus métricas (juez v3)
```

La rúbrica y los topes automáticos están en [`docs/CALIDAD.md`](docs/CALIDAD.md); los informes de
cada iteración, en [`docs/juez/`](docs/juez/). Desde la iteración 4 el juez (v2) compara además el
estilo de cada sala con las medianas de un conjunto de capturas de referencia del género
(solo cifras derivadas; las imágenes no se guardan en el repositorio).

Estado tras la iteración 6: **6,9 / 10** (10 = acabado de la referencia). Seis de siete métricas de
estilo en objetivo; la que falta es el detalle por sala. Ver
[`docs/juez/iteracion-6.md`](docs/juez/iteracion-6.md).

Desde la iteración 7 el juez (v3) compara además al mago con la lámina de la usuaria, recuadro a
recuadro (la lámina tampoco se guarda en el repositorio). Estado tras la iteración 15: **5,0 / 10**
frente a la lámina; el detalle mediano por sala sube de 4,0 a 4,4 (objetivo 5–12). Ver
[`docs/juez/iteracion-12.md`](docs/juez/iteracion-12.md).

## Estructura

```
src/core        entrada, matemáticas, ruido, geometría 2D
src/physics2d   colisiones en el plano de juego
src/actors      Aren (controlador), saqueador y vigía (IA), proyectiles y eclipse
src/animation   poses clave, IK y animador procedural
src/render      personajes SDF, materiales, agua, cielo, partículas, cámara, secciones, posproceso
src/world       nivel 1, mecanismos y maquinaria arcana
src/audio       sonido sintetizado
src/ui          HUD y menús
tests           arnés, pruebas funcionales y juez
```

Todo el contenido es original y generado por código; ver [`docs/CREDITOS.md`](docs/CREDITOS.md) y
[`docs/REGISTRO_ACTIVOS.md`](docs/REGISTRO_ACTIVOS.md).
