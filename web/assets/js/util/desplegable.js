/* =============================================================================
   util/desplegable.js · <details> que se comporta como un desplegable
   Se cierra al hacer clic o tocar fuera y con Esc; el <summary> lleva aria-expanded al día y,
   al cerrar con Esc (o si el foco estaba dentro del panel), el foco vuelve al <summary>.
   Sin JS sigue siendo un <details> normal.
   Los listeners del documento están puestos desde el principio y miran details.open: el evento
   «toggle» llega de forma asíncrona y un Esc pulsado justo después de abrir se perdería.
   ============================================================================= */

/** Convierte `details` en desplegable y lo devuelve. */
export function desplegable(details) {
  const sum = details.querySelector('summary');
  if (!sum) return details;
  const sync = () => sum.setAttribute('aria-expanded', String(details.open));
  const off = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const close = (focus) => {
    details.open = false;
    sync();
    if (focus) sum.focus();
  };
  function onDown(e) {
    if (!details.isConnected) { off(); return; }      // la barra se ha vuelto a pintar
    if (details.open && !details.contains(e.target)) close(details.contains(document.activeElement));
  }
  function onKey(e) {
    if (!details.isConnected) { off(); return; }
    if (e.key !== 'Escape' || !details.open) return;
    e.preventDefault();
    close(true);
  }
  details.addEventListener('toggle', sync);
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  sync();
  return details;
}
