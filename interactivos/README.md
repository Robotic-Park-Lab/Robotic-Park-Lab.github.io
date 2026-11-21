# Publicaciones interactivas

Cada artículo puede tener una página propia que explica su contenido de forma interactiva:
mapa conceptual, fórmulas, simuladores, gráficas, autoevaluación y cita. Estas páginas forman
parte de los proyectos de innovación docente del laboratorio.

```
interactivos/
  lib/
    ip.css              Estilos comunes (paleta del laboratorio, modo claro/oscuro, componentes)
    ip.js               Librería de componentes (objeto global IP), sin dependencias
    scene3d.js          Visor 3D ligero en canvas (IP.Scene3D): cámara orbital, líneas, polígonos, drones
    formacion.js        Formaciones rígidas sobre superficies (objeto FORM): cuádricas, Algoritmo 1,
                        test de Delaunay, rango de J_R, proyección de Lagrange y simulador
    multiagente.js      Enjambres heterogéneos (objeto MA): control jerárquico por distancias,
                        consenso, muestreo periódico o por eventos y recuento de mensajes
    altitud.js          Control de altitud del Crazyflie con PID periódico o por eventos (objeto ALT)
  plantilla/            ← punto de partida para una página nueva
    index.html
    app.js
  altitud-eventos/        «Control basado en eventos mediante umbral relativo…» (JA, 2021)
  plataforma-vision/      «A ROS2 Vision Based Navigation Platform…» (IFAC ACE, 2022)
  consenso-gemelos/       «Formation by consensus … with Twins-in-the-loop» (ROBOT, 2022)
  calibracion-crazyflie/  «Indirect Method for Calibrating Quadrotor Sensors…» (GlobConET, 2022)
  robotic-park/           «Robotic Park. Multi-Agent Platform…» (IEEE Access, 2023)
  escalabilidad-ros2/     «Scalability of Cyber-Physical Systems … in ROS 2» (Sensors, 2023)
  frecuencia-muestreo/    «Análisis de la frecuencia de muestreo…» (JA, 2023)
  mvsim/                  «MultiVehicle Simulator (MVSim)…» (SoftwareX, 2023)
  muestreo-comunicacion/  «Muestreo y comunicación…» (RIAI, 2024)
  escudo-multi-uav/       «Distributed multi-UAV shield formation…» (RAS, 2024)
  reconfiguracion-escudo/ «Distributed reconfiguration of distance-based formations…» (ECC, 2024)
  benchmark-formacion/    Benchmark de formaciones (JA, 2024 · Control Systems Benchmarks, 2025)
  rele-khepera/           «Identificación en línea de robots diferenciales mediante relé» (JA, 2025)
  blockchain-control/     «Blockchain-based cloud controllers…» (JII, 2025)
  formacion-lagrange/     «Rigid formation control … using Lagrange multipliers» (ECC, 2026)
  relay-autotuning/       Ejemplo completo: «Relay-based autotuning…» (Mechatronics, 2026)
    index.html
    app.js              Interfaz de cada sección
    modelo.js           Simulación y datos del artículo
    gimbal3d.js         Visor 3D del gimbal (canvas 2D)
```

HTML, CSS y JavaScript planos: no hay build. GitHub Pages sirve los archivos tal cual.

## Crear una página nueva en 5 pasos

1. **Copia la plantilla** con un nombre corto y sin espacios:
   ```bash
   cp -r interactivos/plantilla interactivos/mi-articulo
   ```
2. **Edita `index.html`**: busca `EDITA AQUÍ` (título, autores, DOI, cifras de portada,
   referencia y BibTeX). Borra las secciones que no uses y añade las tuyas copiando un bloque
   `<section class="ip-section" id="…">` completo. Añade un enlace en `<nav class="ip-topnav">`
   por cada sección.
3. **Edita `app.js`**: cada bloque `(function nombre() { … })();` controla una sección. Cambia
   los nodos del mapa conceptual, los controles, la función `simulate()` y las preguntas.
4. **Prueba en local** desde la raíz del repositorio:
   ```bash
   python3 -m http.server
   # abre http://localhost:8000/interactivos/mi-articulo/
   ```
   Si algo no aparece, abre la consola del navegador y escribe `IP.errors`: ahí quedan
   registrados los errores de JavaScript de la página.
5. **Enlázala desde `publicaciones.html`**: en la tarjeta del artículo, añade al final del
   bloque de texto
   ```html
   <a class="pub-interactive" href="interactivos/mi-articulo/">Versión interactiva</a>
   ```
   y en `publicaciones_en.html` el mismo enlace con `?lang=en`:
   ```html
   <a class="pub-interactive" href="interactivos/mi-articulo/?lang=en">Interactive version</a>
   ```

## Español e inglés

Cada página es **un único archivo bilingüe**. El botón «English / Español» de la barra superior
(lo crea `IP.page()`) cambia el idioma al instante y lo recuerda en el navegador; también se
puede forzar con `?lang=en` o `?lang=es` en la URL.

- **HTML**: cada texto va duplicado en dos `span`, y el CSS oculta el del otro idioma:
  ```html
  <h2><span lang="es">Mapa conceptual</span><span lang="en">Concept map</span></h2>
  ```
  Las fórmulas sin texto no hace falta duplicarlas. En `<option>` no caben `span`: usa
  `<option value="x" data-en="English text">Texto en español</option>`.
- **Cabecera**: `<title data-en="English title">Título</title>`, el pequeño `<script>` que fija el
  idioma antes de pintar (cópialo de la plantilla) y `data-href-en="../../publicaciones_en.html"`
  en los enlaces a páginas del sitio, para que en inglés lleven a la versión inglesa.
- **JavaScript**: todo texto visible pasa por `T('español', 'English')` (alias de `IP.t`). Ojo con
  no declarar otra variable llamada `T` en la misma función. `IP.fmt` ya usa coma o punto
  decimal según el idioma; `IP.lang` vale `'es'` o `'en'`.

## Componentes disponibles (`ip.js`)

| Llamada | Qué hace |
|---|---|
| `IP.page()` | Activa el menú con la sección actual, la barra de progreso, la aparición al hacer scroll (`.ip-reveal`), los botones `data-copy` y las fórmulas. Llámalo siempre primero. |
| `IP.controls(el, specs, onChange)` | Crea sliders (`type:'range'`), desplegables (`'select'`) e interruptores (`'toggle'`). Devuelve `{ values, get, set, el }`. |
| `IP.seg(el, opciones, valor, onChange)` | Botones segmentados (p. ej. «Roll / Pitch»). |
| `new IP.Plot(el, opts)` | Gráfica en canvas con ejes automáticos, leyenda, tooltip y modo oscuro. `plot.setSeries([...])`; `plot.overlays = { hlines, vlines, bands, markers, texts }`. Con `equal:true` sirve para diagramas de Nyquist o planos XY. |
| `IP.conceptMap(el, mapa, { panel })` | Mapa conceptual SVG: nodos clicables, flechas animadas y panel explicativo. Admite una disposición distinta para móvil (`mx`, `my`, `mobileView`). |
| `IP.quiz(el, preguntas)` | Autoevaluación con corrección inmediata, explicación y marcador. |
| `IP.tabs(el)` | Pestañas accesibles (marcado `role="tablist"`, `role="tab"`, `role="tabpanel"`). |
| `IP.animate(el, paso)` | Bucle de animación `paso(dt, t)` que se pausa solo si `el` no está a la vista o la pestaña está oculta. Devuelve `{ start, stop }`. |
| `IP.sim.DelayLine(n)` | Retardo puro de *n* muestras. |
| `IP.sim.PID({kp,ki,kd,umax})` | PID paralelo con saturación y *anti-windup*; `step(e, dt)` admite `dt` variable (control por eventos). |
| `IP.sim.MovingAvg(n)`, `IP.sim.MovingStd(n)` | Media y desviación típica en ventana deslizante. |
| `IP.sim.rng(semilla)` | Números aleatorios reproducibles (`uniform()`, `gauss()`). |
| `IP.sim.stepMetrics(t, y, ref, t0)` | Sobreoscilación, tiempo de subida (10–90 %), de establecimiento (5 %), IAE e ITAE. |
| `IP.fmt(v, decimales)` | Números con coma decimal en español y punto en inglés. |
| `IP.t(es, en)`, `IP.lang` | Texto en el idioma activo; idioma actual (`'es'` o `'en'`). |
| `new IP.Scene3D(canvas, opts)` *(scene3d.js)* | Escena 3D en modo inmediato: `begin()`, `line`, `polyline`, `poly`, `point`, `drone`, `text`, `draw(dt)`. Se gira arrastrando; `onChange` permite sincronizar varias cámaras. |
| `FORM.*` *(formacion.js)* | `surface`, `buildShield`, `delaunay`, `flipToDelaunay`, `rankJR`, `new FORM.Sim({...})` con las leyes `'ras'`, `'base'`, `'rfc'` y `'prf'`, y `drawScene` para dibujar una formación. |

### Clases CSS útiles (`ip.css`)

- Maquetación: `ip-section`, `ip-wrap`, `ip-grid cols-2 | cols-3 | side | side-left`, `ip-card`.
- Texto: `ip-eyebrow` (con `<span class="ip-num">1</span>`), `ip-section-head`, `ip-muted`, `ip-small`.
- Avisos: `ip-note`, `ip-note info`, `ip-note ok`, `ip-note danger`; etiquetas `ip-pill` (`accent`, `danger`, `muted`).
- Datos: `ip-readouts` + `ip-readout` (`hl`, `bad`), `ip-table-wrap` + `ip-table`.
- Fórmulas: envuelve las de bloque en `<div class="ip-eq">$$ … $$</div>`; en línea, `\( … \)`.
- Animación de entrada: añade `ip-reveal` a cualquier bloque.

### Colores

Usa siempre los tokens (`var(--primary)`, `var(--accent)`, `var(--muted)`, `var(--surface)`…)
y, en las gráficas, los nombres `'--s1'` … `'--s5'`. Así la página cambia sola entre modo claro
y oscuro. Para forzar un tema: `<html data-theme="dark">` o `data-theme="light"`.

## Buenas prácticas

- **Datos del artículo, no inventados**: guarda las cifras publicadas en un objeto (como
  `PAPER` en `relay-autotuning/modelo.js`) e indica la tabla o figura de origen. Si la
  simulación es una aproximación didáctica, dilo en la página.
- **Simulación separada de la interfaz**: pon el modelo en `modelo.js` y deja `app.js` solo
  para conectar controles y gráficas. Así se puede verificar y reutilizar.
- **Móvil**: todas las rejillas pasan a una columna por debajo de ~860 px. Prueba la página a
  390 px de ancho y comprueba que no haya desplazamiento horizontal.
- **Rendimiento**: limita los puntos por serie (unos miles) y usa `IP.animate` en lugar de
  `requestAnimationFrame` directo para no gastar CPU con la página fuera de la vista.
- **Librerías externas**: si necesitas alguna, cárgala desde `cdn.jsdelivr.net` con una
  versión fija (p. ej. `katex@0.16.11`), nunca sin versión.
