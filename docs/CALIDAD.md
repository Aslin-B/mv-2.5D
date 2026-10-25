# Juez de calidad del primer nivel

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
