import {
  calcularEstado,
  calcularPeriodo,
  diasCongelamiento,
  resumirMembresias,
  seTraslapan,
  type MembresiaFechas,
} from './membresia.reglas.js';

const m = (
  fecha_inicio: string,
  fecha_vencimiento: string,
  extra: Partial<MembresiaFechas> = {},
): MembresiaFechas => ({
  fecha_inicio,
  fecha_vencimiento,
  estado: 'activa',
  congelamientos: [],
  ...extra,
});

describe('calcularPeriodo', () => {
  it('sin membresía previa inicia hoy; el vencimiento es inclusivo', () => {
    expect(calcularPeriodo(30, '2026-11-02', null)).toEqual({
      fecha_inicio: '2026-11-02',
      fecha_vencimiento: '2026-12-01',
      acumulada: false,
    });
  });

  it('renovación con membresía vigente se acumula al vencimiento actual', () => {
    expect(calcularPeriodo(30, '2026-11-02', '2026-11-10')).toEqual({
      fecha_inicio: '2026-11-11',
      fecha_vencimiento: '2026-12-10',
      acumulada: true,
    });
  });

  it('si vence hoy todavía está vigente y se acumula', () => {
    expect(calcularPeriodo(1, '2026-11-02', '2026-11-02').fecha_inicio).toBe('2026-11-03');
  });

  it('membresía vencida: la renovación inicia hoy', () => {
    expect(calcularPeriodo(90, '2026-11-02', '2026-10-01')).toMatchObject({
      fecha_inicio: '2026-11-02',
      fecha_vencimiento: '2027-01-30',
      acumulada: false,
    });
  });

  it('cruza años bisiestos correctamente (anual)', () => {
    expect(calcularPeriodo(365, '2027-03-01', null).fecha_vencimiento).toBe('2028-02-28');
  });

  it('rechaza duraciones inválidas', () => {
    expect(() => calcularPeriodo(0, '2026-11-02', null)).toThrow();
  });
});

describe('calcularEstado', () => {
  const hoy = '2026-11-02';
  it('activa, por vencer y vencida', () => {
    expect(calcularEstado(m('2026-11-01', '2026-11-30'), hoy, 7)).toBe('activa');
    expect(calcularEstado(m('2026-10-10', '2026-11-09'), hoy, 7)).toBe('por_vencer');
    expect(calcularEstado(m('2026-10-01', '2026-11-01'), hoy, 7)).toBe('vencida');
  });
  it('congelada si hoy cae en un periodo de congelamiento', () => {
    const cong = m('2026-10-01', '2026-12-01', {
      congelamientos: [{ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-05' }],
    });
    expect(calcularEstado(cong, hoy, 7)).toBe('congelada');
    expect(calcularEstado(cong, '2026-11-06', 7)).toBe('activa');
  });
  it('cancelada tiene prioridad', () => {
    expect(calcularEstado(m('2026-11-01', '2026-11-30', { estado: 'cancelada' }), hoy, 7)).toBe(
      'cancelada',
    );
  });
});

describe('resumirMembresias', () => {
  const hoy = '2026-11-02';

  it('null sin membresías válidas', () => {
    expect(resumirMembresias([], hoy, 7)).toBeNull();
    expect(resumirMembresias([m('2026-11-01', '2026-11-30', { estado: 'cancelada' })], hoy, 7)).toBeNull();
  });

  it('con renovación anticipada: no avisa "por vencer" y cuenta días hasta el final de la cadena', () => {
    const actual = m('2026-10-06', '2026-11-04');
    const renovacion = m('2026-11-05', '2026-12-04');
    const r = resumirMembresias([actual, renovacion], hoy, 7)!;
    expect(r.actual).toBe(actual);
    expect(r.estado).toBe('activa');
    expect(r.vigente_hasta).toBe('2026-12-04');
    expect(r.dias_restantes).toBe(32);
  });

  it('ignora la renovación cancelada', () => {
    const r = resumirMembresias(
      [m('2026-10-06', '2026-11-04'), m('2026-11-05', '2026-12-04', { estado: 'cancelada' })],
      hoy,
      7,
    )!;
    expect(r.estado).toBe('por_vencer');
    expect(r.vigente_hasta).toBe('2026-11-04');
  });

  it('vencida con días restantes en 0', () => {
    const r = resumirMembresias([m('2026-09-01', '2026-09-30')], hoy, 7)!;
    expect(r.estado).toBe('vencida');
    expect(r.dias_restantes).toBe(0);
  });

  it('congelada si la membresía en curso está congelada', () => {
    const r = resumirMembresias(
      [m('2026-10-01', '2026-12-10', { congelamientos: [{ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-10' }] })],
      hoy,
      7,
    )!;
    expect(r.estado).toBe('congelada');
  });
});

describe('congelamientos', () => {
  it('cuenta días inclusive', () => {
    expect(diasCongelamiento({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-01' })).toBe(1);
    expect(diasCongelamiento({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-15' })).toBe(15);
  });
  it('detecta traslapes', () => {
    const a = { fecha_inicio: '2026-11-01', fecha_fin: '2026-11-10' };
    expect(seTraslapan(a, { fecha_inicio: '2026-11-10', fecha_fin: '2026-11-12' })).toBe(true);
    expect(seTraslapan(a, { fecha_inicio: '2026-11-11', fecha_fin: '2026-11-12' })).toBe(false);
  });
});
