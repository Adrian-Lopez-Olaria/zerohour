# Política de seguridad

> Borrador. La versión completa (canales, alcance y plazos) se cierra en la fase 7,
> junto con `web/.well-known/security.txt` (RFC 9116) en la fase 4.

## Reportar una vulnerabilidad

ZEROHOUR es una web estática de inteligencia de vulnerabilidades. Si encuentras un
problema de seguridad en el código o en el despliegue, repórtalo de forma privada.

- **Contacto:** _(pendiente de confirmar en la fase 4; se reflejará aquí y en `security.txt`)_.
- Por favor, no abras un *issue* público para fallos de seguridad.
- Pruebas permitidas: solo no destructivas y de baja intensidad (nada de DoS ni
  escaneo agresivo; el alojamiento es Netlify). Ver `PENTEST-ZEROHOUR.md`.

## Alcance

Dentro: frontend `web/`, pipeline `scripts/radar.py`, `config.toml`,
`.github/workflows/`, `netlify.toml`. Fuera: la infraestructura de Netlify, GitHub
y las APIs de terceros (NVD, CISA, FIRST, ip-api…).
