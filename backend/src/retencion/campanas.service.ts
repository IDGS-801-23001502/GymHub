import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { idNumero } from '../common/utils/serializar.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CampanaDto } from './dto/retencion.dto.js';
import { SegmentosService } from './segmentos.service.js';

/** Campañas push a un socio o a un segmento, inmediatas o programadas (CRM-RF-14). */
@Injectable()
export class CampanasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampanasService.name);
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly segmentos: SegmentosService,
    private readonly notificaciones: NotificacionesService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Revisa cada minuto las campañas programadas que ya deben salir. */
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test' || process.env.VITEST) return;
    this.temporizador = setInterval(() => void this.procesarProgramadas(), 60_000);
    this.temporizador.unref();
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  async listar() {
    const lista = await this.prisma.campana.findMany({
      include: {
        socio: { select: { folio: true, nombre: true } },
        segmento: { select: { nombre: true } },
        usuario: { select: { nombre: true } },
      },
      orderBy: { creada_en: 'desc' },
      take: 200,
    });
    const conteos = await this.notificaciones.conteoPorCampana(lista.map((c) => c.id_campana));
    return lista.map((c) => ({
      id_campana: c.id_campana,
      titulo: c.titulo,
      contenido: c.contenido,
      categoria: c.categoria,
      tipo_destino: c.tipo_destino,
      destino: c.tipo_destino === 'socio' ? `${c.socio?.nombre} (${c.socio?.folio})` : (c.segmento?.nombre ?? '—'),
      id_socio_destino: c.id_socio_destino,
      id_segmento: c.id_segmento,
      modo_envio: c.modo_envio,
      programada_para: c.programada_para,
      estado: c.estado,
      creada_por: c.usuario.nombre,
      creada_en: c.creada_en,
      envios: conteos.get(c.id_campana) ?? { pendiente: 0, enviado: 0, entregado: 0, fallido: 0 },
    }));
  }

  async detalle(id: number) {
    const c = (await this.listar()).find((x) => x.id_campana === id);
    if (!c) throw new NotFoundException('Campaña no encontrada.');
    const envios = await this.prisma.notificacion.findMany({
      where: { id_campana: id },
      include: { socio: { select: { id_socio: true, folio: true, nombre: true } } },
      orderBy: { creada_en: 'desc' },
      take: 500,
    });
    return {
      ...c,
      notificaciones: envios.map((n) => ({
        id_notificacion: idNumero(n.id_notificacion),
        socio: n.socio,
        estado: n.estado,
        intentos: n.intentos,
        error: n.error,
        enviada_en: n.enviada_en,
        entregada_en: n.entregada_en,
        leida_en: n.leida_en,
      })),
    };
  }

  async crear(dto: CampanaDto, ctx: ContextoPeticion) {
    await this.validarDestino(dto);
    const programada = dto.modo_envio === 'programado' ? new Date(dto.programada_para!) : null;
    if (programada && programada.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('La fecha programada ya pasó.');
    }
    const c = await this.prisma.campana.create({
      data: {
        titulo: dto.titulo,
        contenido: dto.contenido,
        categoria: dto.categoria,
        tipo_destino: dto.tipo_destino,
        id_socio_destino: dto.tipo_destino === 'socio' ? dto.id_socio_destino! : null,
        id_segmento: dto.tipo_destino === 'segmento' ? dto.id_segmento! : null,
        modo_envio: dto.modo_envio,
        programada_para: programada,
        estado: dto.borrador ? 'borrador' : programada ? 'programada' : 'procesando',
        creada_por: ctx.usuario.id_usuario,
      },
    });
    await this.audit.registrar(ctx, { entidad: 'campana', idEntidad: c.id_campana, accion: 'crear', nuevo: { ...dto } });
    if (c.estado === 'procesando') await this.procesar(c.id_campana);
    return this.detalle(c.id_campana);
  }

  /** Envía ya una campaña en borrador o adelanta una programada. */
  async enviarAhora(id: number, ctx: ContextoPeticion) {
    const r = await this.prisma.campana.updateMany({
      where: { id_campana: id, estado: { in: ['borrador', 'programada'] } },
      data: { estado: 'procesando', modo_envio: 'inmediato', programada_para: null },
    });
    if (!r.count) throw new ConflictException('Solo se pueden enviar campañas en borrador o programadas.');
    await this.audit.registrar(ctx, { entidad: 'campana', idEntidad: id, accion: 'modificar', nuevo: { estado: 'procesando' } });
    await this.procesar(id);
    return this.detalle(id);
  }

  async cancelar(id: number, ctx: ContextoPeticion) {
    const r = await this.prisma.campana.updateMany({
      where: { id_campana: id, estado: { in: ['borrador', 'programada'] } },
      data: { estado: 'cancelada' },
    });
    if (!r.count) throw new ConflictException('Solo se pueden cancelar campañas en borrador o programadas.');
    await this.audit.registrar(ctx, { entidad: 'campana', idEntidad: id, accion: 'cancelar' });
    return this.detalle(id);
  }

  /** Reintenta los envíos fallidos de una campaña. */
  async reintentar(id: number, ctx: ContextoPeticion) {
    const r = await this.prisma.notificacion.updateMany({
      where: { id_campana: id, estado: 'fallido' },
      data: { estado: 'pendiente', intentos: 0, error: null },
    });
    await this.audit.registrar(ctx, { entidad: 'campana', idEntidad: id, accion: 'modificar', nuevo: { reintentos: r.count } });
    void this.notificaciones.procesarPendientes();
    return { reintentos: r.count };
  }

  async procesarProgramadas() {
    const vencidas = await this.prisma.campana.findMany({
      where: { estado: 'programada', programada_para: { lte: new Date() } },
      select: { id_campana: true },
    });
    for (const c of vencidas) {
      const tomada = await this.prisma.campana.updateMany({
        where: { id_campana: c.id_campana, estado: 'programada' },
        data: { estado: 'procesando' },
      });
      if (tomada.count) await this.procesar(c.id_campana).catch((e) => this.logger.error(`Campaña ${c.id_campana}: ${String(e)}`));
    }
  }

  /** Resuelve destinatarios y crea las notificaciones; el envío lo hace la cola. */
  private async procesar(id: number) {
    const c = await this.prisma.campana.findUnique({ where: { id_campana: id } });
    if (!c || c.estado !== 'procesando') return;
    const ids =
      c.tipo_destino === 'socio'
        ? [c.id_socio_destino!]
        : (await this.segmentos.socios(c.id_segmento!, null)).socios.map((s) => s.id_socio);
    const r = await this.notificaciones.crear(ids, {
      origen: 'campana',
      categoria: c.categoria as 'avisos',
      titulo: c.titulo,
      contenido: c.contenido,
      id_campana: id,
    });
    await this.prisma.campana.update({ where: { id_campana: id }, data: { estado: 'enviada' } });
    this.logger.log(`Campaña ${id}: ${r.creadas} notificaciones, ${r.omitidas} socios sin app o sin consentimiento.`);
  }

  private async validarDestino(dto: CampanaDto) {
    if (dto.tipo_destino === 'socio') {
      const s = await this.prisma.socio.findUnique({ where: { id_socio: dto.id_socio_destino! }, select: { estado: true } });
      if (!s) throw new NotFoundException('Socio destino no encontrado.');
    } else {
      await this.segmentos.obtener(dto.id_segmento!);
    }
  }
}
