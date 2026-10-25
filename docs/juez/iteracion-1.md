# Iteración 1 — artefactos, legibilidad y agua

Cambios aplicados (ver `docs/juez/iteracion-0.md`, «Decisión para la iteración 1»): exclusión de
sprites y transparencias del pase de oclusión ambiental, luz de contorno por zona en personajes,
gambesón azul pizarra, estela corta y fina, destellos más contenidos, cascadas con lámina curvada y
vetas, cordilleras con luz rasante y cárcavas, cámara un 8–10 % más cerca y primer plano más
transparente al tapar a Aren. Pruebas funcionales: 21/21.

Comparación hecha sobre compilaciones fijas de cada iteración, con el mismo guion de capturas y la
misma métrica.

## Puntuación

| Criterio | Peso | It. 0 | It. 1 | Motivo |
|---|---|---|---|---|
| Gráficos e iluminación | 25 % | 4,5 | **5,5** | Desaparecen los recuadros oscuros (se levanta el tope); cascadas con vetas y espuma; montañas con volumen. Quedan masas lisas (pilar del canal), deslumbramiento en el lado del sol y un haz de luz que vela a Aren al rodar |
| Animación | 20 % | 5,5 | **5,7** | La estela ya es un arco fino que deja ver el golpe. La voltereta sigue apoyando la cabeza en el suelo (pivota sobre la cadera) |
| Control y sensación | 20 % | 7,0 | **7,0** | Sin cambios de control; 21/21 |
| Diseño de nivel | 15 % | 6,5 | **6,5** | Sin cambios. El juez detecta que el brillo del fragmento secreto se ve desde la galería por el corte lateral: el secreto no está oculto (defecto ya presente en la base) |
| Estética, originalidad y legibilidad | 10 % | 4,0 | **5,0** | Aren se separa por color (pizarra frente a ocre); en interiores la separación media sube de 8,0 a 9,3. Los saqueadores siguen fundiéndose (6,0–8,6) y el rostro conserva aspecto de maniquí |
| Rendimiento y estabilidad | 10 % | 6,0 | **6,0** | 0 errores, 1,0 ms de simulación; escena aún por encima del presupuesto |
| **Global** | | **5,6** | **6,0 / 10** | |

La mediana de separación del héroe no sube (10,3 → 10,0) porque en la captura del canal la cámara,
ahora más cerca, deja a Aren delante del arco oscuro en vez del cielo (32,6 → 13,2); en las siete
capturas de interior la media pasa de 8,0 a 9,3.

## Métricas

| Captura | L* medio | L* p5–p95 | Recorte % | Negro % | Héroe Δ borde | Enemigos Δ borde | Llamadas (principal / con sombras) | Triángulos (principal / con sombras) |
|---|---|---|---|---|---|---|---|---|
| 01_retrato | 25.9 | 9–45.1 | 0 | 0.07 | 14.2 | — | — / 135 | — / 515k |
| 02_carrera | 31.7 | 3.8–79.8 | 0 | 1.45 | 12.9 | — | — / 146 | — / 518k |
| 03_salto | 30.1 | 3.3–79.4 | 0 | 3.24 | 12 | — | — / 140 | — / 517k |
| 04_galeria | 17.3 | 3.4–42.9 | 0 | 3.81 | 6.8 | — | — / 183 | — / 659k |
| 05_telegrafia | 13.4 | 2.8–34 | 0 | 5.49 | 11.5 | 6.2 | — / 213 | — / 759k |
| 06_parada | 29.8 | 21–45.9 | 0 | 0 | 9.1 | 6 | — / 214 | — / 759k |
| 07_contraataque | 23.5 | 13.2–45.5 | 0 | 0 | 10 | 22.2 | — / 216 | — / 760k |
| 08_borde | 43.3 | 15.8–81.4 | 0 | 0 | 11.6 | — | — / 169 | — / 734k |
| 09_desliz | 39 | 12.6–75.7 | 0 | 0 | 15 | — | — / 161 | — / 711k |
| 10_canal | 39.1 | 12.8–81.3 | 0 | 0.04 | 13.2 | — | — / 173 | — / 713k |
| 11_taller | 12.2 | 2.5–26.3 | 0.11 | 7.57 | 9 | — | — / 213 | — / 740k |
| 12_clavija | 13.3 | 3.4–32.5 | 0 | 3.43 | 9.9 | — | — / 204 | — / 739k |
| 13_compuerta | 30.2 | 3.8–75.6 | 0 | 4 | 8.9 | — | — / 241 | — / 669k |
| 14_terraza | 35.4 | 3.5–82 | 0 | 2.95 | 10 | 8.6 | — / 226 | — / 693k |

- Mediana de separación del héroe (Δ L* en el borde de la silueta): **10.0**; capturas con Δ ≥ 12: **5/14**.
- Mediana de separación de enemigos: **6.2** (4 mediciones).
- Con el pase de sombras: 135–241 llamadas; 515k–760k triángulos.
- Simulación y animación en CPU: **1.02 ms** por paso de 1/60 s. Carga de la página en el navegador sin cabeza: 19.7 s (construcción del mundo 10.2 s).
- Triángulos de personajes: Aren 92.3k, saqueador 45.2k. Errores de consola: 0.

## Decisión para la iteración 2

1. Voltereta: girar alrededor del centro del cuerpo recogido (no de la cadera) y recoger más
   cabeza y piernas.
2. Haces de luz que se atenúan al cruzar por delante del plano de juego.
3. Saqueadores con identidad de amenaza: capucha y capa rojo sangre de buey sobre cueros oscuros.
4. Fachada de primer plano que oculta el nicho secreto hasta que Aren entra.
5. Superficies: churretes de suciedad en paredes y pilar del canal con pilastras, imposta y arco
   ciego; neblina del valle en dos capas.
6. Rostro: ojos menos expuestos (párpado inferior, esclerótica menos blanca), cabello en mechones
   finos, acolchado del gambesón más marcado; luz de retrato en los planos cortos.
7. Rendimiento: nivel de detalle para cabeza, pelo y manos (fino solo en planos cortos), cuerpo
   algo más ligero y fusión de piezas rígidas por hueso (de 49 a 24 mallas visibles en Aren).
