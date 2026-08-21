# Robotic-Park-Lab.github.io

Web oficial de **Robotic Park Lab** (UNED), publicada con GitHub Pages en
<https://robotic-park-lab.github.io/>.

## Estructura

```
index.html            Portada
investigacion.html      Líneas de investigación, proyectos y publicaciones
plataforma.html         Hardware y repositorios de software de Robotic Park
equipo.html             Investigadores del laboratorio
benchmarks.html         Benchmarks reproducibles publicados por el laboratorio
contacto.html           Datos de contacto
assets/
  style.css               Hoja de estilos compartida (paleta verde/naranja del logo)
  img/logo.png            Logotipo del laboratorio
```

HTML/CSS plano, sin generador ni build: GitHub Pages sirve el repositorio tal cual desde la rama
`main`. Para previsualizar en local basta con abrir `index.html` en un navegador (o servir la
carpeta con `python3 -m http.server`).

## Cómo ampliar el sitio

- **Nueva sección de investigación**: añade una tarjeta `.item-card` (líneas) o un bloque
  `.entry` (proyectos/publicaciones) en `investigacion.html`.
- **Nuevo miembro del equipo**: copia un bloque `.team-card` en `equipo.html`.
- **Nuevo repositorio de software/hardware**: añade una tarjeta `.item-card` en `plataforma.html`.
- **Nuevo benchmark**: añade una tarjeta `.item-card` en `benchmarks.html`.
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
