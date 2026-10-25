# Iteración 0 — evaluación de base

Evidencias: 14 capturas y 5 tiras de animación del motor real (perfil alto, 1280×720), 21/21
pruebas funcionales superadas. Capturas seleccionadas en `docs/juez/img/it0_*.jpg`.

## Puntuación

| Criterio | Peso | Nota | Motivo principal |
|---|---|---|---|
| Gráficos e iluminación | 25 % | **4,5** (tope 5) | Buena base de luz (haces en la galería, contraluz en el canal), pero partículas y destellos dibujaban **recuadros oscuros** con la oclusión ambiental; cascadas como tarjetas blancas planas; montañas como recortes de papel |
| Animación | 20 % | **5,5** | Locomoción continua y apoyo de pies correcto; la estela de la espada era un abanico opaco que tapaba el golpe; la voltereta se pierde en la oscuridad |
| Control y sensación | 20 % | **7,0** | 21/21 pruebas (salto variable, margen de borde, memoria de entrada, agarre, deslizamiento, parada y contraataque); pausa de golpe y sacudida presentes |
| Diseño de nivel | 15 % | **6,5** | Cinco salas con secuencia de aprendizaje, secreto tras muro, llave y compuerta, dos fuentes de descanso; recorrido corto |
| Estética, originalidad y legibilidad | 10 % | **4,0** | Separación del héroe: mediana 10,3 y solo 4/14 capturas ≥ 12; en interiores baja a 4–8 y el saqueador se queda en 5–8: ambos se funden con la piedra cálida. Gambesón pardo casi del tono de la piel; rostro de aspecto de maniquí en el plano corto; columnas de primer plano tapan al héroe |
| Rendimiento y estabilidad | 10 % | **6,0** | 0 errores, 1,1 ms de simulación por paso; escena por encima del presupuesto (135–241 llamadas, 470k–717k triángulos con sombras); Aren 92k triángulos frente a 25–40k previstos |
| **Global** | | **5,6 / 10** | |

## Métricas

Separación de silueta medida como contraste local en el borde (ver `docs/CALIDAD.md`). La compilación de base no registraba aún el pase principal por separado.

| Captura | L* medio | L* p5–p95 | Recorte % | Negro % | Héroe Δ borde | Enemigos Δ borde | Llamadas (principal / con sombras) | Triángulos (principal / con sombras) |
|---|---|---|---|---|---|---|---|---|
| 01_retrato | 26.2 | 9.4–45 | 0 | 0.1 | 13.7 | — | — / 135 | — / 471k |
| 02_carrera | 31.1 | 3.1–80 | 0 | 3.99 | 11.7 | — | — / 149 | — / 474k |
| 03_salto | 31.2 | 2.8–79.7 | 0 | 5.98 | 13.9 | — | — / 145 | — / 474k |
| 04_galeria | 17.9 | 3–50 | 0 | 4.86 | 4.3 | — | — / 183 | — / 616k |
| 05_telegrafia | 14 | 2.6–45 | 0 | 7.87 | 10.3 | 5.4 | — / 213 | — / 716k |
| 06_parada | 30.2 | 20.6–54.7 | 0 | 0 | 8.8 | 5.8 | — / 214 | — / 716k |
| 07_contraataque | 22.7 | 12.8–41.3 | 0 | 0 | 11.8 | 34 | — / 218 | — / 717k |
| 08_borde | 44 | 17–81.6 | 0 | 0 | 11.9 | — | — / 169 | — / 690k |
| 09_desliz | 39.6 | 13.4–76.5 | 0 | 0 | 15.3 | — | — / 161 | — / 667k |
| 10_canal | 39.7 | 14–81.5 | 0 | 0.01 | 32.6 | — | — / 173 | — / 669k |
| 11_taller | 11.2 | 2.3–24.4 | 0.03 | 10.86 | 8.4 | — | — / 213 | — / 697k |
| 12_clavija | 12.9 | 3.2–30.7 | 0 | 3.82 | 6.4 | — | — / 204 | — / 696k |
| 13_compuerta | 29.8 | 3.7–75.6 | 0 | 4.01 | 6.1 | — | — / 241 | — / 626k |
| 14_terraza | 35.8 | 3.2–82.1 | 0 | 3.7 | 9.5 | 8.2 | — / 230 | — / 650k |

- Mediana de separación del héroe (Δ L* en el borde de la silueta): **10.3**; capturas con Δ ≥ 12: **4/14**.
- Mediana de separación de enemigos: **5.8** (4 mediciones).
- Con el pase de sombras: 135–241 llamadas; 471k–717k triángulos.
- Simulación y animación en CPU: **1.60 ms** por paso de 1/60 s. Carga de la página en el navegador sin cabeza: 18.8 s (construcción del mundo 10.1 s).
- Triángulos de personajes: Aren 92.3k, saqueador 45.2k. Errores de consola: 0.

## Decisión para la iteración 1

Prioridad por efecto en la nota: eliminar artefactos (tope de Gráficos), recuperar la legibilidad
de personajes en interiores y corregir la estela. Cambios:

1. Excluir del pase de normales de la oclusión ambiental los sprites, tarjetas aditivas y objetos
   transparentes (origen de los recuadros oscuros).
2. Luz de contorno direccional en el material de personajes, con color e intensidad por zona
   (solar fuera, de antorcha dentro); contorno rojizo y apagado para los saqueadores.
3. Paleta del gambesón de Aren en azul pizarra para separarlo de la piedra cálida y de la piel.
4. Estela de espada limitada al tercio exterior de la hoja, más corta y translúcida.
5. Destello de impacto del enemigo menos intenso; destellos de parada y telegrafía más pequeños.
6. Cascadas con lámina curvada, vetas finas a varias velocidades, huecos y espuma.
7. Cordilleras con varias filas: luz rasante en laderas al sol, cárcavas y neblina en la base.
8. Cámara un 8–10 % más cerca y columnas de primer plano más transparentes al tapar al héroe.
