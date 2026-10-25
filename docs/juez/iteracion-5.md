# Iteración 5 — corrección de los defectos de la iteración 4

Cambios aplicados (ver `docs/juez/iteracion-4.md`, «Decisión para la iteración 5»):

- **Halo magenta**: el material de personajes sustituye los valores no finitos por negro y limita
  el color HDR antes del bloom. Comprobado con la misma escena antes y después.
- **Vigía**: al reiniciar se coloca en su puesto con su halo; ya no aparece en el suelo del atrio.
- **Agua del canal**: termina detrás de las secciones negras (tiras de agua solo en los huecos) y el
  reflejo del sol es más pequeño.
- **Destello del contraataque**: intensidad 0,16 (antes lavaba la galería).
- **Modelo lejano de Aren**: 126k → 100,6k triángulos.

Pruebas funcionales: 29/29. Errores de consola: 0.

## Puntuación

| Criterio | Peso | It. 4 | It. 5 | Motivo |
|---|---|---|---|---|
| Gráficos e iluminación | 25 % | 6,4 | **6,6** | Sin halo ni agua sobre el negro; 07 baja de L\* 38,6 a 28,8. Queda un defecto nuevo: recuadros claros detrás de la hierba del canal (16_vigia) |
| Animación | 20 % | 6,3 | **6,3** | Sin cambios |
| Control y sensación | 20 % | 7,3 | **7,3** | Sin cambios de mecánica |
| Diseño de nivel | 15 % | 7,0 | **7,0** | Sin cambios |
| Estética y legibilidad | 10 % | 6,5 | **6,8** | Δ ≥ 12 en 18 de 19 capturas (antes 16); Aren mide el 18,9 % del cuadro |
| Rendimiento y estabilidad | 10 % | 6,0 | **6,3** | Simulación 0,79 ms; menos llamadas en carrera (140 → 119 con sombras); el pase principal sigue en 406k–483k triángulos en galería, canal y taller |
| **Global** | | **6,6** | **6,7 / 10** | |

## Decisión para la iteración 6

1. Averiguar el origen de los recuadros de la hierba.
2. Bajar triángulos y llamadas: el nivel se dibuja entero aunque solo se vea una sala.
3. Intentar subir el detalle con juntas de sillería más marcadas.

## Métricas del motor

| Captura | L* medio | L* p5–p95 | Recorte % | Negro % | Héroe Δ borde | Enemigos Δ borde | Llamadas (principal / con sombras) | Triángulos (principal / con sombras) |
|---|---|---|---|---|---|---|---|---|
| 01_retrato | 24.8 | 5–64.5 | 0.22 | 0.34 | 17.5 | — | 61 / 119 | 549k / 1056k |
| 02_carrera | 23.5 | 0.5–78 | 0 | 21.57 | 15.9 | — | 97 / 155 | 320k / 560k |
| 03_salto | 23.1 | 0.5–77.4 | 0 | 25.62 | 13.4 | — | 109 / 167 | 346k / 586k |
| 04_galeria | 15.6 | 0.4–45.1 | 0.17 | 29.25 | 16.9 | 32.4 | 141 / 222 | 406k / 748k |
| 05_telegrafia | 14.4 | 0.4–42.6 | 0.2 | 28.52 | 19.9 | 46.7 | 168 / 247 | 483k / 824k |
| 06_parada | 30.4 | 17.4–54.3 | 0.26 | 0 | 12.6 | 15.9 | 172 / 251 | 483k / 824k |
| 07_contraataque | 28.8 | 10–66.7 | 1.27 | 0 | 8.2 | 6.3 | 173 / 252 | 483k / 824k |
| 08_borde | 28.4 | 3.5–79.6 | 0 | 1.81 | 12.7 | — | 101 / 202 | 456k / 800k |
| 09_desliz | 29.5 | 0.6–77.2 | 0.01 | 11.72 | 13.1 | — | 122 / 220 | 457k / 777k |
| 10_canal | 26.1 | 0.5–82.3 | 0.04 | 19.82 | 20.1 | — | 130 / 234 | 457k / 779k |
| 11_taller | 16.8 | 0.4–46.3 | 0.1 | 26.94 | 20.4 | — | 180 / 296 | 460k / 809k |
| 12_clavija | 22.7 | 4.8–59.5 | 1.26 | 1.75 | 16 | — | 108 / 224 | 718k / 1335k |
| 13_compuerta | 35.4 | 4.1–77.9 | 0.75 | 3.82 | 18.3 | — | 142 / 268 | 649k / 1264k |
| 14_terraza | 28.4 | 0.6–81.6 | 0.29 | 23.1 | 13.1 | 11.5 | 159 / 285 | 409k / 757k |
| 15_sello | 27 | 0.6–81.5 | 0.03 | 15.13 | 19.5 | — | 118 / 209 | 380k / 649k |
| 16_vigia | 28.2 | 0.6–81.2 | 0.01 | 15.02 | 21.2 | — | 134 / 251 | 457k / 779k |
| 17_carga | 18.8 | 0.6–58.7 | 0.06 | 30.09 | 17.8 | — | 124 / 241 | 378k / 722k |
| 18_cargada | 21 | 0.6–63.1 | 0.31 | 26.37 | 14 | — | 127 / 244 | 378k / 723k |
| 19_apuntado | 18 | 0.4–56.4 | 0.23 | 29.41 | 19.9 | — | 128 / 245 | 378k / 723k |

- Mediana de separación del héroe: **16.9**; capturas con Δ ≥ 12: **18/19**.
- Altura de Aren en pantalla (mediana): **18.9 %** del alto del cuadro (objetivo v2: 14–20 %).
- Mediana de separación de enemigos: **15.9** (5 mediciones).
- Simulación y animación en CPU: **0.79 ms** por paso de 1/60 s. Carga en el navegador sin cabeza:
  20.4 s (construcción del mundo 11.4 s). Triángulos: Aren 100.6k, saqueador 45.1k. Errores: 0.
- 12_clavija y 13_compuerta son planos cortos con el modelo fino de Aren (368k triángulos): el
  presupuesto se aplica a los encuadres de juego.

Métricas de estilo de las salas: iguales a la iteración 4 (black 30,9 · L\* 13,7 · p95 77,9 ·
contraste 23,8 · acentos 0,36 · tono 0,78 · detalle 4,3).
