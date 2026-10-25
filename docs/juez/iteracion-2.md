# Iteración 2 — voltereta, amenaza roja, secreto oculto y rendimiento

Cambios aplicados (ver `docs/juez/iteracion-1.md`, «Decisión para la iteración 2»): voltereta que
gira alrededor del cuerpo recogido, haces de luz que se apagan al cruzar por delante del plano de
juego, saqueadores con capucha y capa rojo sangre de buey, fachada de primer plano que oculta el
nicho secreto, churretes de suciedad y pilar del canal con pilastras, imposta y arco ciego, dos
capas de neblina en el valle, ojos con párpado inferior, mechones finos, luz de retrato en planos
cortos, niveles de detalle para cabeza, pelo y manos, y fusión de piezas rígidas por hueso.
Pruebas funcionales: 21/21.

## Puntuación

| Criterio | Peso | It. 1 | It. 2 | Motivo |
|---|---|---|---|---|
| Gráficos e iluminación | 25 % | 5,5 | **6,0** | Pilar del canal con despiece y arco ciego; suciedad vertical que rompe las masas lisas; neblina que separa las capas del fondo; el haz ya no vela a Aren al rodar. Quedan el deslumbramiento al mirar al exterior desde la compuerta (13) y la pared de roca del atrio con placas demasiado grandes en primer plano (01) |
| Animación | 20 % | 5,7 | **6,2** | La voltereta se lee como tal: cuerpo recogido, cabeza metida y giro completo sin apoyar la cabeza (tira A3) |
| Control y sensación | 20 % | 7,0 | **7,0** | Sin cambios de control; 21/21 |
| Diseño de nivel | 15 % | 6,5 | **6,8** | El fragmento secreto ya no se ve desde la galería; el muro agrietado vuelve a ser un descubrimiento |
| Estética, originalidad y legibilidad | 10 % | 5,0 | **5,5** | El saqueador se reconoce por el tono rojo además de por la luminosidad; mediana del héroe 10,0 → 11,0. El juez detecta dos defectos nuevos en primer plano: el acolchado del pecho de Aren se lee como un busto y el destello de golpe convierte al saqueador en un maniquí pálido (07) |
| Rendimiento y estabilidad | 10 % | 6,0 | **7,0** | El pase principal entra en el presupuesto de la biblia (63–123 llamadas, antes 135–241 contando sombras); Aren baja de 92k a 55k triángulos en juego; 0,93 ms de simulación; 0 errores |
| **Global** | | **6,0** | **6,4 / 10** | |

Desde esta iteración el informe separa las llamadas del pase principal de las del pase de sombras;
en las iteraciones 0 y 1 solo se midió el total (columna «con sombras»).

## Métricas

| Captura | L* medio | L* p5–p95 | Recorte % | Negro % | Héroe Δ borde | Enemigos Δ borde | Llamadas (principal / con sombras) | Triángulos (principal / con sombras) |
|---|---|---|---|---|---|---|---|---|
| 01_retrato | 27 | 10.6–45.5 | 0 | 0.01 | 13 | — | 69 / 117 | 296k / 505k |
| 02_carrera | 31.7 | 3.8–79.8 | 0 | 1.6 | 12.8 | — | 69 / 118 | 267k / 445k |
| 03_salto | 30.1 | 3.2–79.4 | 0 | 3.38 | 12.2 | — | 63 / 112 | 266k / 444k |
| 04_galeria | 15.9 | 3.1–41.6 | 0 | 4.4 | 7.3 | — | 82 / 154 | 309k / 587k |
| 05_telegrafia | 12.2 | 2.7–28.5 | 0 | 6.67 | 11.1 | 7.3 | 114 / 184 | 410k / 688k |
| 06_parada | 28.9 | 20.6–42 | 0 | 0 | 8.4 | 6.6 | 115 / 185 | 410k / 688k |
| 07_contraataque | 22.4 | 13–41.2 | 0 | 0 | 9.7 | 16.7 | 117 / 187 | 410k / 688k |
| 08_borde | 43.3 | 16.5–81.4 | 0 | 0 | 11 | — | 67 / 140 | 384k / 663k |
| 09_desliz | 39.1 | 13–75.7 | 0 | 0 | 15.5 | — | 66 / 133 | 384k / 639k |
| 10_canal | 39.1 | 13.2–81.3 | 0 | 0.04 | 13.9 | — | 68 / 145 | 384k / 641k |
| 11_taller | 12.1 | 2.4–26.2 | 0.11 | 8.44 | 9 | — | 95 / 184 | 384k / 669k |
| 12_clavija | 15.8 | 4.2–38.2 | 0 | 1.92 | 10.5 | — | 96 / 185 | 416k / 731k |
| 13_compuerta | 31 | 4.1–75.6 | 0 | 3.88 | 11.2 | — | 123 / 222 | 346k / 660k |
| 14_terraza | 35.4 | 3.4–82 | 0 | 3.28 | 10 | 10.4 | 96 / 195 | 337k / 621k |

- Mediana de separación del héroe (Δ L* en el borde de la silueta): **11.0**; capturas con Δ ≥ 12: **5/14**.
- Mediana de separación de enemigos: **7.3** (4 mediciones).
- Pase principal de la escena: 63–123 llamadas de dibujo, 266k–416k triángulos (presupuesto de la biblia: 80–160 llamadas, 150k–400k triángulos).
- Con el pase de sombras: 112–222 llamadas; 444k–731k triángulos.
- Simulación y animación en CPU: **0.93 ms** por paso de 1/60 s. Carga de la página en el navegador sin cabeza: 19.7 s (construcción del mundo 9.9 s).
- Triángulos de personajes: Aren 54.5k (84.9k en planos cortos), saqueador 45.2k. Errores de consola: 0.

## Decisión para la iteración 3 (última)

1. Torso masculino bajo el gambesón: una sola placa de pecho, relleno bajo el pecho y cintura casi
   tan ancha como la cadera (afecta también al saqueador); cierre cruzado con alamares de cuero.
2. Cuello alto del mismo paño que tape el paso piel/tela; línea de pestañas y párpado superior
   algo más bajo para quitar la mirada de sorpresa.
3. Destello de golpe solo en el contorno (el interior conserva color y material) y más corto.
4. Destellos de aviso y de parada más pequeños, con rayos afilados en lugar de un disco.
5. Exposición adaptada al encuadre (media ponderada de cinco puntos a lo ancho de la vista) para
   no quemar el exterior visto desde la compuerta.
6. Roca del atrio con placas más pequeñas.
