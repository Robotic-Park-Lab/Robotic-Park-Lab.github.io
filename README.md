# Robotic-Park-Lab.github.io

> 📖 Para entender las ramas de este repo y la guía de contribución, consulta la rama [`doc`](https://github.com/Robotic-Park-Lab/Robotic-Park-Lab.github.io/tree/doc).

Web oficial de **Robotic Park Lab** (UNED), publicada con GitHub Pages en
<https://robotic-park-lab.github.io/>.

## Estructura

```
index.html            Portada
investigacion.html      Líneas de investigación, propuestas de PFG/TFM, proyectos e innovación docente
publicaciones.html      Publicaciones (tarjetas con portada, cita, DOI y resumen)
plataforma.html         Hardware y repositorios de software de Robotic Park
equipo.html             Investigadores del laboratorio
benchmarks.html         Benchmarks reproducibles publicados por el laboratorio
contacto.html           Datos de contacto
assets/
  style.css               Hoja de estilos compartida (paleta verde/naranja del logo)
  img/logo.png            Logotipo del laboratorio
  img/publications/       Portadas de las publicaciones (miniaturas, ≤ 420 px de ancho)
interactivos/             Publicaciones interactivas (innovación docente), ver interactivos/README.md
  lib/                      Librería común ip.css + ip.js
  plantilla/                Plantilla para crear una página nueva
  relay-autotuning/         «Relay-based autotuning for quadrotor attitude and rate control»
```

HTML/CSS plano, sin generador ni build: GitHub Pages sirve el repositorio tal cual desde la rama
`main`. Para previsualizar en local basta con abrir `index.html` en un navegador (o servir la
carpeta con `python3 -m http.server`).

## Cómo ampliar el sitio

- **Nueva línea de investigación**: añade una tarjeta `.item-card` en `investigacion.html` (`#lineas`).
- **Nueva propuesta de PFG/TFM**: copia un bloque `<div class="card proposal">` en `investigacion.html`
  (`#pfg-tfm`): título, directores, descripción, etiquetas y referencias.
- **Nuevo proyecto**: copia un bloque `<div class="card"><div class="entry">…` en `#proyectos` o
  `#innovaciondocente`.
- **Nueva publicación**: copia un bloque `<div class="card pub-card">` en la sección correspondiente de
  `publicaciones.html` y guarda la portada en `assets/img/publications/` (reducida a ~420 px de ancho).
- **Versión interactiva de una publicación**: copia `interactivos/plantilla/` a
  `interactivos/<nombre>/`, sigue `interactivos/README.md` y añade en la tarjeta de la publicación
  `<a class="pub-interactive" href="interactivos/<nombre>/">Versión interactiva</a>` (y la clase
  `has-interactive` en la tarjeta).
- **Nuevo miembro del equipo**: copia un bloque `.team-card` en `equipo.html`.
- **Nuevo repositorio de software/hardware**: añade una tarjeta `.item-card` en `plataforma.html`.
- **Nuevo benchmark**: duplica un bloque `<section class="benchmark">` completo en
  `benchmarks.html` (título, descripción, objetivo, `.data-specs` con las características del
  dataset, botón "Descargar dataset" y una tabla `.ranking-table` para el ranking de resultados).
- **Nuevo dataset descargable**: sube el `.bag`/`.mcap` a un release de GitHub (o donde prefieras
  alojarlo) y actualiza el `href` del botón "Descargar dataset" del benchmark correspondiente.
- **Nuevo resultado en un ranking**: los resultados llegan por email a
  `lab.nanodrones@dia.uned.es`; añádelos a mano como una nueva `<tr>` en la
  `.ranking-table` del benchmark correspondiente (quita la fila de ejemplo `.rank-example`
  cuando haya resultados reales).
- **Nueva página**: añade el `<a>` correspondiente al bloque `<nav class="site-nav">` de
  *todas* las páginas (cabecera repetida en cada archivo, no hay layout compartido).
- **Estilos**: todo el diseño vive en `assets/style.css`, con variables CSS en `:root`
  (colores, radios, sombras) y un bloque `@media (prefers-color-scheme: dark)` para modo oscuro
  automático.

## Publicación

GitHub Pages está configurado para servir desde `main` / raíz. Cualquier cambio empujado a
`main` se publica automáticamente en unos minutos.

## Licencia

Contenido y código de esta web: © Robotic Park Lab, UNED.
