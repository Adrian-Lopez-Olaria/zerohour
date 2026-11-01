# Librerías de terceros autoalojadas

Los ficheros de esta carpeta (salvo este documento) los genera `scripts/vendor_globe.py`; no se editan a mano.
Para comprobar que lo commiteado coincide con lo que se regenera desde npm:

```sh
python scripts/vendor_globe.py --check
```

## globe.gl 2.46.2 (incluye three.js r185)

| | |
|---|---|
| Paquete | [`globe.gl@2.46.2`](https://www.npmjs.com/package/globe.gl/v/2.46.2) · licencia MIT · publicado el 2026-08-22 |
| Origen | `https://registry.npmjs.org/globe.gl/-/globe.gl-2.46.2.tgz` |
| Integridad npm (fijada en el script) | `sha512-oh5fx/sTVtFa06OrLXxgfZ5TV1xhDzLKw0muc0fxJfpHrvfDNRspGqrgURpEBBYWS7REzQA78vodUrjbpfYoqA==` |
| SHA-256 del tarball | `914349def3da1323fc732229c715b5be92a6fbd55346e193dc05483f72359c87` |
| SHA-256 de `dist/globe.gl.min.js` original | `2c3e445c04d121215910a89688b96091c8a72071c122a4f830081a39b636c94c` |
| three.js | r185 (`REVISION="185"`), va dentro del bundle UMD; no hay un fichero aparte |

### Ficheros

| Fichero | SHA-256 | Qué es |
|---|---|---|
| `globe.gl-2.46.2.zh.min.js` | `3f2d59a98a5a250b10d27441c63de682e1d516af36a6de1df44d2c7543663f0a` | Bundle UMD **parcheado** (ver abajo) |
| `globe.gl-2.46.2.zh.css` | `cad9e6ccb0f57ce6242c3b1b936670e8e6654257606b7446a806e25f66a52cde` | CSS que el bundle inyectaba, extraído sin cambios |
| `LICENSE-globe.gl.txt` | `c633a0da18abe4208665d9faf574f38084bbe38ce5bf743e9ecc06e50b941b59` | Licencia MIT de globe.gl (del propio paquete) |
| `LICENSE-three.js.txt` | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` | Licencia MIT de three.js ([r185](https://github.com/mrdoob/three.js/blob/r185/LICENSE)) |

### Por qué está parcheado

La web se sirve con `style-src 'self'` y `require-trusted-types-for 'script'`. Probado con esa CSP, el bundle original:

1. **Inyecta 3 etiquetas `<style>`** al cargarse (patrón *styleInject*) → 6 violaciones de `style-src-elem`.
2. **Vacía su contenedor con `e.innerHTML=""`** al montarse (en `three-render-objects` y en `globe.gl`) → Trusted Types lo bloquea y el globo no arranca.

En lugar de relajar la CSP (`'unsafe-inline'`, hashes o una política *default* de Trusted Types), el script aplica un parche mínimo:

| # | Original | Parcheado | Coincidencias exigidas |
|---|---|---|---|
| 1 | `!function(e,t){…styleInject…}("<css>")` | `void 0` (y el CSS va a `globe.gl-2.46.2.zh.css`) | exactamente 3 |
| 2 | `e.innerHTML="",e.appendChild(t.container=…)` | `e.replaceChildren(),e.appendChild(t.container=…)` | exactamente 2 |

Si una versión futura cambia esos fragmentos, el script aborta en lugar de parchear a ciegas.

Los demás `innerHTML` del bundle (`.html()` de d3-selection y `dangerouslySetInnerHTML` de preact, ambos para el tooltip) no se ejecutan: la web llama a `enablePointerInteraction(false)` y no usa etiquetas. Si alguna vez llegaran a ejecutarse con un string, Trusted Types los bloquearía, que es justo lo que queremos.

### Otras dependencias incluidas en el bundle

`three-globe`, `three-render-objects`, `kapsule`, `float-tooltip`, `accessor-fn`, `@tweenjs/tween.js`, `preact` (todas MIT) y varios módulos `d3-*` (ISC). Las versiones exactas son las que resolvió el autor al publicar `globe.gl@2.46.2`.

## Datos de tierra (`../geo/tierra.json`)

Máscara de tierra de **Natural Earth 1:50m** (dominio público) rasterizada a unos 1,5°, sacada del prototipo de diseño: 4.826 celdas y 2,9 KB. Se usa en el globo (como puntos) y en la vista plana (como un único `<path>`).
