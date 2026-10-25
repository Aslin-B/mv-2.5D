# Registro de activos (biblia §26.5)

Todos los activos se crean con código dentro del repositorio. Autor: proyecto Acueducto del Alba
(código escrito con asistencia de IA y revisado en el propio repositorio). Procedencia: creación
propia. Estado: aprobado para el prototipo. No hay archivos binarios de terceros que registrar.

| Identificador | Tipo | Fuente en el código | Notas |
|---|---|---|---|
| Aren Valdara (malla, esqueleto, materiales) | Personaje | `src/render/heroModel.js`, `humanoid.js`, `sdf.js`, `charMaterial.js` | Superficies implícitas poligonizadas; ~55k triángulos en juego, ~85k en planos cortos (cabeza, pelo y manos con dos niveles de detalle) |
| Aren hechicero (armadura de esmalte, máscara, capucha, focos de éter) | Personaje | `src/render/sorcererModel.js`, `sdf.js`, `charMaterial.js` | Sustituye al guerrero desde la iteración 4; ~126k triángulos en juego y ~368k en planos cortos (dos niveles de detalle por pieza) |
| Vigía de bronce | Personaje | `src/actors/sentinel.js` | Geometría primitiva de three.js (torno, anillos, aletas); ojo y halo emisivos |
| Saetas, saeta cargada, contraconjuro y orbes | Efectos | `src/actors/projectiles.js` | Textura de cápsula generada en lienzo, luces puntuales en reserva fija |
| Sello rúnico (bloques con glifo) | Mecanismo | `src/world/mechanisms.js` | Glifo dibujado en lienzo; diseño propio |
| Maquinaria arcana (tuberías, válvulas, depósitos de éter, manómetros, estantes, herramientas) | Geometría | `src/world/machinery.js` | Primitivas paramétricas |
| Secciones negras del plano de juego | Geometría | `src/render/sections.js` | Generadas a partir de las colisiones |
| Minimapa e interfaz de estado | Interfaz | `src/ui/hud.js`, `style.css` | Dibujado en lienzo a partir de las colisiones; sigilo SVG propio |
| Saqueador del acueducto y su lanza | Personaje | `src/render/marauderModel.js` | ~45k triángulos; clonado por instancia |
| Capa de tela | Simulación | `src/render/cloth.js` | Verlet con textura procedural (borde deshilachado en enemigos) |
| Animaciones | Animación procedural | `src/animation/*.js` | Poses clave, IK de pies y manos, sin captura de movimiento |
| Piedra sillar, losas, madera, roca, hiedra, hierba, estandartes | Texturas | `src/render/textures.js` | Generadas en lienzo al cargar |
| Arquitectura del acueducto | Geometría | `src/render/architecture.js`, `src/world/level01.js` | Kit modular paramétrico |
| Agua del canal y cascadas | Sombreadores | `src/render/water.js` | |
| Cielo, cordilleras, sol | Sombreadores y geometría | `src/render/environment.js` | |
| Partículas, estela de espada | Efectos | `src/render/particles.js`, `trail.js` | |
| Efectos de sonido, ambiente y motivo musical | Audio sintetizado | `src/audio/audio.js` | Osciladores y ruido filtrado en WebAudio |
| Iconos de la interfaz (vasos de vida, clavija) | SVG en línea | `src/ui/hud.js` | |
| Tipografía | Fuentes del sistema | `src/ui/style.css` | Palatino/Georgia y la fuente de sistema; no se incrustan fuentes |
| three.js 0.186.1 | Biblioteca | `node_modules/three` | MIT, ver `docs/CREDITOS.md` |
