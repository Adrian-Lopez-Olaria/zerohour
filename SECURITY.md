# Política de seguridad

> Borrador. La versión completa (plazos de respuesta y reconocimientos) se cierra en la fase 7.
> El contacto ya está publicado en `/.well-known/security.txt` (RFC 9116).

## Reportar una vulnerabilidad

ZEROHOUR es una web estática de inteligencia de vulnerabilidades. Si encuentras un
problema de seguridad en el código o en el despliegue, repórtalo de forma privada.

- **Preferido:** *Report a vulnerability* en la pestaña **Security** del repositorio
  (reporte privado de GitHub).
- **Correo:** zerohour.sec@gmail.com
- Por favor, no abras un *issue* público para fallos de seguridad.
- Pruebas permitidas: solo no destructivas y de baja intensidad (nada de DoS ni
  escaneo agresivo; el alojamiento es Netlify). Ver `PENTEST-ZEROHOUR.md`.

## Alcance

Dentro: frontend `web/`, pipeline `scripts/radar.py`, `config.toml`,
`.github/workflows/`, `netlify.toml`. Fuera: la infraestructura de Netlify, GitHub
y las APIs y datos de terceros (NVD, CISA, FIRST, SANS ISC, DB-IP…).
