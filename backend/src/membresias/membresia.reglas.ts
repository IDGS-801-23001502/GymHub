import { diferenciaDias, sumarDias } from '../common/utils/fechas.js';

/**
 * Reglas puras de vigencia de membresías (CRM-RF-03).
 * Todas las fechas son `YYYY-MM-DD`; `fecha_vencimiento` es el ÚLTIMO día
 * válido (inclusive), igual que en la vista v_membresia_actual.
 */

export type EstadoMembresia =
  | 'activa'
  | 'por_vencer'
  | 'vencida'
  | 'congelada'
  | 'cancelada';

export interface PeriodoCongelamiento {
  fecha_inicio: string;
  fecha_fin: string;
}

export interface MembresiaFechas {
  fecha_inicio: string;
  fecha_vencimiento: string;
  /** Estado almacenado; solo 'cancelada' (y 'congelada' heredado) afectan el cálculo. */
  estado: string;
  congelamientos: PeriodoCongelamiento[];
}

export interface Periodo {
  fecha_inicio: string;
  fecha_vencimiento: string;
  /** true si se acumuló sobre una vigencia que aún no terminaba. */
  acumulada: boolean;
}

/**
 * Calcula el periodo de una nueva membresía.
 * Si el socio aún tiene vigencia (`vigenteHasta >= hoy`), la renovación se
 * acumula: inicia al día siguiente del vencimiento actual. Si no, inicia hoy.
 */
export function calcularPeriodo(
  duracionDias: number,
  hoy: string,
  vigenteHasta: string | null,
): Periodo {
  if (!Number.isInteger(duracionDias) || duracionDias <= 0) {
    throw new Error('La duración del plan debe ser un entero positivo.');
  }
  const acumula = vigenteHasta !== null && vigenteHasta >= hoy;
  const inicio = acumula ? sumarDias(vigenteHasta, 1) : hoy;
  return {
    fecha_inicio: inicio,
    fecha_vencimiento: sumarDias(inicio, duracionDias - 1),
    acumulada: acumula,
  };
}

export function congelamientoActivo(
  congelamientos: PeriodoCongelamiento[],
  hoy: string,
): PeriodoCongelamiento | undefined {
  return congelamientos.find(
    (c) => c.fecha_inicio <= hoy && hoy <= c.fecha_fin,
  );
}

/** Estado calculado de UNA membresía a la fecha `hoy`. */
export function calcularEstado(
  m: MembresiaFechas,
  hoy: string,
  diasAviso: number,
): EstadoMembresia {
  if (m.estado === 'cancelada') return 'cancelada';
  if (congelamientoActivo(m.congelamientos, hoy)) return 'congelada';
  if (m.fecha_vencimiento < hoy) return 'vencida';
  if (diferenciaDias(hoy, m.fecha_vencimiento) <= diasAviso) return 'por_vencer';
  return 'activa';
}

export interface ResumenMembresia<T extends MembresiaFechas> {
  /** Membresía que cubre hoy (o la más reciente si ninguna lo cubre). */
  actual: T;
  estado: EstadoMembresia;
  /** Último día cubierto contando renovaciones ya pagadas. */
  vigente_hasta: string;
  dias_restantes: number;
}

/**
 * Resumen del socio: combina la membresía en curso con renovaciones
 * anticipadas (que empiezan después). Ignora las canceladas.
 */
export function resumirMembresias<T extends MembresiaFechas>(
  membresias: T[],
  hoy: string,
  diasAviso: number,
): ResumenMembresia<T> | null {
  const validas = membresias
    .filter((m) => m.estado !== 'cancelada')
    .sort((a, b) => b.fecha_vencimiento.localeCompare(a.fecha_vencimiento));
  if (validas.length === 0) return null;

  const ultima = validas[0];
  const actual =
    validas.find((m) => m.fecha_inicio <= hoy && hoy <= m.fecha_vencimiento) ??
    ultima;

  let estado: EstadoMembresia;
  if (congelamientoActivo(actual.congelamientos, hoy)) {
    estado = 'congelada';
  } else {
    // El aviso de "por vencer" se evalúa contra el final de toda la cadena
    estado = calcularEstado(
      { ...ultima, congelamientos: [] },
      hoy,
      diasAviso,
    );
  }

  return {
    actual,
    estado,
    vigente_hasta: ultima.fecha_vencimiento,
    dias_restantes: Math.max(diferenciaDias(hoy, ultima.fecha_vencimiento), 0),
  };
}

/** Días cubiertos por un congelamiento (inclusive). */
export function diasCongelamiento(p: PeriodoCongelamiento): number {
  return diferenciaDias(p.fecha_inicio, p.fecha_fin) + 1;
}

export function seTraslapan(
  a: PeriodoCongelamiento,
  b: PeriodoCongelamiento,
): boolean {
  return a.fecha_inicio <= b.fecha_fin && b.fecha_inicio <= a.fecha_fin;
}
