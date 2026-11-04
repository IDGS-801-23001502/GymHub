import { randomBytes } from 'node:crypto';

/** Folio temporal único (<= 20 caracteres) usado antes de conocer el ID. */
export function folioTemporal(): string {
  return `TMP-${randomBytes(8).toString('hex')}`; // 20 caracteres
}

/** Folio del socio: GH + ID con 6 dígitos (ej. GH000123). */
export function folioSocio(idSocio: number): string {
  return `GH${String(idSocio).padStart(6, '0')}`;
}

/** Folio de pago: P + AAAAMMDD + '-' + ID con 6 dígitos (ej. P20261102-000045). */
export function folioPago(idPago: bigint | number, fechaISO: string): string {
  return `P${fechaISO.replaceAll('-', '')}-${String(idPago).padStart(6, '0')}`;
}
