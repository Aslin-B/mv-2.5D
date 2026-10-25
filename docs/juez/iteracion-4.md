# Iteración 4 — Aren hechicero, poderes a distancia y estilo anclado a las referencias

Primera iteración con el **juez v2** (`docs/CALIDAD.md`): misma rúbrica y pesos, pero la nota de
gráficos se contrasta con las métricas de estilo de seis capturas de referencia (solo cifras, en
`tests/judge/referencia.json`) y se añaden estándares de personaje y de jugabilidad.

## Cambios

**Protagonista.** Aren deja de ser un guerrero con espada y pasa a ser un hechicero acorazado
(`src/render/sorcererModel.js`): capucha carmesí, armadura de marfil esmaltado con filetes de
bronce, hombreras de placas, focos de éter cian en antebrazos, pecho y cinturón, y manto que cuelga
de la espalda. La silueta se diseñó para leerse en negro (capucha, hombreras y manto).

**Poderes (principios del género, sin copiar recursos).**

| Tecla | Poder |
|---|---|
| J | Saeta de éter; mantener para cargar una saeta pesada |
| Shift | Apuntado libre en 8 direcciones (Aren se planta) |
| K | Paso etéreo: esquiva con invulnerabilidad breve, en suelo y aire |
| L | Golpe de éter que desvía; tras un desvío, J lanza el contraconjuro |

**Mundo.** Secciones negras del terreno en el plano de juego (como masas de primer plano), minimapa,
gradación de color y exposición por sala, enfoque cruzado en el posproceso, vigía de bronce (enemigo
volador que dispara orbes) y sello rúnico que solo cede a las saetas.

## Métricas de estilo (cinco salas, mediana)

| Métrica | It. 3 (14 capturas del juez) | It. 4 | Mediana de las referencias | Objetivo |
|---|---|---|---|---|
| Negro % | 9,3 | 31,0 | 23,8 | 15–35 |
| L\* mediana | 23,9 | 13,7 | 17,9 | 12–24 |
| L\* p95 | 57,9 | 77,9 | 68,1 | 55–80 |
| Contraste | 15,2 | 23,8 | 19,7 | 15–25 |
| Acentos % | 0,07 | 0,36 | 0,15 | 0,1–2 |
| Unidad de tono | 0,98 | 0,78 | 0,64 | 0,5–0,85 |
| Detalle % | 2,8 | 4,1 | 6,3 | ≥ 5 |

La iteración 3 era una imagen gris y monocroma (unidad de tono 0,98, casi sin negros ni acentos).
La 4 entra en el objetivo en seis de siete métricas; el detalle sigue bajo.

## Hallazgos del juez

1. **Halo magenta alrededor de Aren** en algunas capturas. Se aisló quitando elementos uno a uno:
   no eran los sprites ni los focos, sino valores no finitos del material de personajes que el bloom
   esparcía.
2. **El vigía aparecía en el suelo del atrio** hasta que la cámara se acercaba: su modelo no se
   colocaba en su puesto al reiniciar.
3. **Agua por delante de las secciones negras**: el negro se volvía marrón y el reflejo del sol
   ocupaba media pantalla en el canal.
4. **Destello del contraataque** demasiado fuerte (07): lava la galería entera y Aren se queda en
   Δ 6,8.
5. Rendimiento: el pase principal llega a 180 llamadas y 718k triángulos (presupuesto 80–160 y
   150k–400k); Aren pesa 126k triángulos en su modelo lejano.

## Puntuación

| Criterio | Peso | It. 3 | It. 4 | Motivo |
|---|---|---|---|---|
| Gráficos e iluminación | 25 % | 6,2 | **6,4** | Seis de siete métricas en objetivo y masas negras como en las referencias; resta el halo magenta y el agua del canal |
| Animación | 20 % | 6,2 | **6,3** | Poses nuevas de lanzamiento, carga y apuntado; siguen siendo procedurales |
| Control y sensación | 20 % | 7,0 | **7,3** | Se cumplen todos los estándares de jugabilidad v2; 29/29 pruebas |
| Diseño de nivel | 15 % | 6,8 | **7,0** | El sello obliga a usar la saeta; el vigía cambia el ritmo del canal |
| Estética y legibilidad | 10 % | 6,0 | **6,5** | Personaje mucho más reconocible (Δ mediana 17,1, altura 16,7 %); el halo y el destello lo estropean en 3 capturas |
| Rendimiento y estabilidad | 10 % | 7,0 | **6,0** | Fuera de presupuesto en llamadas y triángulos; 0 errores de consola |
| **Global** | | **6,5** | **6,6 / 10** | |

## Decisión para la iteración 5

Corregir los cuatro defectos visuales (halo, vigía, agua, destello), aligerar el modelo lejano de
Aren y volver a medir. El detalle bajo se deja para después: depende de la textura de la piedra y de
la cantidad de maquinaria, no de un ajuste de luz.

## Métricas del motor

| Captura | L* medio | L* p5–p95 | Recorte % | Negro % | Héroe Δ borde | Enemigos Δ borde | Llamadas (principal / con sombras) | Triángulos (principal / con sombras) |
|---|---|---|---|---|---|---|---|---|
| 01_retrato | 24.8 | 5–64.2 | 0.22 | 0.34 | 17.1 | — | 61 / 140 | 549k / 1058k |
| 02_carrera | 23.6 | 0.5–78 | 0.01 | 21.58 | 15.7 | — | 119 / 198 | 347k / 614k |
| 03_salto | 23.2 | 0.5–77.4 | 0 | 25.67 | 13.7 | — | 131 / 210 | 373k / 640k |
| 04_galeria | 15.6 | 0.4–45.1 | 0.18 | 29.25 | 17.2 | 32.5 | 141 / 243 | 431k / 801k |
| 05_telegrafia | 14.4 | 0.4–42.5 | 0.2 | 28.52 | 19.9 | 46.8 | 168 / 247 | 508k / 875k |
| 06_parada | 30.4 | 17.4–54.3 | 0.25 | 0 | 12.4 | 15.9 | 172 / 251 | 508k / 875k |
| 07_contraataque | 38.6 | 23.7–69.5 | 1.34 | 0 | 6.8 | 5.3 | 173 / 252 | 508k / 875k |
| 08_borde | 37.6 | 16.4–80.3 | 0 | 0 | 10.5 | — | 100 / 201 | 481k / 850k |
| 09_desliz | 37.9 | 9.6–78.1 | 0.01 | 0 | 11.2 | — | 121 / 219 | 482k / 828k |
| 10_canal | 28.8 | 2.9–82.3 | 0.05 | 8.58 | 18.9 | — | 129 / 233 | 483k / 830k |
| 11_taller | 16.7 | 0.4–46.2 | 0.1 | 26.94 | 20.1 | — | 180 / 296 | 485k / 860k |
| 12_clavija | 22.7 | 4.8–59.3 | 1.26 | 1.75 | 16.2 | — | 108 / 224 | 718k / 1335k |
| 13_compuerta | 35.4 | 4.1–77.9 | 0.75 | 3.81 | 18.3 | — | 142 / 268 | 649k / 1264k |
| 14_terraza | 28.4 | 0.6–81.6 | 0.29 | 23.11 | 12.8 | 11.3 | 159 / 285 | 435k / 808k |
| 15_sello | 27 | 0.6–81.5 | 0.04 | 15.14 | 19 | — | 118 / 209 | 406k / 699k |
| 16_vigia | 29 | 0.6–81.3 | 0.01 | 13.93 | 21.1 | — | 133 / 250 | 483k / 830k |
| 17_carga | 18.8 | 0.6–58.7 | 0.06 | 30.09 | 18.1 | — | 124 / 241 | 404k / 773k |
| 18_cargada | 21.1 | 0.6–63.1 | 0.31 | 26.31 | 14.6 | — | 127 / 244 | 404k / 773k |
| 19_apuntado | 18 | 0.4–56.5 | 0.23 | 29.42 | 19.6 | — | 128 / 245 | 404k / 773k |

- Mediana de separación del héroe: **17.1** (iteración 3: 10.8); capturas con Δ ≥ 12: **16/19**.
- Mediana de separación de enemigos: **15.9** (5 mediciones).
- Simulación y animación en CPU: **1.19 ms** por paso de 1/60 s. Carga en el navegador sin cabeza:
  20.6 s (construcción del mundo 11.6 s). Errores de consola: 0.
