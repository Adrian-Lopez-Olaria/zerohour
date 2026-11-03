# Política de seguridad

ZEROHOUR es una web estática de inteligencia de vulnerabilidades: un pipeline en GitHub Actions
genera JSON y una web sin backend los muestra en <https://zerohour-cve.dev>. Si encuentras un
problema de seguridad en el código o en el despliegue, gracias por avisar de forma privada.

## Cómo reportar

- **Preferido:** *Report a vulnerability* en la pestaña **Security** del repositorio (reporte
  privado de GitHub; está activado).
- **Correo:** zerohour.sec@gmail.com
- El contacto también está publicado en
  [`/.well-known/security.txt`](https://zerohour-cve.dev/.well-known/security.txt) (RFC 9116).
- No abras un *issue* público para fallos de seguridad.

Ayuda mucho que el reporte incluya:

- La URL o el fichero y la línea afectados.
- Los pasos para reproducirlo y el impacto que ves.
- Una prueba de concepto mínima, si la hay. Para XSS basta con `alert(document.domain)` o un
  `console.log`; no hace falta nada más agresivo.

## Plazos

Es un proyecto personal mantenido por una persona, así que los plazos son orientativos:

| Paso | Plazo |
|---|---|
| Acuse de recibo | 3 días laborables |
| Primera valoración (si se confirma y con qué gravedad) | 7 días |
| Corrección de un fallo crítico o alto | 30 días |
| Corrección de un fallo medio o bajo | 90 días |

Te mantendré al tanto del avance. La publicación es coordinada: la corrección sale primero y el
aviso después, con un máximo de 90 días desde el reporte salvo que acordemos otra cosa.

## Alcance

**Dentro:**

- El sitio publicado en `https://zerohour-cve.dev`, incluidas sus cabeceras (CSP con Trusted
  Types, HSTS, etc.) y la configuración de caché.
- El frontend `web/`: cualquier forma de que un dato externo (descripción de NVD, titular RSS,
  nombre o descripción de un repo de PoC…) acabe ejecutando código o rompiendo la CSP.
- El pipeline `scripts/` (sobre todo `radar.py`): parseo de fuentes de terceros, escritura de
  ficheros, descarga y verificación de la base de DB-IP.
- `config.toml`, `.github/workflows/`, `netlify.toml` (fuente de las cabeceras), `wrangler.jsonc`
  y la cadena de suministro del repo (acciones fijadas por SHA, dependencias con hashes).

**Fuera:**

- La infraestructura de Cloudflare y de GitHub.
- Las APIs y los datos de terceros (NVD, CISA, FIRST, CVE.org, SANS ISC, DB-IP…): repórtalos a
  sus responsables. Que una fuente publique un dato erróneo no es una vulnerabilidad de
  ZEROHOUR, salvo que la web lo trate de forma insegura.
- Ataques de denegación de servicio, informes automáticos de escáneres sin una prueba de
  impacto, cabeceras de «buena práctica» sin un ataque concreto, y la ingeniería social.

## Reglas para las pruebas

- Solo pruebas no destructivas y de baja intensidad: nada de DoS, fuerza bruta ni escaneos de
  miles de peticiones por segundo (con herramientas automáticas, limita la tasa; por ejemplo,
  `-rate-limit 5` en nuclei). El alojamiento es Cloudflare y sus condiciones lo prohíben.
- La web no tiene cuentas ni datos personales de usuarios: no intentes acceder a datos de otros.
- Si una prueba toca la cadena de suministro (por ejemplo, una dependencia), demuéstralo en un
  fork o en local, nunca contra el repositorio original.

Si sigues estas reglas y actúas de buena fe, no emprenderé ninguna acción contra ti por la
investigación.

## Reconocimientos

Quien reporte un fallo válido aparecerá aquí, si así lo quiere, con el nombre o alias que
prefiera. No hay programa de recompensas.

*Todavía no hay reportes.*
