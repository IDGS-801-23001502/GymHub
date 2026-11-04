import { BadRequestException, ConflictException } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { AuditService } from '../common/audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { crearMongoMock, cursor, type MongoMock } from '../../test/helpers/mongo-mock.js';
import { crearPrismaMock, ctxEntrenador, d, type PrismaMock } from '../../test/helpers/prisma-mock.js';
import { patronSinAcentos } from './mapeo.js';
import { PlantillasService } from './plantillas.service.js';
import { RutinasService } from './rutinas.service.js';

const SENTADILLA = new ObjectId();
const PLANCHA = new ObjectId();

const catalogo = [
  { _id: SENTADILLA, nombre: 'Sentadilla con barra', activo: true, contraindicaciones: ['evitar_rodilla'] },
  { _id: PLANCHA, nombre: 'Plancha', activo: true, contraindicaciones: [] },
];

const bloqueDoc = (id: ObjectId, nombre: string) => ({
  tipo: 'fuerza',
  orden: 1,
  ejercicios: [{ id_ejercicio: id, nombre, series: 3, repeticiones: '10', descanso_seg: 60, notas: null }],
});

const plantilla = {
  _id: new ObjectId(),
  nombre: 'Fuerza básica',
  objetivo: 'ganar_masa',
  nivel: 'principiante',
  bloques: [bloqueDoc(SENTADILLA, 'Sentadilla con barra'), { ...bloqueDoc(PLANCHA, 'Plancha'), orden: 2 }],
  activa: true,
};

const socio = { id_socio: 5, id_sede: 1, estado: 'activo', objetivo: 'ganar_masa' };

/** El catálogo responde según los filtros de `find` que usa el servicio. */
function simularCatalogo(mongo: MongoMock) {
  mongo.ejercicios.find.mockImplementation((filtro: { _id: { $in: ObjectId[] }; contraindicaciones?: { $in: string[] } }) => {
    const ids = filtro._id.$in.map(String);
    let docs = catalogo.filter((e) => ids.includes(String(e._id)));
    if (filtro.contraindicaciones) {
      docs = docs.filter((e) => e.contraindicaciones.some((c) => filtro.contraindicaciones!.$in.includes(c)));
    }
    return cursor(docs);
  });
}

describe('RutinasService', () => {
  let prisma: PrismaMock;
  let mongo: MongoMock;
  let servicio: RutinasService;
  const ctx = ctxEntrenador();

  beforeEach(() => {
    prisma = crearPrismaMock();
    mongo = crearMongoMock();
    const db = prisma as unknown as PrismaService;
    servicio = new RutinasService(db, mongo, new PlantillasService(mongo), new AuditService(db));
    prisma.socio.findUnique.mockResolvedValue(socio);
    mongo.plantillas.findOne.mockResolvedValue(plantilla);
    mongo.plantillas.find.mockImplementation(() => cursor([plantilla]));
    simularCatalogo(mongo);
    prisma.rutinaAsignada.create.mockResolvedValue({ id_rutina: 10 });
  });

  const conRestriccion = (...r: string[]) =>
    prisma.fichaSalud.findFirst.mockResolvedValue({ restricciones_rutina: JSON.stringify(r) });

  it('sugerencias marca conflictos con la ficha de salud y coincidencia de objetivo', async () => {
    conRestriccion('evitar_rodilla');
    const r = await servicio.sugerencias(5, ctx.usuario);
    expect(r.restricciones).toEqual(['evitar_rodilla']);
    expect(r.plantillas[0]).toMatchObject({
      compatible: false,
      coincide_objetivo: true,
      conflictos: [{ ejercicio: 'Sentadilla con barra', restricciones: ['evitar_rodilla'] }],
    });
  });

  it('no asigna una rutina con ejercicios contraindicados sin confirmación', async () => {
    conRestriccion('evitar_rodilla');
    await expect(
      servicio.asignar(5, { id_plantilla: String(plantilla._id), sesiones_planeadas_semana: 3 }, ctx),
    ).rejects.toThrow(ConflictException);
    expect(prisma.rutinaAsignada.create).not.toHaveBeenCalled();
  });

  it('asigna la plantilla, reemplaza la rutina vigente y guarda el contenido en Mongo', async () => {
    conRestriccion('evitar_rodilla');
    prisma.rutinaAsignada.findFirst.mockResolvedValue({ id_rutina: 4, fecha_inicio: d('2026-01-01') });

    const r = await servicio.asignar(
      5,
      { id_plantilla: String(plantilla._id), sesiones_planeadas_semana: 3, confirmar_conflictos: true },
      ctx,
    );

    expect(r).toEqual({ id_rutina: 10, numero_version: 1, reemplaza: 4 });
    expect(prisma.rutinaAsignada.update.mock.calls[0][0].data.estado).toBe('reemplazada');
    const contenido = mongo.contenidos.insertOne.mock.calls[0][0];
    expect(contenido).toMatchObject({ id_rutina: 10, numero_version: 1, nombre_plantilla: 'Fuerza básica' });
    expect(contenido.bloques).toHaveLength(2);
    expect(prisma.rutinaVersion.create.mock.calls[0][0].data.contenido_mongo_id).toBe(String(contenido._id));
    expect(prisma.interaccionSocio.create.mock.calls[0][0].data.tipo).toBe('cambio_rutina');
  });

  it('si falla SQL Server se elimina el contenido ya escrito en Mongo', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      await fn(prisma);
      throw new Error('commit fallido');
    });
    await expect(
      servicio.asignar(5, { id_plantilla: String(plantilla._id), sesiones_planeadas_semana: 3 }, ctx),
    ).rejects.toThrow('commit fallido');
    const insertado = mongo.contenidos.insertOne.mock.calls[0][0]._id;
    expect(mongo.contenidos.deleteOne).toHaveBeenCalledWith({ _id: insertado });
  });

  it('rechaza fechas de inicio pasadas y socios dados de baja', async () => {
    await expect(
      servicio.asignar(5, { id_plantilla: String(plantilla._id), sesiones_planeadas_semana: 3, fecha_inicio: '2020-01-01' }, ctx),
    ).rejects.toThrow(BadRequestException);
    prisma.socio.findUnique.mockResolvedValue({ ...socio, estado: 'baja' });
    await expect(
      servicio.asignar(5, { id_plantilla: String(plantilla._id), sesiones_planeadas_semana: 3 }, ctx),
    ).rejects.toThrow(ConflictException);
  });

  it('cada ajuste crea la siguiente versión con su motivo', async () => {
    prisma.rutinaAsignada.findUnique.mockResolvedValue({
      id_rutina: 10,
      id_socio: 5,
      estado: 'vigente',
      socio: { id_sede: 1 },
      versiones: [{ numero_version: 2, contenido_mongo_id: String(new ObjectId()) }],
    });
    prisma.rutinaVersion.findFirst.mockResolvedValue({ numero_version: 2 });
    mongo.contenidos.findOne.mockResolvedValue({ id_plantilla: plantilla._id, nombre_plantilla: 'Fuerza básica' });

    const r = await servicio.nuevaVersion(
      10,
      {
        motivo: 'Más volumen',
        bloques: [{ tipo: 'fuerza', ejercicios: [{ id_ejercicio: String(PLANCHA), series: 4, repeticiones: '45 s', descanso_seg: 30 }] }],
      },
      ctx,
    );
    expect(r.numero_version).toBe(3);
    expect(prisma.rutinaVersion.create.mock.calls[0][0].data).toMatchObject({ numero_version: 3, motivo: 'Más volumen' });
    expect(mongo.contenidos.insertOne.mock.calls[0][0]).toMatchObject({ numero_version: 3, nombre_plantilla: 'Fuerza básica' });
  });

  it('calcula la adherencia con las sesiones planeadas del periodo', async () => {
    // 3 sesiones por semana durante 14 días = 6 planeadas; 3 cumplidas = 50%
    prisma.rutinaAsignada.findMany.mockResolvedValue([
      { fecha_inicio: d('2026-10-01'), fecha_fin: null, sesiones_planeadas_semana: 3 },
    ]);
    const sesion = (completada: boolean) => ({
      id_sesion: 1n, fecha_inicio: new Date(), fecha_fin: null, duracion_min: 50, completada,
      calorias: 300, fc_promedio: 120, fc_maxima: 160, pasos: null, id_rutina: 1, version: null,
      detalle: '{"ejercicios":[]}',
    });
    prisma.sesionEntrenamiento.findMany.mockResolvedValue([sesion(true), sesion(true), sesion(true), sesion(false)]);

    const r = await servicio.seguimiento(5, ctx.usuario, '2026-10-20', '2026-11-02');
    expect(r.resumen).toMatchObject({
      sesiones_planeadas: 6,
      sesiones_cumplidas: 3,
      adherencia: 50,
      minutos_totales: 200,
      fc_promedio: 120,
    });
    await expect(servicio.seguimiento(5, ctx.usuario, '2026-11-02', '2026-10-01')).rejects.toThrow(BadRequestException);
  });
});

describe('PlantillasService.resolverBloques', () => {
  it('copia el nombre del catálogo y numera los bloques', async () => {
    const mongo = crearMongoMock();
    simularCatalogo(mongo);
    const r = await new PlantillasService(mongo).resolverBloques([
      { tipo: 'calentamiento', ejercicios: [{ id_ejercicio: String(PLANCHA), series: 1, repeticiones: '30 s', descanso_seg: 0 }] },
      { tipo: 'fuerza', ejercicios: [{ id_ejercicio: String(SENTADILLA), series: 4, repeticiones: '8-10', descanso_seg: 90 }] },
    ]);
    expect(r.map((b) => [b.orden, b.ejercicios[0]!.nombre])).toEqual([
      [1, 'Plancha'],
      [2, 'Sentadilla con barra'],
    ]);
  });

  it('rechaza ejercicios inexistentes o desactivados', async () => {
    const mongo = crearMongoMock();
    const servicio = new PlantillasService(mongo);
    const bloque = (id: ObjectId) => [{ tipo: 'fuerza' as const, ejercicios: [{ id_ejercicio: String(id), series: 3, repeticiones: '10', descanso_seg: 60 }] }];

    mongo.ejercicios.find.mockImplementation(() => cursor([]));
    await expect(servicio.resolverBloques(bloque(new ObjectId()))).rejects.toThrow(BadRequestException);

    mongo.ejercicios.find.mockImplementation(() => cursor([{ _id: PLANCHA, nombre: 'Plancha', activo: false }]));
    await expect(servicio.resolverBloques(bloque(PLANCHA))).rejects.toThrow(/desactivados: Plancha/);
  });
});

describe('patronSinAcentos', () => {
  it('ignora acentos y mayúsculas y escapa caracteres especiales', () => {
    expect(patronSinAcentos('presion').test('Press de banca (Presión)')).toBe(true);
    expect(patronSinAcentos('GLUTEO').test('Puente de glúteo')).toBe(true);
    expect(patronSinAcentos('a+b').test('a+b')).toBe(true);
  });
});
