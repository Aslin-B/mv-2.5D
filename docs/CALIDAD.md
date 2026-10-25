# Juez de calidad del primer nivel

> **Versión 3 (desde la iteración 7): juez estricto del personaje frente a la lámina «Mago de
> Sombras».** La usuaria entregó una lámina pintada (rostro, cuerpo de 3/4, espalda y las cuatro
> fases del poder) y pidió compararla una y otra vez hasta alcanzar su detalle y realismo. El juez v3
> compone una **lámina del motor** con la misma composición y la mide recuadro a recuadro. La
> lámina de referencia **no** se guarda en el repositorio: solo sus cifras, en
> [`tests/judge/referencia_mago.json`](../tests/judge/referencia_mago.json). Las comparaciones lado a
> lado se guardan fuera del repositorio.
>
> Estado tras la iteración 15: **5,0 / 10** frente a la lámina (era 4,7 en la iteración 11). Las
> iteraciones 12–15 también miden el escenario (mediana de `detail` por sala 4,0 → 4,4, objetivo 5–12),
> la tela en movimiento y el uso de herramientas. Ver
> [`juez/iteracion-7.md`](juez/iteracion-7.md) (rondas 7–11) y
> [`juez/iteracion-12.md`](juez/iteracion-12.md) (rondas 12–15).

## v3 · Evidencias

- `node tests/judge/sheet.mjs <carpeta> [--ref <lámina>]` captura en el estudio del personaje
  (`studio.html`: mismo modelo, animador, tela, poder y posproceso que el juego) los siete encuadres
  de la lámina, cada uno al tamaño de su recuadro (los pequeños con supermuestreo ×2), y los compone
  en `lamina.png` (1536×1024) con `tests/judge/sheet.py`.
- `python3 tests/judge/sheet.py <carpeta> --ref <lámina> --cmp <salida.jpg>` añade la comparación
  lado a lado (fuera del repositorio).
- Primeros planos de la cabeza sin pelo (frente, perfil y 3/4) en `head.html`, para juzgar la forma
  sin que el cabello la tape.
- En el juego: la secuencia de carga (semilla, condensación, eclipse, lanzamiento) con el harness de
  pruebas, para comprobar que lo que mejora en el estudio se ve igual jugando.

## v3 · Métricas por recuadro (CIE L\*a\*b\*)

| Métrica | Qué mide |
|---|---|
| `detail` | % de píxeles con gradiente de L\* > 12: bordes y relieves legibles |
| `fine` | media de \|laplaciano de L\*\|: textura fina (poros, hebras, cuero, bordados) |
| `contrast` | desviación típica de L\* |
| `violet_pct` | % de píxeles violetas (tono 255–320°, saturación > 0,25, valor > 0,2) |
| `palette` | intersección de histogramas L\* y a\*b\* con el recuadro de la referencia (1 = misma paleta) |

Las cifras orientan; no puntúan solas. El fondo pintado de la lámina (ruinas y bruma) suma detalle
que el plató neutro del estudio no tiene, así que `detail` nunca se compara al pie de la letra.

## v3 · Rúbrica del personaje (10 = la lámina)

| Criterio | Peso | Qué se mira |
|---|---|---|
| Rostro y cabello | 25 % | forma de la cabeza y del rostro en frente, perfil y 3/4; ojos, párpados, barba; piel; melena |
| Vestuario | 25 % | silueta del abrigo, capas (cuello, solapas, capucha, chaleco), materiales, botas y metal |
| Manos y gestos | 15 % | manos legibles, guante sin dedos, gesto de sostener, ofrecer, contener y lanzar |
| Poder | 15 % | núcleo negro, corona, humo, crecimiento por fases y lanzamiento con estela |
| Poses y naturalidad | 20 % | equilibrio, contrapposto, zancada de carga, inclinación del torso, tela que responde |

Anclas: **10** = la lámina; **7** = personaje de juego de acción actual en planos cortos; **5** =
lectura correcta de todo el diseño con acabado claramente sintético; **3** = maniquí con el diseño
reconocible; **1** = no se reconoce el diseño.

Topes: rostro sin párpados, iris o barba → Rostro ≤ 3; abrigo que no llega a la caña o cerrado por
delante → Vestuario ≤ 4; fases sin zancada (pies a menos de 0,5 m) → Poses ≤ 4; esfera más violeta
que negra (`violet_pct` del eclipse > 4 veces el de la lámina) → Poder ≤ 6.

## v3 · Límite declarado

La lámina es una ilustración pintada. Con personajes generados por código (superficies implícitas,
pintura por vértice, sin escaneos, texturas pintadas a mano ni render fuera de línea) el techo
realista está por debajo de esa referencia, sobre todo en el rostro. Cada informe dice la distancia
que queda en cada criterio y qué la cerraría.

---


> **Versión 2 (desde la iteración 4): estándar alto anclado a referencias.** La usuaria pidió acercar
> el juego al estilo gráfico de un conjunto de capturas de Metroid Dread, convertir a Aren en un
> hechicero con poderes a distancia y fijar patrones de calidad altos. El juez v2 conserva la rúbrica
> y las evidencias de la v1 (más abajo) y añade tres cosas: métricas de estilo comparadas con las
> referencias, estándares del personaje y de la jugabilidad, y un ciclo sin límite fijo de
> iteraciones. Las imágenes de referencia **no** se guardan en el repositorio; solo sus cifras
> derivadas en [`tests/judge/referencia.json`](../tests/judge/referencia.json).

## v2 · Métricas de estilo frente a las referencias

`python3 tests/judge/style.py <carpeta>` mide cada captura (640 px de ancho, sin las esquinas de la
interfaz) en CIE L\*a\*b\*:

| Métrica | Qué mide | Mediana de las referencias | Rango de las referencias | Objetivo |
|---|---|---|---|---|
| `black_pct` | % de negro (L\* < 6): masas de primer plano y sección del terreno | 23,8 | 2,6–36,5 | 15–35 |
| `l_p50` | luminosidad mediana | 17,9 | 10,8–28,2 | 12–24 |
| `l_p95` | altas luces | 68,1 | 39–81,5 | 55–80 |
| `contrast` | desviación típica de L\* | 19,7 | 13,9–24,4 | 15–25 |
| `accent_pct` | % de acentos luminosos saturados (HSV: saturación > 0,55 y valor > 0,7) | 0,15 | 0–1,79 | 0,1–2 |
| `hue_unity` | fracción de píxeles con color a ±35° del tono dominante | 0,64 | 0,26–1 | 0,5–0,85 |
| `detail` | % de píxeles con gradiente de L\* > 12 (riqueza de detalle) | 6,25 | 3,5–11,9 | ≥ 5 |

El acento se mide en HSV y no con el croma Lab porque un cian puro no supera C\* 50 en sRGB: con un
umbral de croma Lab los acentos cian (el color de Aren) nunca contarían y los naranjas sí.

Las cinco salas se capturan con `tests/judge/preview.mjs` en el centro de cada una (perfil alto,
1280×720) y se compara la **mediana de las cinco** con el objetivo.

## v2 · Estándares del personaje

- Altura de Aren en pantalla entre el 14 y el 20 % del alto del cuadro en juego (lectura a
  distancia, como en las referencias).
- Separación del contorno (Δ L\* del borde frente al fondo, ver la v1) ≥ 12 en todas las capturas
  de juego.
- Tono propio frente a la sala: el carmesí de la capucha y el marfil de la armadura no se confunden
  con el tono dominante de ningún escenario; los acentos de Aren son cian y los hostiles, magenta o
  rojizos.
- Silueta reconocible en negro: capucha, hombreras, manto y focos se distinguen sin color.

## v2 · Estándares de jugabilidad (principios del género, sin copiar recursos)

- Ataque principal a distancia con apuntado en 8 direcciones y una versión cargada.
- Esquiva con invulnerabilidad breve, en suelo y en el aire.
- Defensa activa con recompensa: el desvío cuerpo a cuerpo abre un contraataque fuerte.
- Barreras que se abren con una habilidad concreta (el sello rúnico solo cede a las saetas).
- Enemigos con aviso legible ≥ 0,5 s antes de cada ataque y al menos uno que ataque a distancia.
- Minimapa con la sala actual y la posición de Aren; vida y energía siempre visibles.
- Todo verificado por pruebas funcionales deterministas.

## v2 · Anclas y topes adicionales

Las anclas no cambian (10 = el acabado de las referencias). Topes nuevos:

- Mediana de las salas fuera del **rango** de las referencias en una métrica de luz (`black_pct`,
  `l_p50`, `l_p95`, `contrast`) → Gráficos ≤ 6.
- Más de dos métricas de estilo fuera del **objetivo** → Gráficos ≤ 6,5.
- Héroe por debajo del 12 % del alto del cuadro → Estética y legibilidad ≤ 6.
- Falta alguno de los estándares de jugabilidad → Control ≤ 6,5.

## v2 · Ciclo

Sin límite fijo de iteraciones: se itera mientras alguna métrica quede fuera del objetivo o la nota
ponderada suba al menos 0,2 por iteración. Cuando una carencia ya no se puede cerrar con la ruta
técnica actual (por ejemplo, arte modelado a mano o animación capturada), el informe lo dice y se
detiene esa línea.

---

# Versión 1 (iteraciones 0–3)

Este documento fija cómo se evalúa el nivel «Acueducto del Alba» antes de cada entrega. La
evaluación combina **evidencias reales del motor** (capturas a 1280×720 en perfil alto, tiras de
animación y un vídeo grabado cuadro a cuadro) con **métricas objetivas** calculadas sobre esas mismas
imágenes y con las **pruebas funcionales** automáticas. La puntuación visual la emite el revisor
(en esta fase, Claude) siguiendo las anclas de abajo; no es una opinión de jugadores ni una prueba
con público.

## Cómo se obtienen las evidencias

```bash
npm run dev                         # servidor local en :5173
npm test                            # 21 pruebas funcionales deterministas
node tests/judge/capture.mjs <n>    # capturas, tiras de animación y métricas → tests/output/judge/it<n>/
node tests/judge/capture.mjs <n> --video   # además, vídeo del motor (motor.mp4)
node tests/judge/summary.mjs <n>    # tabla de métricas en Markdown
```

Las capturas se toman con el juego real en Chromium sin cabeza. El renderizado es por software
(SwiftShader): la imagen es la misma que en una GPU, pero los tiempos de GPU **no** son medibles en
este entorno y no se informan.

### Momentos capturados

| ID | Momento | Qué se mira |
|---|---|---|
| 01 | Plano de presentación del rostro | V01 rostro, V09 materiales |
| 02 | Carrera en el atrio | contacto de pies, primer plano, luz exterior |
| 03 | Salto | silueta en el aire |
| 04 | Galería con haces | iluminación interior, legibilidad |
| 05–07 | Telegrafía, parada y contraataque | lectura del peligro, impacto |
| 08–09 | Agarre de borde y deslizamiento | lectura de habilidades de movimiento |
| 10 | Canal | agua, cascadas, profundidad atmosférica |
| 11 | Taller | luz local cálida |
| 12–13 | Clavija y compuerta | planos cinematográficos de progresión |
| 14 | Terraza final | vista y amenaza en pantalla |
| A1–A5 | Tiras: carrera, combo, voltereta, subida, giro de 180° | V03, V04, V05, V06 |

### Métricas objetivas

- **Separación de silueta (Δ L\*)**: se renderiza una máscara del personaje (a 320×180) y, para
  cada píxel del contorno interior, se toma la diferencia absoluta de luminosidad CIE L\* frente a
  la media de los píxeles de fondo de su vecindario 5×5; Δ es la media sobre todo el contorno.
  Δ ≥ 12 se considera legible; Δ < 6 es una silueta que se pierde en el fondo. Se mide para Aren y
  para los enemigos visibles (biblia V08).
- **Exposición**: L\* media, percentiles 5 y 95, porcentaje de píxeles recortados (≥ 250) y de
  negro aplastado (L\* < 3).
- **Coste**: llamadas de dibujo y triángulos de la escena (incluido el pase de sombras), tiempo de
  simulación y animación en CPU por paso, triángulos por personaje y tiempo de construcción.
- **Estabilidad**: pruebas funcionales superadas y errores de consola.

## Rúbrica

Cada criterio se puntúa de 0 a 10. La nota global es la media ponderada.

| Criterio | Peso | Qué incluye |
|---|---|---|
| Gráficos e iluminación | 25 % | luz cinematográfica (clave, relleno, recorte), materiales distinguibles, capas de profundidad, agua, ausencia de artefactos, exposición |
| Animación | 20 % | continuidad, apoyo de pies, anticipación y recuperación en ataques, giro, capa, transiciones |
| Control y sensación | 20 % | precisión (pruebas funcionales), margen de borde y memoria de entrada, impacto (pausa de golpe, sacudida, sonido), ventana de parada |
| Diseño de nivel | 15 % | secuencia de aprendizaje, ritmo, puntos de referencia, secreto, llave y barrera, puntos de control |
| Estética, originalidad y legibilidad | 10 % | personaje y rostro, coherencia de estilo, lectura de héroe y amenazas, interfaz |
| Rendimiento y estabilidad | 10 % | presupuestos de la biblia §11.4, errores, determinismo, tiempo de carga |

### Anclas (iguales para todos los criterios)

| Nota | Significado |
|---|---|
| 10 | Referencia comercial de gran presupuesto en 2.5D (el nivel de acabado de Metroid Dread) |
| 8 | Producción independiente de gama alta: coherente, pulida, con pocos defectos visibles |
| 6 | Prototipo vertical sólido: estilo reconocible, sin defectos graves, carencias claras de contenido o detalle |
| 4 | Prototipo funcional con defectos visibles que distraen |
| 2 | Bloqueo o geometría provisional |

### Topes automáticos

Para que la nota no dependa solo de la impresión del revisor, algunas métricas limitan el máximo:

- Artefactos de render visibles (recuadros, parpadeos, z-fighting) → Gráficos ≤ 5.
- Mediana de separación del héroe (contraste local en el borde) < 8 → Estética y legibilidad ≤ 5.
- Alguna prueba funcional fallida → Control ≤ 6.
- Errores de consola → Rendimiento ≤ 5.
- Escena por encima de 2× el presupuesto de llamadas de dibujo (320) → Rendimiento ≤ 6.

## Ciclo de perfeccionamiento

1. Iteración 0: evaluación de base.
2. Se eligen las mejoras con mayor efecto en la nota ponderada.
3. Se aplica la mejora, se repiten las pruebas funcionales y las capturas, y se puntúa de nuevo.
4. Como máximo tres iteraciones de mejora. Cada informe queda en `docs/juez/`.
