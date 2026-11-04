import { Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion, UsuarioAutenticado } from '../common/auth/auth.types.js';
import { exigirSede, filtroSedes } from '../common/auth/sedes.js';
import { aISO, diferenciaDias, hoyISO } from '../common/utils/fechas.js';
import { MembresiasService, seleccionResumen } from '../membresias/membresias.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccionRiesgoDto, ConfigRiesgoDto } from './dto/retencion.dto.js';

export type MotivoRiesgo = 'inactividad' | 'membresia_por_vencer';

export interface ConfigEfectiva {
  dias_inactividad: number;
  dias_aviso_vencimiento: number;
  activa: boolean;
}

export const CONFIG_DEFECTO: ConfigEfectiva = { dias_inactividad: 10, dias_aviso_vencimiento: 7, activa: true };

export interface SituacionSocio {
  fecha_alta: string;
  ultima_visita: string | null;
  estado_membresia: string;
  vigente_hasta: string | null;
}

/**
 * Reglas de riesgo de deserción (CRM-RF-13). Solo se evalúa a quien tiene membresía vigente
 * o por vencer: a los que ya vencieron se les busca con segmentos y campañas.
 */
export function detectarRiesgos(s: SituacionSocio, cfg: ConfigEfectiva, hoy: string) {
  const riesgos: { motivo: MotivoRiesgo; detalle: string }[] = [];
  if (!cfg.activa || !['activa', 'por_vencer'].includes(s.estado_membresia)) return riesgos;
  const referencia = s.ultima_visita ?? s.fecha_alta;
  const dias = diferenciaDias(referencia, hoy);
  if (dias >= cfg.dias_inactividad) {
    riesgos.push({
      motivo: 'inactividad',
      detalle: s.ultima_visita ? `${dias} días sin asistir (última visita ${s.ultima_visita}).` : `Sin visitas en ${dias} días desde su alta.`,
    });
  }
  if (s.estado_membresia === 'por_vencer') {
    riesgos.push({ motivo: 'membresia_por_vencer', detalle: `La membresía vence el ${s.vigente_hasta} y no se ha renovado.` });
  }
  return riesgos;
}

const RECORDATORIOS: Record<MotivoRiesgo, { origen: 'recordatorio_inactividad' | 'recordatorio_vencimiento'; categoria: 'avisos' | 'vencimiento'; titulo: string; texto: (d: string) => string }> = {
  inactividad: {
    origen: 'recordatorio_inactividad',
    categoria: 'avisos',
    titulo: '¡Te extrañamos en GymHub!',
    texto: () => 'Hace días que no te vemos. Tu rutina te está esperando: ¡vuelve hoy!',
  },
  membresia_por_vencer: {
    origen: 'recordatorio_vencimiento',
    categoria: 'vencimiento',
    titulo: 'Tu membresía está por vencer',
    texto: (d) => `${d} Renueva en recepción para no perder tu progreso.`,
  },
};

const HORAS_ENTRE_EVALUACIONES = 6;

@Injectable()
export class RiesgoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RiesgoService.name);
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly membresias: MembresiasService,
    private readonly notificaciones: NotificacionesService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Proceso automático: al arrancar (con un minuto de margen) y cada 6 horas. Es idempotente. */
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test' || process.env.VITEST) return;
    const correr = () => void this.evaluar().catch((e) => this.logger.error(`Evaluación de riesgo: ${String(e)}`));
    setTimeout(correr, 60_000).unref();
    this.temporizador = setInterval(correr, HORAS_ENTRE_EVALUACIONES * 3_600_000);
    this.temporizador.unref();
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  async configuraciones() {
    const [configs, sedes] = await Promise.all([
      this.prisma.configRiesgo.findMany(),
      this.prisma.sede.findMany({ where: { activa: true }, select: { id_sede: true, nombre: true } }),
    ]);
    const global = configs.find((c) => c.id_sede === null);
    return {
      global: global ? this.limpiar(global) : CONFIG_DEFECTO,
      sedes: sedes.map((s) => {
        const c = configs.find((x) => x.id_sede === s.id_sede);
        return { id_sede: s.id_sede, nombre: s.nombre, personalizada: !!c, ...(c ? this.limpiar(c) : null) };
      }),
    };
  }

  async guardarConfig(dto: ConfigRiesgoDto, ctx: ContextoPeticion) {
    const idSede = dto.id_sede ?? null;
    const data = {
      dias_inactividad: dto.dias_inactividad,
      dias_aviso_vencimiento: dto.dias_aviso_vencimiento,
      activa: dto.activa ?? true,
      actualizado_en: new Date(),
    };
    // id_sede NULL no sirve como llave de upsert en SQL Server
    const existente = await this.prisma.configRiesgo.findFirst({ where: { id_sede: idSede } });
    if (existente) await this.prisma.configRiesgo.update({ where: { id_config: existente.id_config }, data });
    else await this.prisma.configRiesgo.create({ data: { ...data, id_sede: idSede } });
    await this.audit.registrar(ctx, { entidad: 'config_riesgo', idEntidad: idSede ?? 'global', accion: 'modificar', nuevo: dto });
    return this.configuraciones();
  }

  /** Abre riesgos nuevos, cierra los que ya no aplican y envía los recordatorios automáticos. */
  async evaluar() {
    const hoy = hoyISO();
    const [configs, socios, abiertos] = await Promise.all([
      this.prisma.configRiesgo.findMany(),
      this.prisma.socio.findMany({
        where: { estado: 'activo' },
        select: { id_socio: true, id_sede: true, fecha_alta: true, membresias: { select: seleccionResumen } },
      }),
      this.prisma.riesgoDesercion.findMany({ where: { estado: { in: ['abierto', 'atendido'] } } }),
    ]);
    const cfgDe = (idSede: number): ConfigEfectiva => {
      const c = configs.find((x) => x.id_sede === idSede) ?? configs.find((x) => x.id_sede === null);
      return c ? this.limpiar(c) : CONFIG_DEFECTO;
    };
    const ultimas = new Map<number, string>();
    for (let i = 0; i < socios.length; i += 2000) {
      const filas = await this.prisma.asistencia.groupBy({
        by: ['id_socio'],
        where: { id_socio: { in: socios.slice(i, i + 2000).map((s) => s.id_socio) } },
        _max: { fecha_hora: true },
      });
      for (const f of filas) if (f._max.fecha_hora) ultimas.set(f.id_socio, aISO(f._max.fecha_hora));
    }

    let nuevos = 0;
    let resueltos = 0;
    const avisar: Record<MotivoRiesgo, Map<string, number[]>> = { inactividad: new Map(), membresia_por_vencer: new Map() };
    for (const s of socios) {
      const cfg = cfgDe(s.id_sede);
      const m = this.membresias.resumen(s.membresias, hoy, cfg.dias_aviso_vencimiento);
      const detectados = detectarRiesgos(
        {
          fecha_alta: aISO(s.fecha_alta),
          ultima_visita: ultimas.get(s.id_socio) ?? null,
          estado_membresia: m?.estado ?? 'sin_membresia',
          vigente_hasta: m?.vigente_hasta ?? null,
        },
        cfg,
        hoy,
      );
      const propios = abiertos.filter((r) => r.id_socio === s.id_socio);
      for (const r of propios) {
        if (!detectados.some((d) => d.motivo === r.motivo)) {
          await this.prisma.riesgoDesercion.update({
            where: { id_riesgo: r.id_riesgo },
            data: { estado: 'resuelto', cerrado_en: new Date() },
          });
          resueltos++;
        }
      }
      for (const d of detectados) {
        if (propios.some((r) => r.motivo === d.motivo)) continue;
        await this.prisma.riesgoDesercion.create({ data: { id_socio: s.id_socio, motivo: d.motivo, detalle: d.detalle } });
        nuevos++;
        const texto = RECORDATORIOS[d.motivo].texto(d.detalle);
        avisar[d.motivo].set(texto, [...(avisar[d.motivo].get(texto) ?? []), s.id_socio]);
      }
    }

    let notificados = 0;
    for (const motivo of Object.keys(avisar) as MotivoRiesgo[]) {
      const r = RECORDATORIOS[motivo];
      for (const [texto, ids] of avisar[motivo]) {
        notificados += (
          await this.notificaciones.crear(ids, { origen: r.origen, categoria: r.categoria, titulo: r.titulo, contenido: texto })
        ).creadas;
      }
    }
    this.logger.log(`Riesgo evaluado: ${nuevos} nuevos, ${resueltos} resueltos, ${notificados} recordatorios.`);
    return { evaluados: socios.length, nuevos, resueltos, recordatorios: notificados };
  }

  /** Tablero de seguimiento. */
  async tablero(usuario: UsuarioAutenticado, estado?: string, idSede?: number) {
    if (idSede) exigirSede(usuario, idSede);
    const lista = await this.prisma.riesgoDesercion.findMany({
      where: {
        estado: estado ? estado : { in: ['abierto', 'atendido'] },
        socio: { id_sede: idSede ?? filtroSedes(usuario) },
      },
      include: {
        socio: { select: { id_socio: true, folio: true, nombre: true, sede: { select: { nombre: true } } } },
        acciones: { include: { usuario: { select: { nombre: true } } }, orderBy: { fecha: 'desc' } },
      },
      orderBy: { detectado_en: 'desc' },
      take: 500,
    });
    return lista.map((r) => ({
      id_riesgo: r.id_riesgo,
      motivo: r.motivo,
      detalle: r.detalle,
      estado: r.estado,
      detectado_en: r.detectado_en,
      cerrado_en: r.cerrado_en,
      socio: { id_socio: r.socio.id_socio, folio: r.socio.folio, nombre: r.socio.nombre, sede: r.socio.sede.nombre },
      acciones: r.acciones.map((a) => ({
        id_accion: a.id_accion,
        tipo_accion: a.tipo_accion,
        descripcion: a.descripcion,
        fecha: a.fecha,
        realizada_por: a.usuario.nombre,
      })),
    }));
  }

  async conteoAbiertos(usuario: UsuarioAutenticado, idSede?: number) {
    return this.prisma.riesgoDesercion.count({
      where: { estado: { in: ['abierto', 'atendido'] }, socio: { id_sede: idSede ?? filtroSedes(usuario) } },
    });
  }

  /** Registra la acción tomada y, si se indica, cambia el estado del riesgo. */
  async accion(idRiesgo: number, dto: AccionRiesgoDto, ctx: ContextoPeticion) {
    const r = await this.prisma.riesgoDesercion.findUnique({
      where: { id_riesgo: idRiesgo },
      include: { socio: { select: { id_sede: true, nombre: true } } },
    });
    if (!r) throw new NotFoundException('Registro de riesgo no encontrado.');
    exigirSede(ctx.usuario, r.socio.id_sede);
    const estado = dto.estado ?? (r.estado === 'abierto' ? 'atendido' : r.estado);
    const cerrado = estado === 'resuelto' || estado === 'descartado';
    await this.prisma.$transaction([
      this.prisma.accionRiesgo.create({
        data: { id_riesgo: idRiesgo, tipo_accion: dto.tipo_accion, descripcion: dto.descripcion ?? null, realizada_por: ctx.usuario.id_usuario },
      }),
      this.prisma.riesgoDesercion.update({
        where: { id_riesgo: idRiesgo },
        data: { estado, cerrado_en: cerrado ? new Date() : null },
      }),
    ]);
    if (dto.tipo_accion === 'notificacion' && dto.descripcion) {
      await this.notificaciones.crear([r.id_socio], { origen: 'campana', categoria: 'avisos', titulo: 'Mensaje de tu gimnasio', contenido: dto.descripcion });
    } else {
      await this.audit.interaccion(
        ctx,
        r.id_socio,
        dto.tipo_accion === 'llamada' ? 'llamada' : 'otro',
        `Seguimiento de riesgo (${r.motivo}): ${dto.tipo_accion}${dto.descripcion ? ` — ${dto.descripcion}` : ''}.`,
      );
    }
    await this.audit.registrar(ctx, {
      entidad: 'riesgo_desercion',
      idEntidad: idRiesgo,
      idSocio: r.id_socio,
      accion: 'modificar',
      anterior: { estado: r.estado },
      nuevo: { estado, accion: dto.tipo_accion },
    });
    return (await this.tablero(ctx.usuario, estado)).find((x) => x.id_riesgo === idRiesgo) ?? { id_riesgo: idRiesgo, estado };
  }

  private limpiar(c: ConfigEfectiva): ConfigEfectiva {
    return { dias_inactividad: c.dias_inactividad, dias_aviso_vencimiento: c.dias_aviso_vencimiento, activa: c.activa };
  }
}
