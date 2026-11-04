import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ContextoSocio } from '../common/auth/auth.types.js';
import { aFecha, aISO, diferenciaDias, hoyISO, sumarDias } from '../common/utils/fechas.js';
import { aNumero, idNumero } from '../common/utils/serializar.js';
import { FichaSaludService } from '../ficha-salud/ficha-salud.service.js';
import type { GuardarFichaSaludDto } from '../ficha-salud/dto/ficha-salud.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { MembresiasService } from '../membresias/membresias.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RutinasService } from '../rutinas/rutinas.service.js';
import type { ActualizarPerfilAppDto } from '../socios/dto/socio.dto.js';
import { SociosService } from '../socios/socios.service.js';
import {
  CATEGORIAS_NOTIFICACION,
  TIPOS_CONSENTIMIENTO_APP,
  type ConsentimientoDto,
  type PreferenciasDto,
  type RegistrarSesionDto,
  type SincronizarSaludDto,
} from './dto/app.dto.js';

const MAX_SEMANAS_PROGRESO = 52;
const LOTE_INSERCION = 200;

type RutinaPeriodo = { fecha_inicio: Date; fecha_fin: Date | null; sesiones_planeadas_semana: number };

/** Sesiones planeadas en [ini, fin] según las rutinas vigentes en esas fechas. */
export function sesionesPlaneadas(rutinas: RutinaPeriodo[], ini: string, fin: string): number {
  const total = rutinas.reduce((suma, r) => {
    const desde = aISO(r.fecha_inicio) > ini ? aISO(r.fecha_inicio) : ini;
    const hasta = r.fecha_fin && aISO(r.fecha_fin) < fin ? aISO(r.fecha_fin) : fin;
    const dias = diferenciaDias(desde, hasta) + 1;
    return suma + (dias > 0 ? (r.sesiones_planeadas_semana * dias) / 7 : 0);
  }, 0);
  return Math.round(total);
}

/** Lunes de la semana de `fecha` (YYYY-MM-DD). */
export function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return sumarDias(fecha, dia === 0 ? -6 : 1 - dia);
}

/** Lo que el socio consulta y registra desde la app móvil. */
@Injectable()
export class AppSocioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socios: SociosService,
    private readonly membresias: MembresiasService,
    private readonly rutinas: RutinasService,
    private readonly fichas: FichaSaludService,
  ) {}

  async perfil(ctx: ContextoSocio) {
    const [detalle, sede] = await Promise.all([
      this.socios.obtener(ctx.socio.id_socio, ctx),
      this.prisma.socio.findUnique({
        where: { id_socio: ctx.socio.id_socio },
        select: { sede: { select: { id_sede: true, nombre: true } } },
      }),
    ]);
    return { ...detalle, sede: sede?.sede ?? null };
  }

  actualizarPerfil(dto: ActualizarPerfilAppDto, ctx: ContextoSocio) {
    return this.socios.actualizar(ctx.socio.id_socio, dto, ctx);
  }

  /** Plan, vigencia e historial de pagos (APP-RF-04). Solo consulta. */
  membresia(ctx: ContextoSocio) {
    return this.membresias.historial(ctx.socio.id_socio, null);
  }

  /** Datos para la credencial digital con QR (APP-RF-05). */
  async credencial(ctx: ContextoSocio) {
    const p = await this.perfil(ctx);
    const estado = p.membresia?.estado ?? 'sin_membresia';
    return {
      folio: p.folio,
      nombre: p.nombre,
      foto_url: p.foto_url,
      sede: p.sede?.nombre ?? null,
      estado_membresia: estado,
      vigente_hasta: p.membresia?.vigente_hasta ?? null,
      // Recepción busca al socio por folio al escanearlo (CRM-RF-11)
      qr: `GYMHUB:${p.folio}`,
      valida: estado === 'activa' || estado === 'por_vencer',
    };
  }

  async rutina(ctx: ContextoSocio) {
    const { vigente } = await this.rutinas.deSocio(ctx.socio.id_socio, null);
    return { vigente };
  }

  historial(ctx: ContextoSocio, desde?: string, hasta?: string) {
    return this.rutinas.seguimiento(ctx.socio.id_socio, null, desde, hasta);
  }

  /** Guarda una sesión de la app. Reenviar el mismo `uuid_cliente` devuelve la ya guardada. */
  async registrarSesion(dto: RegistrarSesionDto, ctx: ContextoSocio) {
    const idSocio = ctx.socio.id_socio;
    const previa = await this.prisma.sesionEntrenamiento.findUnique({ where: { uuid_cliente: dto.uuid_cliente } });
    if (previa) {
      if (previa.id_socio !== idSocio) throw new BadRequestException('uuid_cliente ya está en uso.');
      return { id_sesion: idNumero(previa.id_sesion), duplicada: true };
    }

    const inicio = new Date(dto.fecha_inicio);
    const fin = dto.fecha_fin ? new Date(dto.fecha_fin) : null;
    if (inicio.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('La sesión no puede ser futura.');
    if (fin && fin < inicio) throw new BadRequestException('fecha_fin debe ser posterior a fecha_inicio.');

    const rutina = dto.id_rutina
      ? await this.prisma.rutinaAsignada.findFirst({ where: { id_rutina: dto.id_rutina, id_socio: idSocio } })
      : await this.prisma.rutinaAsignada.findFirst({ where: { id_socio: idSocio, estado: 'vigente' } });
    if (dto.id_rutina && !rutina) throw new NotFoundException('Rutina no encontrada.');
    const version = rutina
      ? await this.prisma.rutinaVersion.findFirst({
          where: { id_rutina: rutina.id_rutina, ...(dto.numero_version && { numero_version: dto.numero_version }) },
          orderBy: { numero_version: 'desc' },
        })
      : null;

    try {
      const sesion = await this.prisma.sesionEntrenamiento.create({
        data: {
          id_socio: idSocio,
          id_rutina: rutina?.id_rutina ?? null,
          id_version: version?.id_version ?? null,
          uuid_cliente: dto.uuid_cliente,
          fecha_inicio: inicio,
          fecha_fin: fin,
          duracion_min: dto.duracion_min ?? (fin ? Math.round((fin.getTime() - inicio.getTime()) / 60_000) : null),
          detalle: JSON.stringify({ ejercicios: dto.ejercicios }),
          calorias: dto.calorias ?? null,
          fc_promedio: dto.fc_promedio ?? null,
          fc_maxima: dto.fc_maxima ?? null,
          pasos: dto.pasos ?? null,
          completada: dto.completada,
        },
      });
      return { id_sesion: idNumero(sesion.id_sesion), duplicada: false };
    } catch (error) {
      // Dos reintentos simultáneos: el segundo choca con el UNIQUE de uuid_cliente
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existente = await this.prisma.sesionEntrenamiento.findUnique({ where: { uuid_cliente: dto.uuid_cliente } });
        if (existente?.id_socio === idSocio) return { id_sesion: idNumero(existente.id_sesion), duplicada: true };
      }
      throw error;
    }
  }

  /** Adherencia semanal y mensual, calorías, FC por sesión y rachas (APP-RF-15). */
  async progreso(ctx: ContextoSocio, desde?: string, hasta?: string) {
    const idSocio = ctx.socio.id_socio;
    const fin = hasta ?? hoyISO();
    const ini = lunesDe(desde ?? sumarDias(fin, -7 * 11));
    if (ini > fin) throw new BadRequestException('"desde" debe ser anterior o igual a "hasta".');
    if (diferenciaDias(ini, fin) > MAX_SEMANAS_PROGRESO * 7) throw new BadRequestException('El periodo máximo es de 12 meses.');

    const [sesiones, rutinas] = await Promise.all([
      this.prisma.sesionEntrenamiento.findMany({
        where: { id_socio: idSocio, fecha_inicio: { gte: aFecha(ini), lt: aFecha(sumarDias(fin, 1)) } },
        orderBy: { fecha_inicio: 'asc' },
        select: { fecha_inicio: true, completada: true, calorias: true, fc_promedio: true, duracion_min: true },
      }),
      this.prisma.rutinaAsignada.findMany({
        where: { id_socio: idSocio, fecha_inicio: { lte: aFecha(fin) }, OR: [{ fecha_fin: null }, { fecha_fin: { gte: aFecha(ini) } }] },
        select: { fecha_inicio: true, fecha_fin: true, sesiones_planeadas_semana: true },
      }),
    ]);
    const diaDe = (d: Date) => d.toISOString().slice(0, 10);
    const completadas = sesiones.filter((s) => s.completada);
    const adherencia = (cumplidas: number, planeadas: number) =>
      planeadas > 0 ? Math.min(100, Math.round((cumplidas / planeadas) * 100)) : null;

    const semanas: { inicio: string; planeadas: number; cumplidas: number; adherencia: number | null }[] = [];
    for (let lunes = ini; lunes <= fin; lunes = sumarDias(lunes, 7)) {
      const domingo = sumarDias(lunes, 6) < fin ? sumarDias(lunes, 6) : fin;
      const planeadas = sesionesPlaneadas(rutinas, lunes, domingo);
      const cumplidas = completadas.filter((s) => diaDe(s.fecha_inicio) >= lunes && diaDe(s.fecha_inicio) <= domingo).length;
      semanas.push({ inicio: lunes, planeadas, cumplidas, adherencia: adherencia(cumplidas, planeadas) });
    }

    const meses = new Map<string, { planeadas: number; cumplidas: number }>();
    for (let dia = ini; dia <= fin; dia = sumarDias(dia, 1)) {
      const mes = dia.slice(0, 7);
      if (!meses.has(mes)) {
        const finMes = sumarDias(`${sumarDias(`${mes}-28`, 4).slice(0, 7)}-01`, -1);
        meses.set(mes, {
          planeadas: sesionesPlaneadas(rutinas, dia, finMes < fin ? finMes : fin),
          cumplidas: completadas.filter((s) => diaDe(s.fecha_inicio).startsWith(mes) && diaDe(s.fecha_inicio) >= ini).length,
        });
      }
    }

    // Racha: semanas seguidas, hacia atrás desde la última completa, que cumplieron lo planeado
    let rachaSemanas = 0;
    for (const s of [...semanas].reverse().filter((s) => sumarDias(s.inicio, 6) < hoyISO() || s.inicio === lunesDe(fin))) {
      if (s.planeadas > 0 && s.cumplidas >= s.planeadas) rachaSemanas++;
      else if (s.inicio !== lunesDe(hoyISO())) break;
    }
    const diasEntrenados = new Set(completadas.map((s) => diaDe(s.fecha_inicio)));

    const planeadasTotal = semanas.reduce((t, s) => t + s.planeadas, 0);
    return {
      desde: ini,
      hasta: fin,
      resumen: {
        sesiones_cumplidas: completadas.length,
        sesiones_planeadas: planeadasTotal,
        adherencia: adherencia(completadas.length, planeadasTotal),
        calorias_totales: Math.round(sesiones.reduce((t, s) => t + (s.calorias ? aNumero(s.calorias) : 0), 0)),
        minutos_totales: sesiones.reduce((t, s) => t + (s.duracion_min ?? 0), 0),
        dias_entrenados: diasEntrenados.size,
      },
      semanas,
      meses: [...meses].map(([mes, m]) => ({ mes, ...m, adherencia: adherencia(m.cumplidas, m.planeadas) })),
      sesiones: sesiones.map((s) => ({
        fecha: s.fecha_inicio,
        calorias: s.calorias ? aNumero(s.calorias) : null,
        fc_promedio: s.fc_promedio,
        duracion_min: s.duracion_min,
        completada: s.completada,
      })),
      logros: {
        racha_semanas: rachaSemanas,
        semanas_cumplidas: semanas.filter((s) => s.planeadas > 0 && s.cumplidas >= s.planeadas).length,
      },
    };
  }

  // Ficha de salud desde la app (APP-RF-09)
  async fichaSalud(ctx: ContextoSocio) {
    try {
      return await this.fichas.obtenerActual(ctx.socio.id_socio, ctx);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  guardarFichaSalud(dto: GuardarFichaSaludDto, ctx: ContextoSocio) {
    return this.fichas.guardar(ctx.socio.id_socio, dto, ctx);
  }

  /** Último estado de cada consentimiento de la app (APP-RF-10). */
  async consentimientos(ctx: ContextoSocio) {
    const registros = await this.prisma.consentimiento.findMany({
      where: { id_socio: ctx.socio.id_socio, tipo: { in: [...TIPOS_CONSENTIMIENTO_APP] } },
      orderBy: [{ fecha: 'desc' }, { id_consentimiento: 'desc' }],
    });
    return TIPOS_CONSENTIMIENTO_APP.map((tipo) => {
      const ultimo = registros.find((r) => r.tipo === tipo);
      return { tipo, otorgado: ultimo?.otorgado ?? false, fecha: ultimo?.fecha ?? null };
    });
  }

  /** Cada cambio es un registro nuevo: el historial de consentimientos no se sobrescribe. */
  async cambiarConsentimiento(dto: ConsentimientoDto, ctx: ContextoSocio) {
    const aviso = await this.prisma.avisoPrivacidad.findFirst({ orderBy: { vigente_desde: 'desc' }, select: { id_aviso: true } });
    await this.prisma.consentimiento.create({
      data: { id_socio: ctx.socio.id_socio, tipo: dto.tipo, id_aviso: aviso?.id_aviso ?? null, otorgado: dto.otorgado, origen: 'app' },
    });
    if (dto.tipo === 'notificaciones' && !dto.otorgado) {
      await this.prisma.dispositivoPush.updateMany({ where: { id_socio: ctx.socio.id_socio }, data: { activo: false } });
    }
    return this.consentimientos(ctx);
  }

  /** Recibe datos de Health Connect; los repetidos (mismo tipo e intervalo) se ignoran (APP-RF-12). */
  async sincronizarSalud(dto: SincronizarSaludDto, ctx: ContextoSocio) {
    const idSocio = ctx.socio.id_socio;
    const consentimientos = await this.consentimientos(ctx);
    if (!consentimientos.find((c) => c.tipo === 'health_connect')?.otorgado) {
      throw new ForbiddenException('El socio no ha autorizado el uso de datos de Health Connect.');
    }

    const datos = dto.datos.map((d) => ({ ...d, inicio: new Date(d.inicio), fin: new Date(d.fin) }));
    if (datos.some((d) => d.fin < d.inicio)) throw new BadRequestException('Cada dato debe terminar después de empezar.');
    const llave = (tipo: string, inicio: Date, fin: Date) => `${tipo}|${inicio.getTime()}|${fin.getTime()}`;

    let nuevos = 0;
    try {
      if (datos.length) {
        const min = new Date(Math.min(...datos.map((d) => d.inicio.getTime())));
        const max = new Date(Math.max(...datos.map((d) => d.inicio.getTime())));
        const existentes = await this.prisma.datoSalud.findMany({
          where: { id_socio: idSocio, inicio_medicion: { gte: min, lte: max } },
          select: { tipo: true, inicio_medicion: true, fin_medicion: true },
        });
        const vistos = new Set(existentes.map((e) => llave(e.tipo, e.inicio_medicion, e.fin_medicion)));
        const pendientes = datos.filter((d) => {
          const k = llave(d.tipo, d.inicio, d.fin);
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
        for (let i = 0; i < pendientes.length; i += LOTE_INSERCION) {
          const r = await this.prisma.datoSalud.createMany({
            data: pendientes.slice(i, i + LOTE_INSERCION).map((d) => ({
              id_socio: idSocio,
              tipo: d.tipo,
              valor: d.valor,
              inicio_medicion: d.inicio,
              fin_medicion: d.fin,
            })),
          });
          nuevos += r.count;
        }
      }
      const sync = await this.prisma.sincronizacionSalud.create({
        data: { id_socio: idSocio, registros_recibidos: nuevos, exitosa: true },
      });
      return { recibidos: dto.datos.length, nuevos, ultima_sincronizacion: sync.fecha_sync };
    } catch (error) {
      await this.prisma.sincronizacionSalud.create({
        data: { id_socio: idSocio, registros_recibidos: nuevos, exitosa: false, detalle_error: String(error).slice(0, 255) },
      });
      throw error;
    }
  }

  async estadoSalud(ctx: ContextoSocio) {
    const ultima = await this.prisma.sincronizacionSalud.findFirst({
      where: { id_socio: ctx.socio.id_socio, exitosa: true },
      orderBy: { fecha_sync: 'desc' },
    });
    return { ultima_sincronizacion: ultima?.fecha_sync ?? null };
  }

  /** Registra el token FCM del dispositivo; si ya era de otro socio, se reasigna. */
  async registrarDispositivo(fcmToken: string, ctx: ContextoSocio) {
    await this.prisma.dispositivoPush.upsert({
      where: { fcm_token: fcmToken },
      create: { id_socio: ctx.socio.id_socio, fcm_token: fcmToken },
      update: { id_socio: ctx.socio.id_socio, activo: true, actualizado_en: new Date() },
    });
    return { ok: true };
  }

  /** Bandeja de notificaciones recibidas (APP-RF-14). */
  async notificaciones(ctx: ContextoSocio) {
    const lista = await this.prisma.notificacion.findMany({
      where: { id_socio: ctx.socio.id_socio, estado: { in: ['enviado', 'entregado'] } },
      orderBy: { creada_en: 'desc' },
      take: 100,
      select: { id_notificacion: true, categoria: true, origen: true, titulo: true, contenido: true, creada_en: true, leida_en: true },
    });
    return lista.map((n) => ({ ...n, id_notificacion: idNumero(n.id_notificacion) }));
  }

  /** La app avisa que recibió el push: el envío pasa a "entregado". */
  async marcarEntregada(idNotificacion: number, ctx: ContextoSocio) {
    const r = await this.prisma.notificacion.updateMany({
      where: { id_notificacion: idNotificacion, id_socio: ctx.socio.id_socio, estado: 'enviado' },
      data: { estado: 'entregado', entregada_en: new Date() },
    });
    return { actualizada: r.count > 0 };
  }

  async marcarLeida(idNotificacion: number, ctx: ContextoSocio) {
    const r = await this.prisma.notificacion.updateMany({
      where: { id_notificacion: idNotificacion, id_socio: ctx.socio.id_socio, leida_en: null },
      data: { leida_en: new Date() },
    });
    return { actualizada: r.count > 0 };
  }

  /** Sin registro, una categoría está habilitada. */
  async preferencias(ctx: ContextoSocio) {
    const guardadas = await this.prisma.preferenciaNotificacion.findMany({ where: { id_socio: ctx.socio.id_socio } });
    return CATEGORIAS_NOTIFICACION.map((categoria) => ({
      categoria,
      habilitada: guardadas.find((g) => g.categoria === categoria)?.habilitada ?? true,
    }));
  }

  async guardarPreferencias(dto: PreferenciasDto, ctx: ContextoSocio) {
    await this.prisma.$transaction(
      dto.preferencias.map((p) =>
        this.prisma.preferenciaNotificacion.upsert({
          where: { id_socio_categoria: { id_socio: ctx.socio.id_socio, categoria: p.categoria } },
          create: { id_socio: ctx.socio.id_socio, categoria: p.categoria, habilitada: p.habilitada },
          update: { habilitada: p.habilitada },
        }),
      ),
    );
    return this.preferencias(ctx);
  }
}
