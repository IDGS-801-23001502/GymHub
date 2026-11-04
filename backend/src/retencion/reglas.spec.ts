import { describe, expect, it } from 'vitest';
import { diaYHora, mesesEntre } from '../analitica/analitica.module.js';
import { firmaValida } from '../archivos/archivos.module.js';
import { firmarEnRespuesta, firmarRuta, firmaValida as firmaUrlValida, sinFirma } from '../archivos/firma.js';
import { estadoParaAsistencia, folioDeCodigo } from '../asistencia/asistencia.module.js';
import { CONFIG_DEFECTO, detectarRiesgos } from './riesgo.service.js';
import { cumpleFiltros, type SocioSegmentable } from './segmentos.service.js';

const HOY = '2026-11-03';

describe('asistencia (CRM-RF-11)', () => {
  it('lee el folio desde el QR o escrito a mano', () => {
    expect(folioDeCodigo('GYMHUB:GH000123')).toBe('GH000123');
    expect(folioDeCodigo(' gh000045 ')).toBe('GH000045');
    expect(folioDeCodigo('Juan Pérez')).toBeNull();
    expect(folioDeCodigo('GYMHUB:XX1')).toBeNull();
  });

  it('traduce el estado de la membresía al de la asistencia', () => {
    expect(estadoParaAsistencia('activa')).toBe('vigente');
    expect(estadoParaAsistencia('por_vencer')).toBe('por_vencer');
    expect(estadoParaAsistencia('congelada')).toBe('vencida');
    expect(estadoParaAsistencia(null)).toBe('vencida');
  });
});

describe('segmentos (CRM-RF-12)', () => {
  const socio: SocioSegmentable = {
    id_sede: 1,
    objetivo: 'perder_peso',
    estado: 'activo',
    fecha_alta: '2026-01-10',
    fecha_nacimiento: '1995-06-15',
    estado_membresia: 'por_vencer',
    visitas_30: 3,
  };

  it('sin filtros incluye a los activos y excluye bajas', () => {
    expect(cumpleFiltros(socio, {}, HOY)).toBe(true);
    expect(cumpleFiltros({ ...socio, estado: 'baja' }, {}, HOY)).toBe(false);
    expect(cumpleFiltros({ ...socio, estado: 'baja' }, { incluir_bajas: true }, HOY)).toBe(true);
  });

  it('combina los filtros con AND', () => {
    expect(cumpleFiltros(socio, { estados_membresia: ['por_vencer'], sedes: [1], visitas_max: 4 }, HOY)).toBe(true);
    expect(cumpleFiltros(socio, { estados_membresia: ['por_vencer'], sedes: [2] }, HOY)).toBe(false);
    expect(cumpleFiltros(socio, { visitas_min: 4 }, HOY)).toBe(false);
    expect(cumpleFiltros(socio, { objetivos: ['ganar_masa'] }, HOY)).toBe(false);
  });

  it('filtra por edad y antigüedad', () => {
    expect(cumpleFiltros(socio, { edad_min: 31, edad_max: 31 }, HOY)).toBe(true);
    expect(cumpleFiltros(socio, { edad_max: 30 }, HOY)).toBe(false);
    expect(cumpleFiltros(socio, { antiguedad_min_dias: 365 }, HOY)).toBe(false);
    expect(cumpleFiltros(socio, { antiguedad_max_dias: 365 }, HOY)).toBe(true);
  });
});

describe('riesgo de deserción (CRM-RF-13)', () => {
  const base = { fecha_alta: '2026-01-01', ultima_visita: '2026-10-30', estado_membresia: 'activa', vigente_hasta: '2026-12-01' };

  it('sin riesgo si asiste y su membresía está vigente', () => {
    expect(detectarRiesgos(base, CONFIG_DEFECTO, HOY)).toEqual([]);
  });

  it('detecta inactividad con el umbral configurado', () => {
    const r = detectarRiesgos({ ...base, ultima_visita: '2026-10-24' }, CONFIG_DEFECTO, HOY);
    expect(r.map((x) => x.motivo)).toEqual(['inactividad']);
    expect(detectarRiesgos({ ...base, ultima_visita: '2026-10-24' }, { ...CONFIG_DEFECTO, dias_inactividad: 15 }, HOY)).toEqual([]);
  });

  it('cuenta desde el alta si nunca ha venido', () => {
    const r = detectarRiesgos({ ...base, fecha_alta: '2026-10-01', ultima_visita: null }, CONFIG_DEFECTO, HOY);
    expect(r[0].detalle).toContain('Sin visitas');
  });

  it('detecta membresía por vencer y respeta la configuración inactiva', () => {
    const s = { ...base, estado_membresia: 'por_vencer', vigente_hasta: '2026-11-06' };
    expect(detectarRiesgos(s, CONFIG_DEFECTO, HOY).map((x) => x.motivo)).toEqual(['membresia_por_vencer']);
    expect(detectarRiesgos(s, { ...CONFIG_DEFECTO, activa: false }, HOY)).toEqual([]);
  });

  it('no evalúa membresías vencidas (se atienden con campañas)', () => {
    expect(detectarRiesgos({ ...base, estado_membresia: 'vencida', ultima_visita: null }, CONFIG_DEFECTO, HOY)).toEqual([]);
  });
});

describe('analítica (CRM-RF-16, CRM-RF-17)', () => {
  it('lista los meses del periodo', () => {
    expect(mesesEntre('2025-11-15', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('ubica la visita en día y hora locales', () => {
    // 2026-11-02 lunes 13:30 UTC = 07:30 en Ciudad de México
    expect(diaYHora(new Date('2026-11-02T13:30:00Z'), 'America/Mexico_City')).toEqual({ dia: 1, hora: 7 });
  });
});

describe('archivos', () => {
  it('valida la firma real del archivo', () => {
    expect(firmaValida(Buffer.from('89504e470d0a1a0a0000', 'hex'), 'image/png')).toBe(true);
    expect(firmaValida(Buffer.from('ffd8ffe000104a46', 'hex'), 'image/jpeg')).toBe(true);
    expect(firmaValida(Buffer.from('<script>alert(1)</script>'), 'image/png')).toBe(false);
  });
});

describe('URLs firmadas de /uploads', () => {
  const ahora = Date.UTC(2026, 10, 3, 10);
  beforeAll(() => {
    process.env.ARCHIVOS_SECRET = 'secreto-de-pruebas';
  });

  it('firma rutas propias y deja intacto lo demás', () => {
    const r = firmarEnRespuesta(
      { foto_url: '/uploads/socios/a.jpg', externa: 'https://x.com/a.jpg', fecha: new Date(ahora), lista: ['/uploads/ejercicios/b.mp4'] },
      ahora,
    ) as { foto_url: string; externa: string; fecha: Date; lista: string[] };
    expect(r.foto_url).toMatch(/^\/uploads\/socios\/a\.jpg\?exp=\d+&firma=[\w-]+$/);
    expect(r.externa).toBe('https://x.com/a.jpg');
    expect(r.fecha).toBeInstanceOf(Date);
    expect(r.lista[0]).toContain('firma=');
  });

  it('acepta la firma vigente y rechaza alteradas o vencidas', () => {
    const url = new URL(firmarRuta('/uploads/socios/a.jpg', ahora), 'http://x');
    const exp = url.searchParams.get('exp')!;
    const firma = url.searchParams.get('firma')!;
    expect(firmaUrlValida('/uploads/socios/a.jpg', exp, firma, ahora)).toBe(true);
    expect(firmaUrlValida('/uploads/socios/otra.jpg', exp, firma, ahora)).toBe(false);
    expect(firmaUrlValida('/uploads/socios/a.jpg', exp, firma, Number(exp) + 1)).toBe(false);
    expect(firmaUrlValida('/uploads/socios/a.jpg', exp, undefined, ahora)).toBe(false);
  });

  it('quita la firma cuando el cliente devuelve la URL', () => {
    expect(sinFirma('/uploads/socios/a.jpg?exp=1&firma=x')).toBe('/uploads/socios/a.jpg');
    expect(sinFirma('https://x.com/a.jpg?v=2')).toBe('https://x.com/a.jpg?v=2');
  });
});
