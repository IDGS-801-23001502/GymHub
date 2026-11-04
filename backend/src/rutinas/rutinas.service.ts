import {
  Optional,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { AuditService, type ClienteDb } from '../common/audit/audit.service.js';
import type { ContextoPeticion, UsuarioAutenticado } from '../common/auth/auth.types.js';
import { exigirSede } from '../common/auth/sedes.js';
import { aFecha, aISO, diferenciaDias, hoyISO, sumarDias } from '../common/utils/fechas.js';
import { aNumero, idNumero } from '../common/utils/serializar.js';
import { Prisma } from '../generated/prisma/client.js';
import { MongoService, type BloqueDoc, type ContenidoRutinaDoc } from '../mongo/mongo.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { obtenerSocioAutorizado } from '../socios/socio-acceso.js';
import type { BloqueDto } from './dto/plantilla.dto.js';
import type { AsignarRutinaDto, FinalizarRutinaDto, NuevaVersionDto } from './dto/rutina.dto.js';
import { mapearBloques } from './mapeo.js';
import { PlantillasService } from './plantillas.service.js';

export interface Conflicto {
  id_ejercicio: string;
  ejercicio: string;
  restricciones: string[];
}

const incluirRutina = {
  entrenador: { select: { id_usuario: true, nombre: true } },
  versiones: {
    orderBy: { numero_version: 'desc' },
    include: { usuario: { select: { id_usuario: true, nombre: true } } },
  },
} satisfies Prisma.RutinaAsignadaInclude;

type RutinaCompleta = Prisma.RutinaAsignadaGetPayload<{ include: typeof incluirRutina }>;

const MAX_DIAS_SEGUIMIENTO = 366;

/**
 * Asignación, versionado y seguimiento de rutinas (CRM-RF-08 a CRM-RF-10).
 * La asignación vive en SQL Server y el contenido de cada versión en MongoDB.
 */
@Injectable()
export class RutinasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mongo: MongoService,
    private readonly plantillas: PlantillasService,
    private readonly audit: AuditService,
    @Optional() private readonly notificaciones?: NotificacionesService,
  ) {}

  private avisarRutina(idSocio: number, contenido: string) {
    void this.notificaciones
      ?.crear([idSocio], { origen: 'rutina', categoria: 'rutina', titulo: 'Tu rutina cambió', contenido })
      .catch(() => undefined);
  }

  /** Etiquetas de restricción de la ficha de salud más reciente del socio. */
  async restricciones(idSocio: number, db: ClienteDb = this.prisma): Promise<string[]> {
    const ficha = await db.fichaSalud.findFirst({
      where: { id_socio: idSocio },
      orderBy: { version: 'desc' },
      select: { restricciones_rutina: true },
    });
    return ficha?.restricciones_rutina ? (JSON.parse(ficha.restricciones_rutina) as string[]) : [];
  }

  /** Ejercicios de los bloques cuyas contraindicaciones chocan con las restricciones. */
  async conflictos(bloques: BloqueDoc[], restricciones: string[]): Promise<Conflicto[]> {
    if (!restricciones.length) return [];
    const ids = bloques.flatMap((b) => b.ejercicios.map((e) => e.id_ejercicio));
    const riesgosos = await this.mongo.ejercicios
      .find(
        { _id: { $in: ids }, contraindicaciones: { $in: restricciones } },
        { projection: { nombre: 1, contraindicaciones: 1 } },
      )
      .toArray();
    return riesgosos.map((e) => ({
      id_ejercicio: e._id.toHexString(),
      ejercicio: e.nombre,
      restricciones: e.contraindicaciones.filter((c) => restricciones.includes(c)),
    }));
  }

  /** Plantillas activas ordenadas por compatibilidad con el objetivo y la ficha del socio. */
  async sugerencias(idSocio: number, usuario: UsuarioAutenticado) {
    const socio = await obtenerSocioAutorizado(this.prisma, idSocio, usuario);
    const restricciones = await this.restricciones(idSocio);
    const plantillas = await this.mongo.plantillas.find({ activa: true }).toArray();

    const ids = plantillas.flatMap((p) => p.bloques.flatMap((b) => b.ejercicios.map((e) => e.id_ejercicio)));
    const riesgosos = restricciones.length
      ? await this.mongo.ejercicios
          .find(
            { _id: { $in: ids }, contraindicaciones: { $in: restricciones } },
            { projection: { nombre: 1, contraindicaciones: 1 } },
          )
          .toArray()
      : [];
    const porId = new Map(riesgosos.map((e) => [e._id.toHexString(), e]));

    const resultado = plantillas.map((p) => {
      const vistos = new Set<string>();
      const conflictos: Conflicto[] = [];
      for (const e of p.bloques.flatMap((b) => b.ejercicios)) {
        const r = porId.get(e.id_ejercicio.toHexString());
        if (!r || vistos.has(e.id_ejercicio.toHexString())) continue;
        vistos.add(e.id_ejercicio.toHexString());
        conflictos.push({
          id_ejercicio: r._id.toHexString(),
          ejercicio: r.nombre,
          restricciones: r.contraindicaciones.filter((c) => restricciones.includes(c)),
        });
      }
      return {
        id: p._id.toHexString(),
        nombre: p.nombre,
        objetivo: p.objetivo,
        nivel: p.nivel,
        dias_semana: p.dias_semana ?? null,
        total_ejercicios: p.bloques.reduce((n, b) => n + b.ejercicios.length, 0),
        coincide_objetivo: socio.objetivo !== null && p.objetivo === socio.objetivo,
        compatible: conflictos.length === 0,
        conflictos,
      };
    });

    resultado.sort(
      (a, b) =>
        Number(b.compatible) - Number(a.compatible) ||
        Number(b.coincide_objetivo) - Number(a.coincide_objetivo) ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );
    return { objetivo_socio: socio.objetivo, restricciones, plantillas: resultado };
  }

  async asignar(idSocio: number, dto: AsignarRutinaDto, ctx: ContextoPeticion) {
    const hoy = hoyISO();
    const inicio = dto.fecha_inicio ?? hoy;
    if (inicio < hoy) throw new BadRequestException('La fecha de inicio no puede ser anterior a hoy.');

    const socio = await obtenerSocioAutorizado(this.prisma, idSocio, ctx.usuario);
    if (socio.estado !== 'activo') {
      throw new ConflictException('El socio está dado de baja; reactívalo antes de asignarle una rutina.');
    }
    const plantilla = await this.plantillas.obtenerDoc(new ObjectId(dto.id_plantilla));
    if (!plantilla.activa) throw new ConflictException('La plantilla está desactivada.');

    // Se vuelve a validar el catálogo aunque se use la plantilla sin cambios
    const bloques = await this.plantillas.resolverBloques(dto.bloques ?? aBloquesDto(plantilla.bloques));
    await this.exigirSinConflictos(bloques, await this.restricciones(idSocio), dto.confirmar_conflictos);

    const idContenido = new ObjectId();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const anterior = await tx.rutinaAsignada.findFirst({
            where: { id_socio: idSocio, estado: 'vigente' },
          });
          if (anterior) {
            const cierre = inicio > hoy ? sumarDias(inicio, -1) : hoy;
            const inicioAnterior = aISO(anterior.fecha_inicio);
            await tx.rutinaAsignada.update({
              where: { id_rutina: anterior.id_rutina },
              data: {
                estado: 'reemplazada',
                fecha_fin: aFecha(cierre < inicioAnterior ? inicioAnterior : cierre),
              },
            });
          }
          const rutina = await tx.rutinaAsignada.create({
            data: {
              id_socio: idSocio,
              plantilla_mongo_id: plantilla._id.toHexString(),
              id_entrenador: ctx.usuario.id_usuario,
              sesiones_planeadas_semana: dto.sesiones_planeadas_semana,
              fecha_inicio: aFecha(inicio),
            },
          });
          await tx.rutinaVersion.create({
            data: {
              id_rutina: rutina.id_rutina,
              numero_version: 1,
              contenido_mongo_id: idContenido.toHexString(),
              motivo: dto.motivo ?? 'Asignación inicial',
              autor: ctx.usuario.id_usuario,
            },
          });
          await this.audit.registrar(
            ctx,
            {
              entidad: 'rutina_asignada',
              idEntidad: rutina.id_rutina,
              idSocio,
              accion: 'crear',
              nuevo: {
                plantilla: plantilla.nombre,
                fecha_inicio: inicio,
                sesiones_planeadas_semana: dto.sesiones_planeadas_semana,
                reemplaza: anterior?.id_rutina ?? null,
              },
            },
            tx,
          );
          await this.audit.interaccion(
            ctx,
            idSocio,
            'cambio_rutina',
            `Rutina "${plantilla.nombre}" asignada desde el ${inicio}` +
              (anterior ? ' (reemplaza la rutina anterior).' : '.'),
            tx,
          );
          // Último paso: si Mongo falla, la transacción de SQL Server se revierte
          await this.mongo.contenidos.insertOne({
            _id: idContenido,
            id_rutina: rutina.id_rutina,
            numero_version: 1,
            id_socio: idSocio,
            id_plantilla: plantilla._id,
            nombre_plantilla: plantilla.nombre,
            bloques,
            autor: ctx.usuario.id_usuario,
            creado_en: new Date(),
          });
          return { id_rutina: rutina.id_rutina, numero_version: 1, reemplaza: anterior?.id_rutina ?? null };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ).then((r) => {
        this.avisarRutina(idSocio, `Tu entrenador te asignó la rutina "${plantilla.nombre}". Ábrela en la app.`);
        return r;
      });
    } catch (error) {
      // Si falló el commit en SQL Server, se descarta el documento ya escrito
      await this.mongo.contenidos.deleteOne({ _id: idContenido }).catch(() => undefined);
      throw error;
    }
  }

  /** Cada ajuste crea una versión nueva; las anteriores no se modifican (CRM-RF-09). */
  async nuevaVersion(idRutina: number, dto: NuevaVersionDto, ctx: ContextoPeticion) {
    const rutina = await this.rutinaAutorizada(idRutina, ctx.usuario);
    if (rutina.estado !== 'vigente') {
      throw new ConflictException('Solo se puede ajustar la rutina vigente.');
    }
    const bloques = await this.plantillas.resolverBloques(dto.bloques);
    await this.exigirSinConflictos(bloques, await this.restricciones(rutina.id_socio), dto.confirmar_conflictos);
    const previo = await this.contenido(rutina.versiones[0]!.contenido_mongo_id);

    const idContenido = new ObjectId();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ultima = await tx.rutinaVersion.findFirst({
          where: { id_rutina: idRutina },
          orderBy: { numero_version: 'desc' },
        });
        const numero = (ultima?.numero_version ?? 0) + 1;
        await tx.rutinaVersion.create({
          data: {
            id_rutina: idRutina,
            numero_version: numero,
            contenido_mongo_id: idContenido.toHexString(),
            motivo: dto.motivo,
            autor: ctx.usuario.id_usuario,
          },
        });
        await this.audit.registrar(
          ctx,
          {
            entidad: 'rutina_asignada',
            idEntidad: idRutina,
            idSocio: rutina.id_socio,
            accion: 'modificar',
            anterior: { version: numero - 1 },
            nuevo: { version: numero, motivo: dto.motivo },
          },
          tx,
        );
        await this.audit.interaccion(
          ctx,
          rutina.id_socio,
          'cambio_rutina',
          `Rutina ajustada (versión ${numero}): ${dto.motivo}`,
          tx,
        );
        await this.mongo.contenidos.insertOne({
          _id: idContenido,
          id_rutina: idRutina,
          numero_version: numero,
          id_socio: rutina.id_socio,
          id_plantilla: previo?.id_plantilla ?? null,
          nombre_plantilla: previo?.nombre_plantilla ?? null,
          bloques,
          autor: ctx.usuario.id_usuario,
          creado_en: new Date(),
        });
        return { id_rutina: idRutina, numero_version: numero, id_socio: rutina.id_socio };
      }).then(({ id_socio, ...r }) => {
        this.avisarRutina(id_socio, `Tu entrenador ajustó tu rutina: ${dto.motivo}`);
        return r;
      });
    } catch (error) {
      await this.mongo.contenidos.deleteOne({ _id: idContenido }).catch(() => undefined);
      throw error;
    }
  }

  async finalizar(idRutina: number, dto: FinalizarRutinaDto, ctx: ContextoPeticion) {
    const rutina = await this.rutinaAutorizada(idRutina, ctx.usuario);
    if (rutina.estado !== 'vigente') throw new ConflictException('La rutina ya no está vigente.');
    const hoy = hoyISO();
    const inicio = aISO(rutina.fecha_inicio);
    await this.prisma.$transaction(async (tx) => {
      await tx.rutinaAsignada.update({
        where: { id_rutina: idRutina },
        data: { estado: 'finalizada', fecha_fin: aFecha(hoy < inicio ? inicio : hoy) },
      });
      await this.audit.registrar(
        ctx,
        {
          entidad: 'rutina_asignada',
          idEntidad: idRutina,
          idSocio: rutina.id_socio,
          accion: 'modificar',
          anterior: { estado: 'vigente' },
          nuevo: { estado: 'finalizada', motivo: dto.motivo ?? null },
        },
        tx,
      );
      await this.audit.interaccion(
        ctx,
        rutina.id_socio,
        'cambio_rutina',
        `Rutina finalizada${dto.motivo ? `: ${dto.motivo}` : '.'}`,
        tx,
      );
    });
    return { id_rutina: idRutina, estado: 'finalizada' };
  }

  /** Rutina vigente con su contenido actual e historial de rutinas del socio. */
  async deSocio(idSocio: number, usuario: UsuarioAutenticado | null) {
    await obtenerSocioAutorizado(this.prisma, idSocio, usuario);
    const rutinas = await this.prisma.rutinaAsignada.findMany({
      where: { id_socio: idSocio },
      include: incluirRutina,
      orderBy: [{ creada_en: 'desc' }, { id_rutina: 'desc' }],
    });
    const contenidos = await this.mongo.contenidos
      .find({ _id: { $in: rutinas.map((r) => new ObjectId(r.versiones[0]!.contenido_mongo_id)) } })
      .toArray();
    const porId = new Map(contenidos.map((c) => [c._id.toHexString(), c]));

    const vigente = rutinas.find((r) => r.estado === 'vigente');
    return {
      vigente: vigente
        ? {
            ...this.resumir(vigente, porId.get(vigente.versiones[0]!.contenido_mongo_id)),
            bloques: mapearBloques(porId.get(vigente.versiones[0]!.contenido_mongo_id)?.bloques ?? []),
          }
        : null,
      historial: rutinas.map((r) => this.resumir(r, porId.get(r.versiones[0]!.contenido_mongo_id))),
    };
  }

  async versiones(idRutina: number, usuario: UsuarioAutenticado) {
    const rutina = await this.rutinaAutorizada(idRutina, usuario);
    return rutina.versiones.map((v) => ({
      numero_version: v.numero_version,
      fecha: v.fecha,
      motivo: v.motivo,
      autor: v.usuario,
    }));
  }

  async version(idRutina: number, numero: number, usuario: UsuarioAutenticado) {
    const rutina = await this.rutinaAutorizada(idRutina, usuario);
    const v = rutina.versiones.find((x) => x.numero_version === numero);
    if (!v) throw new NotFoundException('Versión no encontrada.');
    const contenido = await this.contenido(v.contenido_mongo_id);
    if (!contenido) throw new NotFoundException('El contenido de esta versión no está disponible.');
    return {
      id_rutina: idRutina,
      numero_version: numero,
      fecha: v.fecha,
      motivo: v.motivo,
      autor: v.usuario,
      nombre_plantilla: contenido.nombre_plantilla,
      bloques: mapearBloques(contenido.bloques),
    };
  }

  /**
   * Sesiones registradas desde la app y adherencia del periodo (CRM-RF-10):
   * sesiones completadas frente a las planeadas por las rutinas vigentes en esas fechas.
   */
  async seguimiento(idSocio: number, usuario: UsuarioAutenticado | null, desde?: string, hasta?: string) {
    await obtenerSocioAutorizado(this.prisma, idSocio, usuario);
    const fin = hasta ?? hoyISO();
    const ini = desde ?? sumarDias(fin, -29);
    if (ini > fin) throw new BadRequestException('"desde" debe ser anterior o igual a "hasta".');
    if (diferenciaDias(ini, fin) >= MAX_DIAS_SEGUIMIENTO) {
      throw new BadRequestException('El periodo máximo es de 12 meses.');
    }

    const [sesiones, rutinas] = await Promise.all([
      this.prisma.sesionEntrenamiento.findMany({
        where: {
          id_socio: idSocio,
          fecha_inicio: { gte: aFecha(ini), lt: aFecha(sumarDias(fin, 1)) },
        },
        include: { version: { select: { numero_version: true } } },
        orderBy: { fecha_inicio: 'desc' },
      }),
      this.prisma.rutinaAsignada.findMany({
        where: {
          id_socio: idSocio,
          fecha_inicio: { lte: aFecha(fin) },
          OR: [{ fecha_fin: null }, { fecha_fin: { gte: aFecha(ini) } }],
        },
      }),
    ]);

    const planeadas = Math.round(
      rutinas.reduce((total, r) => {
        const desdeR = maxISO(ini, aISO(r.fecha_inicio));
        const hastaR = r.fecha_fin ? minISO(fin, aISO(r.fecha_fin)) : fin;
        const dias = diferenciaDias(desdeR, hastaR) + 1;
        return total + (dias > 0 ? (r.sesiones_planeadas_semana * dias) / 7 : 0);
      }, 0),
    );
    const cumplidas = sesiones.filter((s) => s.completada).length;
    const conFc = sesiones.filter((s) => s.fc_promedio !== null);

    return {
      desde: ini,
      hasta: fin,
      resumen: {
        sesiones_planeadas: planeadas,
        sesiones_cumplidas: cumplidas,
        adherencia: planeadas > 0 ? Math.min(100, Math.round((cumplidas / planeadas) * 100)) : null,
        minutos_totales: sesiones.reduce((t, s) => t + (s.duracion_min ?? 0), 0),
        calorias_totales: Math.round(sesiones.reduce((t, s) => t + (s.calorias ? aNumero(s.calorias) : 0), 0)),
        fc_promedio: conFc.length
          ? Math.round(conFc.reduce((t, s) => t + s.fc_promedio!, 0) / conFc.length)
          : null,
      },
      sesiones: sesiones.map((s) => ({
        id_sesion: idNumero(s.id_sesion),
        fecha_inicio: s.fecha_inicio,
        fecha_fin: s.fecha_fin,
        duracion_min: s.duracion_min,
        completada: s.completada,
        calorias: s.calorias ? aNumero(s.calorias) : null,
        fc_promedio: s.fc_promedio,
        fc_maxima: s.fc_maxima,
        pasos: s.pasos,
        id_rutina: s.id_rutina,
        numero_version: s.version?.numero_version ?? null,
        detalle: parsearDetalle(s.detalle),
      })),
    };
  }

  private async rutinaAutorizada(idRutina: number, usuario: UsuarioAutenticado): Promise<RutinaCompleta> {
    const rutina = await this.prisma.rutinaAsignada.findUnique({
      where: { id_rutina: idRutina },
      include: { ...incluirRutina, socio: { select: { id_sede: true } } },
    });
    if (!rutina) throw new NotFoundException('Rutina no encontrada.');
    exigirSede(usuario, rutina.socio.id_sede);
    return rutina;
  }

  private contenido(id: string): Promise<ContenidoRutinaDoc | null> {
    return this.mongo.contenidos.findOne({ _id: new ObjectId(id) });
  }

  private async exigirSinConflictos(bloques: BloqueDoc[], restricciones: string[], confirmado?: boolean) {
    const conflictos = await this.conflictos(bloques, restricciones);
    if (conflictos.length && !confirmado) {
      const detalle = conflictos.map((c) => `${c.ejercicio} (${c.restricciones.join(', ')})`).join('; ');
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `La rutina incluye ejercicios contraindicados por la ficha de salud: ${detalle}. Ajústala o confirma que la revisaste.`,
        conflictos,
      });
    }
  }

  private resumir(r: RutinaCompleta, contenido: ContenidoRutinaDoc | undefined) {
    const actual = r.versiones[0]!;
    return {
      id_rutina: r.id_rutina,
      estado: r.estado,
      plantilla: { id: r.plantilla_mongo_id, nombre: contenido?.nombre_plantilla ?? null },
      entrenador: r.entrenador,
      sesiones_planeadas_semana: r.sesiones_planeadas_semana,
      fecha_inicio: aISO(r.fecha_inicio),
      fecha_fin: r.fecha_fin ? aISO(r.fecha_fin) : null,
      total_versiones: r.versiones.length,
      version_actual: {
        numero_version: actual.numero_version,
        fecha: actual.fecha,
        motivo: actual.motivo,
        autor: actual.usuario,
      },
    };
  }
}

function aBloquesDto(bloques: BloqueDoc[]): BloqueDto[] {
  return bloques.map((b) => ({
    tipo: b.tipo as BloqueDto['tipo'],
    ejercicios: b.ejercicios.map((e) => ({
      id_ejercicio: e.id_ejercicio.toHexString(),
      series: e.series,
      repeticiones: e.repeticiones,
      descanso_seg: e.descanso_seg,
      ...(e.notas && { notas: e.notas }),
    })),
  }));
}

const maxISO = (a: string, b: string) => (a > b ? a : b);
const minISO = (a: string, b: string) => (a < b ? a : b);

function parsearDetalle(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
