// Fechas "solo día" como `YYYY-MM-DD` para evitar desfases de zona horaria;
// Prisma guarda las columnas DATE como medianoche UTC.

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86_400_000;

/** Fecha de hoy en la zona horaria del gimnasio (APP_TIMEZONE). */
export function hoyISO(
  zona = process.env.APP_TIMEZONE ?? 'America/Mexico_City',
  ahora = new Date(),
): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

export function esFechaISO(valor: string): boolean {
  if (!ISO_DIA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(valor);
}

/** `YYYY-MM-DD` -> Date a medianoche UTC (para columnas DATE). */
export function aFecha(iso: string): Date {
  if (!esFechaISO(iso)) throw new Error(`Fecha inválida: ${iso}`);
  return new Date(`${iso}T00:00:00Z`);
}

/** Date de una columna DATE -> `YYYY-MM-DD`. */
export function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function sumarDias(iso: string, dias: number): string {
  return aISO(new Date(aFecha(iso).getTime() + dias * MS_DIA));
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diferenciaDias(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / MS_DIA);
}

/** Edad cumplida en años a la fecha `hoy`. */
export function edad(fechaNacimiento: string, hoy: string): number {
  const [an, mn, dn] = fechaNacimiento.split('-').map(Number);
  const [ah, mh, dh] = hoy.split('-').map(Number);
  let anios = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) anios--;
  return anios;
}
