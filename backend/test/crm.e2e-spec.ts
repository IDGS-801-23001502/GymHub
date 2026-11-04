/**
 * Recorrido de los módulos de asistencia, retención, analítica y administración contra la base
 * de prueba (ver test/entorno-e2e.ts). Usa los usuarios y socios que trae la copia de la base.
 */
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const CLAVE = 'PruebaE2E#2026';
const marca = Date.now().toString(36);
// PNG de 1×1 píxel
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

describe('CRM (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const tokens: Record<'admin' | 'recepcion' | 'entrenador', string> = { admin: '', recepcion: '', entrenador: '' };
  const como = (rol: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[rol]}` });

  async function login(correo: string, password = CLAVE) {
    const r = await http.post('/auth/login').send({ correo, password });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body.access_token as string;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(modulo.createNestApplication<NestExpressApplication>());
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    // Contraseña conocida solo en la base de prueba
    const hash = await bcrypt.hash(CLAVE, 4);
    await prisma.usuario.updateMany({
      where: { correo: { in: ['admin@gymhub.dev', 'recepcion@gymhub.dev', 'entrenador@gymhub.dev'] } },
      data: { password_hash: hash, intentos_fallidos: 0, bloqueado_hasta: null, activo: true },
    });
    tokens.admin = await login('admin@gymhub.dev');
    tokens.recepcion = await login('recepcion@gymhub.dev');
    tokens.entrenador = await login('entrenador@gymhub.dev');
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('sesiones del personal (CRM-RF-18)', () => {
    it('cerrar sesión revoca el token en el servidor', async () => {
      const t = await login('admin@gymhub.dev');
      expect((await http.get('/auth/me').set('Authorization', `Bearer ${t}`)).status).toBe(200);
      expect((await http.post('/auth/logout').set('Authorization', `Bearer ${t}`)).status).toBe(200);
      expect((await http.get('/auth/me').set('Authorization', `Bearer ${t}`)).status).toBe(401);
    });

    it('respeta los roles', async () => {
      expect((await http.get('/usuarios').set(como('entrenador'))).status).toBe(403);
      expect((await http.get('/analitica/panel').set(como('recepcion'))).status).toBe(403);
      expect((await http.get('/asistencia').set(como('entrenador'))).status).toBe(403);
      expect((await http.get('/riesgo').set(como('recepcion'))).status).toBe(200);
    });
  });

  describe('usuarios y sedes (CRM-RF-18, CRM-RF-19)', () => {
    it('crea un usuario, rechaza contraseñas débiles y revoca sesiones al cambiar el rol', async () => {
      const correo = `e2e.${marca}@gymhub.dev`;
      const debil = await http.post('/usuarios').set(como('admin')).send({ nombre: 'E2E', correo, password: 'corta', rol: 'recepcionista', sedes: [1] });
      expect(debil.status).toBe(400);

      const r = await http.post('/usuarios').set(como('admin')).send({ nombre: `E2E ${marca}`, correo, password: CLAVE, rol: 'recepcionista', sedes: [1] });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ correo, rol: 'recepcionista', activo: true });
      expect(r.body.password_hash).toBeUndefined();
      expect((await http.post('/usuarios').set(como('admin')).send({ nombre: 'E2E', correo, password: CLAVE, rol: 'recepcionista', sedes: [1] })).status).toBe(409);

      const t = await login(correo);
      expect((await http.get('/auth/me').set('Authorization', `Bearer ${t}`)).status).toBe(200);
      const cambio = await http.patch(`/usuarios/${r.body.id_usuario}`).set(como('admin')).send({ rol: 'entrenador' });
      expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
      expect((await http.get('/auth/me').set('Authorization', `Bearer ${t}`)).status).toBe(401);

      const sesiones = await http.get(`/usuarios/${r.body.id_usuario}/sesiones`).set(como('admin'));
      expect(sesiones.body.every((s: { activa: boolean }) => !s.activa)).toBe(true);
      expect((await http.patch(`/usuarios/${r.body.id_usuario}`).set(como('admin')).send({ activo: false })).status).toBe(200);
    });

    it('crea y edita una sede con horario', async () => {
      const r = await http
        .post('/sedes-admin')
        .set(como('admin'))
        .send({ nombre: `Sede E2E ${marca}`, telefono: '5512345678', horarios: [{ dia_semana: 1, hora_apertura: '06:00', hora_cierre: '22:00' }] });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const lista = await http.get('/sedes-admin').set(como('admin'));
      const sede = lista.body.find((s: { nombre: string }) => s.nombre === `Sede E2E ${marca}`);
      expect(sede.horarios[0]).toMatchObject({ dia_semana: 1, hora_apertura: '06:00', hora_cierre: '22:00' });

      const e = await http
        .patch(`/sedes-admin/${sede.id_sede}`)
        .set(como('admin'))
        .send({ activa: false, horarios: [{ dia_semana: 6, hora_apertura: '08:00', hora_cierre: '14:00' }] });
      expect(e.status, JSON.stringify(e.body)).toBe(200);
      expect(e.body.horarios).toHaveLength(1);
      expect(e.body.activa).toBe(false);
    });
  });

  describe('asistencia (CRM-RF-11)', () => {
    it('busca por folio y por nombre', async () => {
      const f = await http.get('/asistencia/buscar?q=GYMHUB:GH000001').set(como('recepcion'));
      expect(f.status).toBe(200);
      expect(f.body[0]).toMatchObject({ id_socio: 1, folio: 'GH000001' });
      const n = await http.get(`/asistencia/buscar?q=${encodeURIComponent('Laura')}`).set(como('recepcion'));
      expect(n.body.some((s: { id_socio: number }) => s.id_socio === 1)).toBe(true);
    });

    it('registra la entrada por QR, no duplica y la muestra en el día y en el socio', async () => {
      const r = await http.post('/asistencia').set(como('recepcion')).send({ id_sede: 1, codigo: 'GYMHUB:GH000001' });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(['ok', 'aviso', 'error']).toContain(r.body.alerta);
      expect(r.body.socio.folio).toBe('GH000001');

      const otra = await http.post('/asistencia').set(como('recepcion')).send({ id_sede: 1, id_socio: 1 });
      expect(otra.body.duplicada).toBe(true);
      expect(otra.body.id_asistencia).toBe(r.body.id_asistencia);

      const dia = await http.get('/asistencia?id_sede=1').set(como('recepcion'));
      expect(dia.body.registros.some((x: { id_asistencia: number }) => x.id_asistencia === r.body.id_asistencia)).toBe(true);
      const socio = await http.get('/socios/1/asistencias').set(como('recepcion'));
      expect(socio.body.visitas_30_dias).toBeGreaterThanOrEqual(1);
    });

    it('rechaza códigos ajenos y sedes que no son del usuario', async () => {
      expect((await http.post('/asistencia').set(como('recepcion')).send({ id_sede: 1, codigo: 'hola' })).status).toBe(400);
      const usuario = await http.get('/auth/me').set(como('recepcion'));
      const ajena = [1, 2].find((s) => !usuario.body.sedes.some((x: { id_sede: number }) => x.id_sede === s));
      if (ajena) expect((await http.post('/asistencia').set(como('recepcion')).send({ id_sede: ajena, id_socio: 1 })).status).toBe(403);
    });
  });

  describe('retención (CRM-RF-12 a CRM-RF-15)', () => {
    it('agrega notas a la línea de tiempo', async () => {
      const r = await http.post('/socios/1/interacciones').set(como('recepcion')).send({ tipo: 'nota', descripcion: `Nota e2e ${marca}` });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const lista = await http.get('/socios/1/interacciones?tipo=nota').set(como('entrenador'));
      expect(lista.body.some((i: { descripcion: string }) => i.descripcion === `Nota e2e ${marca}`)).toBe(true);
    });

    let idSegmento = 0;
    it('segmentos: vista previa, alta, nombre único, socios y CSV', async () => {
      const vista = await http.post('/segmentos/previsualizar').set(como('admin')).send({ sedes: [1], visitas_min: 1 });
      expect(vista.status, JSON.stringify(vista.body)).toBe(200);
      expect(vista.body.socios.some((s: { id_socio: number }) => s.id_socio === 1)).toBe(true);
      expect((await http.post('/segmentos/previsualizar').set(como('admin')).send({ edad_min: 50, edad_max: 20 })).status).toBe(400);

      const nombre = `Segmento e2e ${marca}`;
      const r = await http.post('/segmentos').set(como('admin')).send({ nombre, filtros: { sedes: [1] } });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      idSegmento = r.body.id_segmento;
      expect((await http.post('/segmentos').set(como('admin')).send({ nombre, filtros: {} })).status).toBe(409);

      const socios = await http.get(`/segmentos/${idSegmento}/socios`).set(como('admin'));
      expect(socios.body.socios.length).toBeGreaterThanOrEqual(1);
      const csv = await http.get(`/segmentos/${idSegmento}/exportar`).set(como('admin'));
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Folio');
      expect(csv.text).not.toMatch(/@|correo|tel[eé]fono/i);
    });

    it('riesgo: configura la regla, evalúa y registra una acción', async () => {
      const cfg = await http.put('/riesgo/config').set(como('admin')).send({ dias_inactividad: 10, dias_aviso_vencimiento: 7, activa: true });
      expect(cfg.status, JSON.stringify(cfg.body)).toBe(200);
      expect(cfg.body.global).toMatchObject({ dias_inactividad: 10 });

      const ev = await http.post('/riesgo/evaluar').set(como('admin'));
      expect(ev.status, JSON.stringify(ev.body)).toBe(200);
      expect(ev.body.evaluados).toBeGreaterThan(0);
      // Repetirla no duplica casos
      expect((await http.post('/riesgo/evaluar').set(como('admin'))).body.nuevos).toBe(0);

      const tablero = await http.get('/riesgo').set(como('recepcion'));
      expect(tablero.status).toBe(200);
      if (tablero.body.length) {
        const caso = tablero.body[0];
        const a = await http.post(`/riesgo/${caso.id_riesgo}/acciones`).set(como('recepcion')).send({ tipo_accion: 'llamada', descripcion: 'Llamada e2e', estado: 'atendido' });
        expect(a.status, JSON.stringify(a.body)).toBe(201);
        expect(a.body.estado).toBe('atendido');
        expect(a.body.acciones[0].tipo_accion).toBe('llamada');
      }
    });

    it('campañas: inmediata a un segmento, programada y cancelada', async () => {
      const inm = await http
        .post('/campanas')
        .set(como('admin'))
        .send({ titulo: `Promo e2e ${marca}`, contenido: 'Hola', categoria: 'promociones', tipo_destino: 'segmento', id_segmento: idSegmento, modo_envio: 'inmediato' });
      expect(inm.status, JSON.stringify(inm.body)).toBe(201);
      expect(inm.body.estado).toBe('enviada');

      const prog = await http
        .post('/campanas')
        .set(como('admin'))
        .send({
          titulo: 'Programada e2e',
          contenido: 'Mañana',
          categoria: 'avisos',
          tipo_destino: 'socio',
          id_socio_destino: 4,
          modo_envio: 'programado',
          programada_para: new Date(Date.now() + 86_400_000).toISOString(),
        });
      expect(prog.status, JSON.stringify(prog.body)).toBe(201);
      expect(prog.body.estado).toBe('programada');
      expect((await http.post(`/campanas/${prog.body.id_campana}/cancelar`).set(como('admin'))).body.estado).toBe('cancelada');
      expect((await http.post(`/campanas/${prog.body.id_campana}/cancelar`).set(como('admin'))).status).toBe(409);

      const pasada = await http
        .post('/campanas')
        .set(como('admin'))
        .send({ titulo: 'x', contenido: 'x', categoria: 'avisos', tipo_destino: 'socio', id_socio_destino: 4, modo_envio: 'programado', programada_para: '2020-01-01T00:00:00Z' });
      expect(pasada.status).toBe(400);
    });

    it('el segmento con campañas no se puede borrar', async () => {
      expect((await http.delete(`/segmentos/${idSegmento}`).set(como('admin'))).status).toBe(409);
    });
  });

  describe('analítica (CRM-RF-16, CRM-RF-17)', () => {
    it('panel y reportes responden en menos de 5 s (CRM-RNF-05)', async () => {
      let inicio = Date.now();
      const panel = await http.get('/analitica/panel').set(como('admin'));
      expect(panel.status, JSON.stringify(panel.body)).toBe(200);
      expect(Date.now() - inicio).toBeLessThan(5000);
      expect(panel.body.indicadores.socios_activos).toBeGreaterThan(0);
      expect(panel.body.indicadores.asistencia_hoy).toBeGreaterThanOrEqual(1);

      inicio = Date.now();
      const rep = await http.get('/analitica/reportes').set(como('admin'));
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(Date.now() - inicio).toBeLessThan(5000);
      expect(rep.body.horas_pico).toHaveLength(7);
      expect(rep.body.horas_pico[0]).toHaveLength(24);
      expect(rep.body.horas_pico.flat().reduce((a: number, b: number) => a + b, 0)).toBeGreaterThanOrEqual(1);
    });

    it('valida el periodo', async () => {
      expect((await http.get('/analitica/reportes?desde=2026-05-01&hasta=2026-01-01').set(como('admin'))).status).toBe(400);
      expect((await http.get('/analitica/reportes?desde=2024-01-01&hasta=2026-01-01').set(como('admin'))).status).toBe(400);
    });
  });

  describe('bitácora y ARCO (CRM-RF-20, CRM-RNF-02)', () => {
    it('la bitácora muestra la asistencia registrada', async () => {
      const r = await http.get('/bitacora?entidad=asistencia&por_pagina=5').set(como('admin'));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.total).toBeGreaterThanOrEqual(1);
      expect(r.body.registros[0].usuario.nombre).toBeTruthy();
    });

    it('registra, atiende y exporta una solicitud de acceso', async () => {
      const r = await http.post('/socios/1/solicitudes-arco').set(como('recepcion')).send({ tipo: 'acceso', descripcion: `ARCO e2e ${marca}` });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect((await http.patch(`/solicitudes-arco/${r.body.id_solicitud}`).set(como('recepcion')).send({ estado: 'atendida' })).status).toBe(403);
      const a = await http.patch(`/solicitudes-arco/${r.body.id_solicitud}`).set(como('admin')).send({ estado: 'atendida' });
      expect(a.status, JSON.stringify(a.body)).toBe(200);
      const datos = await http.get('/socios/1/datos-personales').set(como('admin'));
      expect(datos.status).toBe(200);
      expect(datos.body.socio.folio).toBe('GH000001');
      expect((await http.get('/socios/1/datos-personales').set(como('recepcion'))).status).toBe(403);
    });
  });

  describe('archivos', () => {
    it('sube la foto, la firma y solo la sirve con firma vigente', async () => {
      const r = await http.post('/archivos/socios/1/foto').set(como('recepcion')).attach('archivo', PNG, { filename: 'foto.png', contentType: 'image/png' });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.foto_url).toMatch(/^\/uploads\/socios\/[\w-]+\.png\?exp=\d+&firma=/);

      expect((await http.get(r.body.foto_url)).status).toBe(200);
      expect((await http.get(r.body.foto_url.split('?')[0])).status).toBe(403);
      expect((await http.get(r.body.foto_url.replace(/firma=./, 'firma=X'))).status).toBe(403);

      const socio = await http.get('/socios/1').set(como('recepcion'));
      expect(socio.body.foto_url).toContain('firma=');
      // En la BD se guarda sin firma
      const fila = await prisma.socio.findUnique({ where: { id_socio: 1 }, select: { foto_url: true } });
      expect(fila?.foto_url).toMatch(/^\/uploads\/socios\/[\w-]+\.png$/);
    });

    it('rechaza archivos que no son imagen aunque digan serlo', async () => {
      const r = await http
        .post('/archivos/socios/1/foto')
        .set(como('recepcion'))
        .attach('archivo', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
      expect(r.status).toBe(400);
    });

    it('acepta de vuelta la URL firmada de un ejercicio sin guardar la firma', async () => {
      const sub = await http.post('/archivos/ejercicios').set(como('entrenador')).attach('archivo', PNG, { filename: 'e.png', contentType: 'image/png' });
      expect(sub.status, JSON.stringify(sub.body)).toBe(201);
      const e = await http
        .post('/ejercicios')
        .set(como('entrenador'))
        .send({ nombre: `Ejercicio e2e ${marca}`, grupo_muscular: 'pierna', equipo: 'ninguno', media_url: sub.body.media_url, media_tipo: 'imagen', contraindicaciones: [] });
      expect(e.status, JSON.stringify(e.body)).toBe(201);
      expect(e.body.media_url).toContain('firma=');
      const id = e.body.id ?? e.body._id;
      const ed = await http.patch(`/ejercicios/${id}`).set(como('entrenador')).send({ media_url: e.body.media_url });
      expect(ed.status, JSON.stringify(ed.body)).toBe(200);
      expect((await http.patch(`/ejercicios/${id}/estado`).set(como('entrenador')).send({ activo: false })).status).toBe(200);
    });
  });

  describe('membresías', () => {
    it('anula un congelamiento que aún no empieza y devuelve los días', async () => {
      const h = await http.get('/socios/1/membresias').set(como('recepcion'));
      const hoy = new Date().toISOString().slice(0, 10);
      const m = (h.body.membresias as { id_membresia: number; estado: string; fecha_vencimiento: string }[]).find(
        (x) => (x.estado === 'activa' || x.estado === 'por_vencer') && x.fecha_vencimiento > hoy,
      );
      if (!m) return;
      const d = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
      const c = await http.post(`/membresias/${m.id_membresia}/congelamientos`).set(como('recepcion')).send({ fecha_inicio: d(1), fecha_fin: d(3), motivo: 'e2e' });
      expect(c.status, JSON.stringify(c.body)).toBe(201);
      const h2 = await http.get('/socios/1/membresias').set(como('recepcion'));
      const cong = h2.body.membresias
        .find((x: { id_membresia: number }) => x.id_membresia === m.id_membresia)
        .congelamientos.find((x: { fecha_inicio: string }) => x.fecha_inicio === d(1));
      const t = await http.post(`/congelamientos/${cong.id_congelamiento}/terminar`).set(como('recepcion'));
      expect(t.status, JSON.stringify(t.body)).toBe(200);
      expect(t.body).toMatchObject({ anulado: true, dias_devueltos: cong.dias_extendidos });
      expect(t.body.fecha_vencimiento).toBe(m.fecha_vencimiento);
    });
  });

  describe('app del socio', () => {
    it('consulta sus visitas y confirma la entrega de una notificación', async () => {
      const jwt = app.get(JwtService);
      const token = await jwt.signAsync({ sub: 4, tipo: 'socio' });
      const v = await http.get('/app/asistencias').set('Authorization', `Bearer ${token}`);
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      expect(v.body).toHaveProperty('visitas_30_dias');

      const n = await prisma.notificacion.create({
        data: { id_socio: 4, origen: 'campana', categoria: 'avisos', titulo: 'e2e', contenido: 'e2e', estado: 'enviado', enviada_en: new Date() },
      });
      const e = await http.patch(`/app/notificaciones/${n.id_notificacion}/entregada`).set('Authorization', `Bearer ${token}`);
      expect(e.status, JSON.stringify(e.body)).toBe(200);
      expect(e.body.actualizada).toBe(true);
      // Otro socio no puede marcarla
      const ajeno = await jwt.signAsync({ sub: 5, tipo: 'socio' });
      expect((await http.patch(`/app/notificaciones/${n.id_notificacion}/entregada`).set('Authorization', `Bearer ${ajeno}`)).body.actualizada).toBe(false);
      // Un token de socio no abre rutas del CRM
      expect((await http.get('/asistencia').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });
  });
});
