import type { EstadoMembresia, MetodoPago } from '../api/tipos';

const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fechaHora = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export const formatoMoneda = (n: number) => moneda.format(n);

/** Fecha "solo día" (YYYY-MM-DD) sin desfase de zona horaria. */
export function formatoFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fechaCorta.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

export function formatoFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fechaHora.format(new Date(iso));
}

/** Hoy en la zona local del navegador, como YYYY-MM-DD. */
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const ESTADOS_MEMBRESIA: Record<EstadoMembresia, { texto: string; clase: string }> = {
  activa: { texto: 'Vigente', clase: 'badge-ok' },
  por_vencer: { texto: 'Por vencer', clase: 'badge-aviso' },
  vencida: { texto: 'Vencida', clase: 'badge-error' },
  congelada: { texto: 'Congelada', clase: 'badge-info' },
  cancelada: { texto: 'Cancelada', clase: 'badge-neutro' },
};

export const METODOS_PAGO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
