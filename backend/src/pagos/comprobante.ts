import type { PagoDetalle } from './pagos.service.js';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa texto para HTML (evita XSS con datos capturados, CRM-RNF-04). */
export function escaparHtml(valor: unknown): string {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function fechaHora(fecha: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: process.env.APP_TIMEZONE ?? 'America/Mexico_City',
  }).format(fecha);
}

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

/** Comprobante imprimible (HTML autocontenido, formato ticket/carta). */
export function renderComprobante(p: PagoDetalle): string {
  const e = escaparHtml;
  const cancelado = p.estado === 'cancelado';
  const filas: [string, string][] = [
    ['Folio', p.folio],
    ['Fecha', fechaHora(p.fecha_pago)],
    ['Socio', `${p.socio.nombre} (${p.socio.folio})`],
    ['Plan', `${p.plan.nombre} (${p.plan.tipo})`],
    ['Vigencia', `${p.membresia.fecha_inicio} al ${p.membresia.fecha_vencimiento}`],
    ['Método', METODOS[p.metodo] ?? p.metodo],
    ...(p.referencia ? ([['Referencia', p.referencia]] as [string, string][]) : []),
    ['Atendió', p.registrado_por.nombre],
  ];

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comprobante ${e(p.folio)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; background: #fff; margin: 0; padding: 24px 16px; }
  .ticket { max-width: 420px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px; position: relative; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sede { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; border-bottom: 1px dashed #e3e3e3; vertical-align: top; }
  td:first-child { color: #555; width: 38%; }
  .total { display: flex; justify-content: space-between; font-size: 20px; font-weight: 700; margin-top: 14px; }
  .nota { font-size: 11px; color: #666; margin-top: 16px; }
  .cancelado { border: 2px solid #b00020; color: #b00020; padding: 8px; border-radius: 6px; margin-bottom: 12px; font-weight: 600; }
  .acciones { text-align: center; margin-top: 16px; }
  @media print { body { padding: 0; } .ticket { border: 0; } .acciones { display: none; } }
</style>
</head>
<body>
<div class="ticket">
  <h1>GymHub · Comprobante de pago</h1>
  <div class="sede">${e(p.sede.nombre)}${p.sede.direccion ? ` · ${e(p.sede.direccion)}` : ''}${p.sede.telefono ? ` · Tel. ${e(p.sede.telefono)}` : ''}</div>
  ${
    cancelado
      ? `<div class="cancelado">PAGO CANCELADO${p.motivo_cancelacion ? `: ${e(p.motivo_cancelacion)}` : ''}${p.autorizado_por ? ` (autorizó ${e(p.autorizado_por.nombre)})` : ''}</div>`
      : ''
  }
  <table>
    ${filas.map(([k, v]) => `<tr><td>${e(k)}</td><td>${e(v)}</td></tr>`).join('\n    ')}
  </table>
  <div class="total"><span>Total</span><span>${e(moneda.format(p.monto))}</span></div>
  <p class="nota">Pago presencial de membresía. Este comprobante no es una factura fiscal.</p>
  <div class="acciones"><button onclick="window.print()">Imprimir</button></div>
</div>
</body>
</html>`;
}
