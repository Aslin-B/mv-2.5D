# Iteración 3 (última) — figura de Aren, impacto legible y exposición

Cambios aplicados (ver `docs/juez/iteracion-2.md`, «Decisión para la iteración 3»):

- Torso: una sola placa de pecho, relleno bajo el pecho y cintura casi tan ancha como la cadera.
  Se aplica al cuerpo base, así que corrige también al saqueador. Cierre cruzado del gambesón con
  costura y alamares de cuero.
- Cuello alto del mismo paño que el gambesón (antes era de otro color y dejaba ver un borde
  dentado entre piel y tela); párpado superior más bajo, línea de pestañas y esclerótica menos
  blanca.
- Destello de golpe del saqueador: solo en el contorno y un 30 % más corto. El juez comprobó con
  una prueba aislada (misma escena con y sin destello) que era el destello, y no la luz de relleno,
  lo que lo volvía un maniquí pálido.
- Destellos de aviso y de parada más pequeños, con rayos afilados en lugar de un disco.
- Exposición: media ponderada de cinco puntos a lo ancho del encuadre en lugar de un solo punto.
- Roca del atrio con placas más pequeñas.

Pruebas funcionales: 21/21. Errores de consola: 0.

## Puntuación

| Criterio | Peso | It. 0 | It. 1 | It. 2 | It. 3 | Motivo de la última nota |
|---|---|---|---|---|---|---|
| Gráficos e iluminación | 25 % | 4,5 | 5,5 | 6,0 | **6,2** | Destellos que ya no tapan el golpe (07). El deslumbramiento al mirar al exterior desde la compuerta apenas baja (p95 75,6 → 74,8): la media por encuadre no basta; haría falta exposición automática medida sobre la imagen |
| Animación | 20 % | 5,5 | 5,7 | 6,2 | **6,2** | Sin cambios de animación en esta iteración |
| Control y sensación | 20 % | 7,0 | 7,0 | 7,0 | **7,0** | 21/21; el impacto sobre el saqueador se lee sin perder su silueta |
| Diseño de nivel | 15 % | 6,5 | 6,5 | 6,8 | **6,8** | Sin cambios |
| Estética, originalidad y legibilidad | 10 % | 4,0 | 5,0 | 5,5 | **6,0** | El pecho de Aren ya se lee como un gambesón acolchado de hombre; cuello y ojos más limpios en el retrato; el saqueador conserva capucha roja y cueros oscuros al recibir el golpe (separación 16,7 → 9,6: ya no es un maniquí claro sobre fondo oscuro). El rostro sigue siendo estilizado, lejos de un personaje comercial |
| Rendimiento y estabilidad | 10 % | 6,0 | 6,0 | 7,0 | **7,0** | Pase principal 63–125 llamadas (en presupuesto); 0 errores. El tiempo de simulación (1,20 ms frente a 0,93 ms) se midió con otra prueba del navegador en paralelo y no indica una regresión |
| **Global** | | **5,6** | **6,0** | **6,4** | **6,5 / 10** | |

## Métricas

| Captura | L* medio | L* p5–p95 | Recorte % | Negro % | Héroe Δ borde | Enemigos Δ borde | Llamadas (principal / con sombras) | Triángulos (principal / con sombras) |
|---|---|---|---|---|---|---|---|---|
| 01_retrato | 27.1 | 10.5–46 | 0 | 0.01 | 12.5 | — | 71 / 119 | 296k / 505k |
| 02_carrera | 31.7 | 3.8–79.8 | 0 | 1.6 | 12.8 | — | 69 / 118 | 266k / 445k |
| 03_salto | 30.1 | 3.2–79.4 | 0 | 3.38 | 12.2 | — | 63 / 112 | 266k / 444k |
| 04_galeria | 15.9 | 3.1–41.5 | 0 | 4.41 | 7.2 | — | 82 / 154 | 308k / 587k |
| 05_telegrafia | 12.2 | 2.7–28.4 | 0 | 6.68 | 11 | 7.4 | 114 / 184 | 410k / 688k |
| 06_parada | 28.8 | 20.6–41.3 | 0 | 0 | 8.5 | 6.5 | 115 / 185 | 410k / 688k |
| 07_contraataque | 21.8 | 13–37.3 | 0 | 0 | 7.3 | 9.6 | 117 / 187 | 410k / 688k |
| 08_borde | 43.3 | 16.5–81.4 | 0 | 0 | 11.1 | — | 67 / 140 | 384k / 662k |
| 09_desliz | 39.1 | 13–75.7 | 0 | 0 | 15.8 | — | 66 / 133 | 384k / 639k |
| 10_canal | 39.6 | 13.6–81.6 | 0 | 0.03 | 14 | — | 68 / 145 | 384k / 641k |
| 11_taller | 12.6 | 2.6–26.7 | 0.11 | 7.29 | 8.9 | — | 95 / 184 | 383k / 668k |
| 12_clavija | 15.8 | 4.2–38.2 | 0 | 1.92 | 10.8 | — | 98 / 187 | 416k / 731k |
| 13_compuerta | 31.3 | 5.2–74.8 | 0 | 3.49 | 10.7 | — | 125 / 224 | 346k / 660k |
| 14_terraza | 36.5 | 3.7–82.7 | 0 | 2.65 | 9.9 | 10.9 | 96 / 195 | 337k / 621k |

- Mediana de separación del héroe (Δ L* en el borde de la silueta): **10.8**; capturas con Δ ≥ 12: **5/14**.
- Mediana de separación de enemigos: **7.4** (4 mediciones).
- Pase principal de la escena: 63–125 llamadas de dibujo, 266k–416k triángulos (presupuesto de la biblia: 80–160 llamadas, 150k–400k triángulos).
- Con el pase de sombras: 112–224 llamadas; 444k–731k triángulos.
- Simulación y animación en CPU: **1.20 ms** por paso de 1/60 s (medido con carga paralela). Carga de la página en el navegador sin cabeza: 18.5 s (construcción del mundo 9.7 s).
- Triángulos de personajes: Aren 54.5k (84.9k en planos cortos), saqueador 45.1k. Errores de consola: 0.

## Balance del ciclo

La nota global sube de 5,6 a 6,5 en tres iteraciones. En la escala del juez eso es un «prototipo
vertical sólido»: estilo reconocible y sin defectos graves, pero todavía lejos del 10 que
representa el acabado de Metroid Dread. Lo que más separa este nivel de esa referencia:

1. **Personajes**: modelados con campos de distancia y vértices pintados, sin escultura ni texturas
   de alta resolución ni captura de movimiento. El rostro y las manos son lo que más lo delata.
2. **Iluminación**: exposición por zonas en lugar de exposición automática medida sobre la imagen;
   sin iluminación global precalculada.
3. **Contenido**: un solo enemigo, una habilidad y cinco salas. Dread tiene decenas de enemigos,
   jefes y un mapa entero diseñado alrededor de sus habilidades.
4. **Medición**: las capturas usan render por software, así que no hay cifras de FPS en GPU real.
   Hay que comprobarlo en un equipo de escritorio con `F3`.

Siguientes pasos con más efecto en la nota: exposición automática con histograma, un segundo
enemigo con otro patrón de ataque, rostro esculpido a mano (o con mapa de normales horneado) y
pruebas de FPS en hardware real.
