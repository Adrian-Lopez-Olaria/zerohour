# Fuentes autoalojadas

Subconjunto **latino** (`U+0000–00FF…`) descargado de Google Fonts y servido desde
el propio dominio (la CSP es `font-src 'self'`; no se permiten terceros). `font-display: swap`.

| Archivo | Familia | Estilo / ejes | Versión | Origen (gstatic) | SHA-256 |
|---|---|---|---|---|---|
| `big-shoulders-display-latin.woff2` | Big Shoulders Display | normal · `wght 500–900` (variable) | v24 | `s/bigshouldersdisplay/v24/…fC1_PZJEZG…czNDu.woff2` | `698f9960927e7b5a0c38e5bf388cd0a6e42d855062fe70366cf5057664e39401` |
| `martian-mono-latin.woff2` | Martian Mono | normal · `wdth 75–112.5`, `wght 300–700` (variable) | v6 | `s/martianmono/v6/2V0aKIcADoYhV6w87xrTKjsSBanI.woff2` | `f9c1655c2c9d1ed5bb8b301a57d1169a1123ffef1a588dc50a7a487810f7d732` |
| `hanken-grotesk-latin.woff2` | Hanken Grotesk | normal · `wght 400–700` (variable) | v12 | `s/hankengrotesk/v12/…ieVn2YZD…d59A.woff2` | `e9201eddf1d41d0b62253295d869ce3cf65768f7102b797f02c7f8c876b4a9d5` |
| `hanken-grotesk-italic-latin.woff2` | Hanken Grotesk | italic · `wght 400` | v12 | `s/hankengrotesk/v12/…ieVo2YZD…osBO5Xw.woff2` | `53168ef35821f9ec781d281e9efefb097833a1f60760552ac9cba4f4ccc43aa6` |

Reconstrucción: pedir el CSS a `https://fonts.googleapis.com/css2?family=…&display=swap`
con un *User-Agent* de navegador moderno y bajar la URL `woff2` del bloque `/* latin */`
(para Hanken, el bloque `font-style: normal` es la variable; el `italic` es de peso único).
Verificar el `SHA-256` tras descargar.

## Licencia

Las tres familias se publican bajo la **SIL Open Font License 1.1 (OFL)**, que permite el
autoalojamiento y la redistribución. El texto completo de cada licencia acompaña a las fuentes:

| Familia | Licencia | Copyright |
|---|---|---|
| Big Shoulders Display | [`OFL-BigShouldersDisplay.txt`](./OFL-BigShouldersDisplay.txt) | © 2019 The Big Shoulders Project Authors |
| Martian Mono | [`OFL-MartianMono.txt`](./OFL-MartianMono.txt) | © 2021 The Martian Mono Project Authors |
| Hanken Grotesk | [`OFL-HankenGrotesk.txt`](./OFL-HankenGrotesk.txt) | © 2021 The Hanken Grotesk Project Authors |
