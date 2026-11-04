import { pagosApi } from '../api/servicios';

/** Abre el comprobante en otra pestaña; se abre antes del fetch para que no la bloquee el navegador. */
export async function abrirComprobante(idPago: number): Promise<void> {
  const ventana = window.open('', '_blank');
  try {
    const html = await pagosApi.comprobante(idPago);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    ventana?.close();
    throw err;
  }
}
