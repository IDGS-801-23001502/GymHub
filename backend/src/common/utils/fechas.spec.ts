import { aFecha, aISO, diferenciaDias, edad, esFechaISO, hoyISO, sumarDias } from './fechas.js';
import { folioPago, folioSocio, folioTemporal } from './folios.js';

describe('fechas', () => {
  it('hoyISO respeta la zona horaria del gimnasio', () => {
    // 2026-11-03 03:00 UTC = 2026-11-02 21:00 en Ciudad de México
    const ahora = new Date('2026-11-03T03:00:00Z');
    expect(hoyISO('America/Mexico_City', ahora)).toBe('2026-11-02');
    expect(hoyISO('UTC', ahora)).toBe('2026-11-03');
  });

  it('valida fechas ISO reales', () => {
    expect(esFechaISO('2026-02-28')).toBe(true);
    expect(esFechaISO('2026-02-30')).toBe(false);
    expect(esFechaISO('02/11/2026')).toBe(false);
  });

  it('convierte ida y vuelta sin desfase', () => {
    expect(aISO(aFecha('2026-11-02'))).toBe('2026-11-02');
    expect(() => aFecha('2026-13-01')).toThrow();
  });

  it('suma y resta días', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diferenciaDias('2026-11-02', '2026-11-09')).toBe(7);
    expect(diferenciaDias('2026-11-09', '2026-11-02')).toBe(-7);
  });

  it('calcula edad cumplida', () => {
    expect(edad('2000-11-03', '2026-11-02')).toBe(25);
    expect(edad('2000-11-02', '2026-11-02')).toBe(26);
  });
});

describe('folios', () => {
  it('tienen el formato esperado y caben en la columna', () => {
    expect(folioSocio(123)).toBe('GH000123');
    expect(folioPago(45n, '2026-11-02')).toBe('P20261102-000045');
    expect(folioTemporal()).toHaveLength(20);
  });
});
