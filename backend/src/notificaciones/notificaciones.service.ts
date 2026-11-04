import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { idNumero } from '../common/utils/serializar.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type OrigenNotificacion = 'campana' | 'recordatorio_vencimiento' | 'recordatorio_inactividad' | 'rutina';
export type CategoriaNotificacion = 'vencimiento' | 'rutina' | 'promociones' | 'avisos';

export interface NuevaNotificacion {
  origen: OrigenNotificacion;
  categoria: CategoriaNotificacion;
  titulo: string;
  contenido: string;
  id_campana?: number | null;
}

export const MAX_INTENTOS = 5;
const COLA = 'notificaciones';
const LOTE = 200;

/** Error que conviene reintentar (red, cuota, servidor de FCM). */
class ErrorReintentable extends Error {}

const ERRORES_TOKEN_INVALIDO = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Notificaciones push (CRM-RF-14, APP-RF-13). La tabla `notificacion` es la fuente de verdad;
 * el envío va por una cola con reintentos: BullMQ sobre Redis si hay REDIS_URL, o un sondeo
 * de la base si no (desarrollo). Sin Firebase configurado, la notificación queda solo en la
 * bandeja de la app.
 */
@Injectable()
export class NotificacionesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificacionesService.name);
  private firebase: App | null = null;
  private cola: Queue | null = null;
  private worker: Worker | null = null;
  private sondeo: NodeJS.Timeout | null = null;
  private procesando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get modo() {
    return { cola: this.cola ? 'redis' : 'base_de_datos', fcm: this.firebase !== null };
  }

  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test' || process.env.VITEST) return;
    this.firebase = this.iniciarFirebase();
    const redis = this.config.get<string>('REDIS_URL');
    if (redis) {
      const conexion = { url: redis, maxRetriesPerRequest: null };
      this.cola = new Queue(COLA, { connection: conexion });
      this.worker = new Worker(
        COLA,
        async (job) => {
          await this.enviar(Number(job.data.id));
        },
        { connection: conexion, concurrency: 5 },
      );
      this.worker.on('failed', (job, err) => this.logger.warn(`Notificación ${job?.data?.id} falló: ${err.message}`));
      this.logger.log('Cola de notificaciones: Redis (BullMQ).');
    } else {
      this.sondeo = setInterval(() => void this.procesarPendientes(), 15_000);
      this.logger.log('Cola de notificaciones: sondeo en base de datos (define REDIS_URL para usar BullMQ).');
    }
    if (!this.firebase) this.logger.warn('Firebase sin configurar: las notificaciones solo llegan a la bandeja de la app.');
  }

  async onModuleDestroy() {
    if (this.sondeo) clearInterval(this.sondeo);
    await this.worker?.close();
    await this.cola?.close();
  }

  /**
   * Crea las notificaciones para los socios que pueden recibirlas: cuenta de la app activa,
   * consentimiento de notificaciones vigente y la categoría habilitada (APP-RF-14).
   */
  async crear(idsSocios: number[], datos: NuevaNotificacion) {
    const unicos = [...new Set(idsSocios)];
    if (!unicos.length) return { creadas: 0, omitidas: 0 };
    const destinatarios = await this.filtrarDestinatarios(unicos, datos.categoria);
    if (destinatarios.length) {
      for (let i = 0; i < destinatarios.length; i += LOTE) {
        const lote = destinatarios.slice(i, i + LOTE);
        await this.prisma.notificacion.createMany({
          data: lote.map((id_socio) => ({
            id_socio,
            id_campana: datos.id_campana ?? null,
            origen: datos.origen,
            categoria: datos.categoria,
            titulo: datos.titulo.slice(0, 120),
            contenido: datos.contenido.slice(0, 500),
          })),
        });
        await this.prisma.interaccionSocio.createMany({
          data: lote.map((id_socio) => ({
            id_socio,
            tipo: 'notificacion',
            descripcion: `Notificación "${datos.titulo}" (${datos.categoria}).`.slice(0, 1000),
          })),
        });
      }
      await this.encolarPendientes(destinatarios, datos.id_campana ?? null);
    }
    return { creadas: destinatarios.length, omitidas: unicos.length - destinatarios.length };
  }

  /** Socios con app activa, que aceptan notificaciones y no silenciaron la categoría. */
  async filtrarDestinatarios(ids: number[], categoria: CategoriaNotificacion): Promise<number[]> {
    const resultado: number[] = [];
    for (let i = 0; i < ids.length; i += 1000) {
      const lote = ids.slice(i, i + 1000);
      const [cuentas, consentimientos, silenciados] = await Promise.all([
        this.prisma.cuentaApp.findMany({ where: { id_socio: { in: lote }, activada: true }, select: { id_socio: true } }),
        this.prisma.consentimiento.findMany({
          where: { id_socio: { in: lote }, tipo: 'notificaciones' },
          orderBy: [{ fecha: 'desc' }, { id_consentimiento: 'desc' }],
          select: { id_socio: true, otorgado: true },
        }),
        this.prisma.preferenciaNotificacion.findMany({
          where: { id_socio: { in: lote }, categoria, habilitada: false },
          select: { id_socio: true },
        }),
      ]);
      const ultimo = new Map<number, boolean>();
      for (const c of consentimientos) if (!ultimo.has(c.id_socio)) ultimo.set(c.id_socio, c.otorgado);
      const conCuenta = new Set(cuentas.map((c) => c.id_socio));
      const sinCategoria = new Set(silenciados.map((s) => s.id_socio));
      resultado.push(...lote.filter((id) => conCuenta.has(id) && ultimo.get(id) === true && !sinCategoria.has(id)));
    }
    return resultado;
  }

  /** Envía una notificación. Lanza ErrorReintentable para que la cola reintente. */
  async enviar(id: number): Promise<void> {
    // Reclamo atómico: si otro proceso ya la tomó, no se envía dos veces
    const n = await this.prisma.notificacion.findUnique({ where: { id_notificacion: BigInt(id) } });
    if (!n || n.estado !== 'pendiente') return;
    const reclamada = await this.prisma.notificacion.updateMany({
      where: { id_notificacion: n.id_notificacion, estado: 'pendiente', intentos: n.intentos },
      data: { intentos: n.intentos + 1 },
    });
    if (!reclamada.count) return;

    const tokens = (
      await this.prisma.dispositivoPush.findMany({ where: { id_socio: n.id_socio, activo: true }, select: { fcm_token: true } })
    ).map((d) => d.fcm_token);

    if (!this.firebase || !tokens.length) {
      await this.prisma.notificacion.update({
        where: { id_notificacion: n.id_notificacion },
        data: {
          estado: 'enviado',
          enviada_en: new Date(),
          error: !this.firebase ? 'Solo bandeja: Firebase sin configurar.' : 'Solo bandeja: el socio no tiene dispositivos activos.',
        },
      });
      return;
    }

    try {
      const r = await getMessaging(this.firebase).sendEachForMulticast({
        tokens,
        notification: { title: n.titulo, body: n.contenido },
        data: { id_notificacion: String(idNumero(n.id_notificacion)), categoria: n.categoria },
        android: { priority: 'high', notification: { channelId: n.categoria } },
      });
      const invalidos = tokens.filter((_, i) => {
        const codigo = r.responses[i]?.error?.code;
        return codigo !== undefined && ERRORES_TOKEN_INVALIDO.has(codigo);
      });
      if (invalidos.length) {
        await this.prisma.dispositivoPush.updateMany({ where: { fcm_token: { in: invalidos } }, data: { activo: false } });
      }
      if (r.successCount > 0) {
        await this.prisma.notificacion.update({
          where: { id_notificacion: n.id_notificacion },
          data: {
            estado: 'enviado',
            enviada_en: new Date(),
            fcm_message_id: r.responses.find((x) => x.success)?.messageId?.slice(0, 255) ?? null,
            error: null,
          },
        });
        return;
      }
      const error = r.responses.find((x) => x.error)?.error;
      const definitivo = invalidos.length === tokens.length;
      throw definitivo ? new Error(error?.message ?? 'Tokens no válidos') : new ErrorReintentable(error?.message ?? 'FCM rechazó el envío');
    } catch (e) {
      const mensaje = (e instanceof Error ? e.message : String(e)).slice(0, 255);
      const agotado = !(e instanceof ErrorReintentable) || n.intentos + 1 >= MAX_INTENTOS;
      await this.prisma.notificacion.update({
        where: { id_notificacion: n.id_notificacion },
        data: { estado: agotado ? 'fallido' : 'pendiente', error: mensaje },
      });
      if (!agotado) throw e;
    }
  }

  /** Respaldo sin Redis: procesa lo pendiente cada 15 s, con espera creciente entre intentos. */
  async procesarPendientes() {
    if (this.procesando) return;
    this.procesando = true;
    try {
      const pendientes = await this.prisma.notificacion.findMany({
        where: { estado: 'pendiente', intentos: { lt: MAX_INTENTOS } },
        orderBy: { creada_en: 'asc' },
        take: 100,
        select: { id_notificacion: true, intentos: true, creada_en: true },
      });
      const ahora = Date.now();
      for (const p of pendientes) {
        // 0 s, 30 s, 1 min, 2 min, 4 min desde la creación
        const espera = p.intentos === 0 ? 0 : 30_000 * 2 ** (p.intentos - 1);
        if (ahora - p.creada_en.getTime() < espera) continue;
        await this.enviar(idNumero(p.id_notificacion)).catch(() => undefined);
      }
    } finally {
      this.procesando = false;
    }
  }

  private async encolarPendientes(socios: number[], idCampana: number | null) {
    if (!this.cola) {
      void this.procesarPendientes();
      return;
    }
    const recientes = await this.prisma.notificacion.findMany({
      where: { id_socio: { in: socios }, estado: 'pendiente', intentos: 0, id_campana: idCampana },
      select: { id_notificacion: true },
    });
    await this.cola.addBulk(
      recientes.map((n) => ({
        name: 'enviar',
        data: { id: idNumero(n.id_notificacion) },
        opts: {
          jobId: `notif-${idNumero(n.id_notificacion)}`,
          attempts: MAX_INTENTOS,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      })),
    );
  }

  private iniciarFirebase(): App | null {
    if (getApps().length) return getApps()[0];
    const proyecto = this.config.get<string>('FIREBASE_PROJECT_ID');
    const correo = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const llave = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    try {
      if (proyecto && correo && llave) {
        return initializeApp({ credential: cert({ projectId: proyecto, clientEmail: correo, privateKey: llave }) });
      }
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return initializeApp();
    } catch (error) {
      this.logger.error(`No se pudo iniciar Firebase: ${String(error)}`);
    }
    return null;
  }

  /** Estado por campaña: cuántas se enviaron, entregaron, fallaron o siguen pendientes. */
  async conteoPorCampana(ids: number[]) {
    if (!ids.length) return new Map<number, Record<string, number>>();
    const filas = await this.prisma.notificacion.groupBy({
      by: ['id_campana', 'estado'],
      where: { id_campana: { in: ids } },
      _count: { _all: true },
    });
    const mapa = new Map<number, Record<string, number>>();
    for (const f of filas) {
      if (f.id_campana === null) continue;
      const m = mapa.get(f.id_campana) ?? { pendiente: 0, enviado: 0, entregado: 0, fallido: 0 };
      m[f.estado] = f._count._all;
      mapa.set(f.id_campana, m);
    }
    return mapa;
  }
}
