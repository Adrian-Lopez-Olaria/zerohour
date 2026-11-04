# Fuentes autoalojadas (Órbita)

Subconjunto **latin** servido desde el propio dominio (la CSP es `font-src 'self'`; no se
permiten terceros), con `font-display: swap`. Llegan en el paquete de diseño
(`design/orbita/fuentes/`), con sus licencias y su `SHA256SUMS.txt`.

| Archivo | Familia | Estilo / ejes | Uso | SHA-256 |
|---|---|---|---|---|
| `saira-latin-wdth-normal.woff2` | Saira | normal · `wght 100–900`, `wdth 50–125` (variable) | Todo el texto y las cifras | `d5f1ee1ce85a2f6611d76bcd98738132f4706b099dc167f02c2093a1ec5eb975` |
| `saira-latin-wdth-italic.woff2` | Saira | italic · `wght 100–900`, `wdth 50–125` (variable) | «Fabricante pendiente en NVD», «Sin fabricante» | `ff62faec90bbc6ca908b86dceab910a9283814787b38f8d288f05d43facae4ec` |
| `azeret-mono-latin-400-normal.woff2` | Azeret Mono | normal · 400 | IDs de CVE y puertos | `83f738bd44f3d7542f2adf6c78d2285b85c55fd349a44ded40f844fbcfbe1d81` |
| `azeret-mono-latin-500-normal.woff2` | Azeret Mono | normal · 500 | Puertos | `be8abdd09a16e1a4469f9e25959e50c80dade1ecf97e52e8b3c80f000a2a5570` |

Solo se precarga Saira normal: pinta el primer contenido visible (marca, fecha y cifras).

**Cobertura.** El subconjunto latin no trae ■ ◧ □ ○ ⟲ → ← ≥ ≤ ✓ ▲ ▼ ▾ ↗ ≈ (y Azeret Mono
tampoco ′). Las formas de los veredictos, las flechas y los iconos son **SVG propios**, y
`tests/pipeline/test_glifos.py` comprueba con fontTools que todo carácter que pinta la web
tiene glifo en Saira, para que ninguno caiga en una fuente del sistema.

Comprobación: `sha256sum -c` con las sumas de esta tabla (o el `SHA256SUMS.txt` del paquete).

## Licencia

Las dos familias se publican bajo la **SIL Open Font License 1.1 (OFL)**, que permite el
autoalojamiento y la redistribución:

| Familia | Licencia | Copyright |
|---|---|---|
| Saira | [`OFL-Saira.txt`](./OFL-Saira.txt) | © 2020 The Saira Project Authors |
| Azeret Mono | [`OFL-AzeretMono.txt`](./OFL-AzeretMono.txt) | © 2021 The Azeret Project Authors |

Se retiran Big Shoulders Display, Hanken Grotesk y Martian Mono (diseño v1/v2).
