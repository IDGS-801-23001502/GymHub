import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService, type ClienteDb } from '../common/audit/audit.service.js';
import type { ContextoPeticion, UsuarioAutenticado } from '../common/auth/auth.types.js';
import { exigirSede } from '../common/auth/sedes.js';
import { aFecha, aISO, hoyISO, sumarDias } from '../common/utils/fechas.js';
import { folioPago, folioTemporal } from '../common/utils/folios.js';
import { aNumero, idNumero } from '../common/utils/serializar.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { obtenerSocioAutorizado } from '../socios/socio-acceso.js';
import type { AsignarMembresiaDto, CongelarMembresiaDto } from './dto/membresia.dto.js';
import {
  calcularEstado,
  calcularPeriodo,
  diasCongelamiento,
  resumirMembresias,
  seTraslapan,
  type MembresiaFechas,
} from './membresia.reglas.js';

const DIAS_AVISO_DEFECTO = 7;

const incluirMembresia = {
  plan: { select: { id_plan: true, nombre: true, tipo: true, duracion_dias: true } },
  congelamientos: { orderBy: { fecha_inicio: 'asc' } },
  pagos: {
    select: {
      id_pago: true,
      folio: true,
      monto: true,
      metodo: true,
      estado: true,
      fecha_pago: true,
    },
    orderBy: { fecha_pago: 'asc' },
  },
} satisfies Prisma.MembresiaInclude;

type MembresiaCompleta = Prisma.MembresiaGetPayload<{ include: typeof incluirMembresia }>;

/** Campos mínimos para calcular estado/resumen. */
export const seleccionResumen = {
  id_membresia: true,
  fecha_inicio: true,
  fecha_vencimiento: true,
  estado: true,
  plan: { select: { id_plan: true, nombre: true } },
  congelamientos: { select: { fecha_inicio: true, fecha_fin: true } },
} satisfies Prisma.MembresiaSelect;

type MembresiaResumible = Prisma.MembresiaGetPayload<{ select: typeof seleccionResumen }>;

/** Convierte una membresía de Prisma al formato de las reglas puras. */
function aFechas<T extends MembresiaResumible>(m: T): MembresiaFechas & { original: T } {
  return {
    fecha_inicio: aISO(m.fecha_inicio),
    fecha_vencimiento: aISO(m.fecha_vencimiento),
    estado: m.estado,
    congelamientos: m.congelamientos.map((c) => ({
      fecha_inicio: aISO(c.fecha_inicio),
      fecha_fin: aISO(c.fecha_fin),
    })),
    original: m,
  };
}

@Injectable()
export class MembresiasService {
  private readonly maxDiasCongelamiento: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.maxDiasCongelamiento = Number(config.get('CONGELAMIENTO_MAX_DIAS') ?? 90);
  }

  /** Días de anticipación para "por vencer" (config_riesgo de la sede o global). */
  async diasAvisoPorSede(db: ClienteDb = this.prisma): Promise<(idSede: number) => number> {
    const configs = await db.configRiesgo.findMany({
      where: { activa: true },
      select: { id_sede: true, dias_aviso_vencimiento: true },
    });
    const global = configs.find((c) => c.id_sede === null)?.dias_aviso_vencimiento;
    return (idSede: number) =>
      configs.find((c) => c.id_sede === idSede)?.dias_aviso_vencimiento ??
      global ??
      DIAS_AVISO_DEFECTO;
  }

  /** Resumen de vigencia a partir de las membresías ya cargadas del socio. */
  resumen(membresias: MembresiaResumible[], hoy: string, diasAviso: number) {
    const r = resumirMembresias(membresias.map(aFechas), hoy, diasAviso);
    if (!r) return null;
    return {
      id_membresia: r.actual.original.id_membresia,
      plan: r.actual.original.plan,
      estado: r.estado,
      fecha_inicio: r.actual.fecha_inicio,
      vigente_hasta: r.vigente_hasta,
      dias_restantes: r.dias_restantes,
    };
  }

  async historial(idSocio: number, usuario: UsuarioAutenticado | null) {
    const socio = await obtenerSocioAutorizado(this.prisma, idSocio, usuario);
    const hoy = hoyISO();
    const diasAviso = (await this.diasAvisoPorSede())(socio.id_sede);
    const membresias = await this.prisma.membresia.findMany({
      where: { id_socio: idSocio },
      include: incluirMembresia,
      orderBy: [{ fecha_inicio: 'desc' }, { id_membresia: 'desc' }],
    });
    return {
      resumen: this.resumen(membresias, hoy, diasAviso),
      membresias: membresias.map((m) => this.mapear(m, hoy, diasAviso)),
    };
  }

  async asignar(idSocio: number, dto: AsignarMembresiaDto, ctx: ContextoPeticion) {
    const hoy = hoyISO();

    return this.prisma.$transaction(
      async (tx) => {
        const socio = await obtenerSocioAutorizado(tx, idSocio, ctx.usuario);
        if (socio.estado !== 'activo') {
          throw new ConflictException(
            'El socio está dado de baja; reactívalo antes de asignarle una membresía.',
          );
        }

        const plan = await tx.planMembresia.findUnique({ where: { id_plan: dto.id_plan } });
        if (!plan) throw new NotFoundException('Plan no encontrado.');
        if (!plan.activo) {
          throw new ConflictException('El plan está desactivado y no puede asignarse.');
        }
        const precio = aNumero(plan.precio);
        if (precio > 0 && !dto.pago) {
          throw new BadRequestException(
            `Debes registrar el pago del plan (${precio.toFixed(2)}).`,
          );
        }

        // Última membresía no cancelada: define si la renovación se acumula
        const ultima = await tx.membresia.findFirst({
          where: { id_socio: idSocio, estado: { not: 'cancelada' } },
          orderBy: { fecha_vencimiento: 'desc' },
        });
        const periodo = calcularPeriodo(
          plan.duracion_dias,
          hoy,
          ultima ? aISO(ultima.fecha_vencimiento) : null,
        );

        const membresia = await tx.membresia.create({
          data: {
            id_socio: idSocio,
            id_plan: plan.id_plan,
            fecha_inicio: aFecha(periodo.fecha_inicio),
            fecha_vencimiento: aFecha(periodo.fecha_vencimiento),
            estado: 'activa',
            es_renovacion: ultima !== null,
            id_membresia_anterior: ultima?.id_membresia ?? null,
            creada_por: ctx.usuario.id_usuario,
          },
        });

        let pago: { id_pago: number; folio: string; monto: number } | null = null;
        if (dto.pago) {
          const monto = dto.pago.monto ?? precio;
          if (monto <= 0) {
            throw new BadRequestException('El monto del pago debe ser mayor a 0.');
          }
          const idSedePago = dto.pago.id_sede ?? socio.id_sede;
          exigirSede(ctx.usuario, idSedePago);

          const creado = await tx.pago.create({
            data: {
              folio: folioTemporal(),
              id_socio: idSocio,
              id_membresia: membresia.id_membresia,
              id_plan: plan.id_plan,
              id_sede: idSedePago,
              monto: new Prisma.Decimal(monto.toFixed(2)),
              metodo: dto.pago.metodo,
              referencia: dto.pago.referencia ?? null,
              registrado_por: ctx.usuario.id_usuario,
            },
          });
          const folio = folioPago(creado.id_pago, hoy);
          await tx.pago.update({ where: { id_pago: creado.id_pago }, data: { folio } });
          pago = { id_pago: idNumero(creado.id_pago), folio, monto };

          await this.audit.registrar(
            ctx,
            {
              entidad: 'pago',
              idEntidad: creado.id_pago,
              idSocio,
              accion: 'crear',
              nuevo: {
                folio,
                monto,
                metodo: dto.pago.metodo,
                id_membresia: membresia.id_membresia,
                id_plan: plan.id_plan,
              },
            },
            tx,
          );
        }

        await this.audit.registrar(
          ctx,
          {
            entidad: 'membresia',
            idEntidad: membresia.id_membresia,
            idSocio,
            accion: 'crear',
            nuevo: {
              id_plan: plan.id_plan,
              fecha_inicio: periodo.fecha_inicio,
              fecha_vencimiento: periodo.fecha_vencimiento,
              es_renovacion: ultima !== null,
              acumulada: periodo.acumulada,
            },
          },
          tx,
        );
        await this.audit.interaccion(
          ctx,
          idSocio,
          ultima ? 'renovacion' : 'otro',
          `${ultima ? 'Renovación' : 'Alta'} de membresía "${plan.nombre}" ` +
            `del ${periodo.fecha_inicio} al ${periodo.fecha_vencimiento}` +
            (pago ? `. Pago ${pago.folio} por $${pago.monto.toFixed(2)}.` : '.'),
          tx,
        );

        return {
          id_membresia: membresia.id_membresia,
          plan: { id_plan: plan.id_plan, nombre: plan.nombre },
          fecha_inicio: periodo.fecha_inicio,
          fecha_vencimiento: periodo.fecha_vencimiento,
          es_renovacion: ultima !== null,
          acumulada: periodo.acumulada,
          pago: pago && {
            ...pago,
            comprobante_url: `/pagos/${pago.id_pago}/comprobante`,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async congelar(idMembresia: number, dto: CongelarMembresiaDto, ctx: ContextoPeticion) {
    const hoy = hoyISO();
    const inicio = dto.fecha_inicio ?? hoy;
    const fin = dto.fecha_fin;

    return this.prisma.$transaction(
      async (tx) => {
        const m = await tx.membresia.findUnique({
          where: { id_membresia: idMembresia },
          include: { socio: true, congelamientos: true },
        });
        if (!m) throw new NotFoundException('Membresía no encontrada.');
        exigirSede(ctx.usuario, m.socio.id_sede);
        if (m.estado === 'cancelada') {
          throw new ConflictException('No se puede congelar una membresía cancelada.');
        }

        const mIni = aISO(m.fecha_inicio);
        const mVenc = aISO(m.fecha_vencimiento);
        if (inicio < hoy) {
          throw new BadRequestException('No se permiten congelamientos retroactivos.');
        }
        if (fin < inicio) {
          throw new BadRequestException('fecha_fin debe ser igual o posterior a fecha_inicio.');
        }
        if (inicio < mIni || inicio > mVenc) {
          throw new BadRequestException(
            `El congelamiento debe iniciar dentro de la vigencia (${mIni} a ${mVenc}).`,
          );
        }

        const periodo = { fecha_inicio: inicio, fecha_fin: fin };
        const dias = diasCongelamiento(periodo);
        const yaCongelados = m.congelamientos.reduce((s, c) => s + c.dias_extendidos, 0);
        if (yaCongelados + dias > this.maxDiasCongelamiento) {
          throw new BadRequestException(
            `Se excede el máximo de ${this.maxDiasCongelamiento} días congelados por membresía ` +
              `(ya usados: ${yaCongelados}).`,
          );
        }
        const traslape = m.congelamientos.find((c) =>
          seTraslapan(periodo, { fecha_inicio: aISO(c.fecha_inicio), fecha_fin: aISO(c.fecha_fin) }),
        );
        if (traslape) {
          throw new ConflictException('El periodo se traslapa con otro congelamiento.');
        }

        const congelamiento = await tx.congelamientoMembresia.create({
          data: {
            id_membresia: idMembresia,
            fecha_inicio: aFecha(inicio),
            fecha_fin: aFecha(fin),
            dias_extendidos: dias,
            motivo: dto.motivo ?? null,
            registrado_por: ctx.usuario.id_usuario,
          },
        });
        const nuevoVenc = sumarDias(mVenc, dias);
        await tx.membresia.update({
          where: { id_membresia: idMembresia },
          data: { fecha_vencimiento: aFecha(nuevoVenc) },
        });

        // Las renovaciones ya pagadas que inician después se recorren los mismos días
        const posteriores = await tx.membresia.findMany({
          where: {
            id_socio: m.id_socio,
            estado: { not: 'cancelada' },
            fecha_inicio: { gt: m.fecha_vencimiento },
          },
          include: { congelamientos: true },
        });
        for (const p of posteriores) {
          await tx.membresia.update({
            where: { id_membresia: p.id_membresia },
            data: {
              fecha_inicio: aFecha(sumarDias(aISO(p.fecha_inicio), dias)),
              fecha_vencimiento: aFecha(sumarDias(aISO(p.fecha_vencimiento), dias)),
            },
          });
          for (const c of p.congelamientos) {
            await tx.congelamientoMembresia.update({
              where: { id_congelamiento: c.id_congelamiento },
              data: {
                fecha_inicio: aFecha(sumarDias(aISO(c.fecha_inicio), dias)),
                fecha_fin: aFecha(sumarDias(aISO(c.fecha_fin), dias)),
              },
            });
          }
        }

        await this.audit.registrar(
          ctx,
          {
            entidad: 'membresia',
            idEntidad: idMembresia,
            idSocio: m.id_socio,
            accion: 'modificar',
            anterior: { fecha_vencimiento: mVenc },
            nuevo: {
              fecha_vencimiento: nuevoVenc,
              congelamiento: { ...periodo, dias },
              renovaciones_recorridas: posteriores.map((p) => p.id_membresia),
            },
          },
          tx,
        );
        await this.audit.interaccion(
          ctx,
          m.id_socio,
          'otro',
          `Membresía congelada del ${inicio} al ${fin} (${dias} días). ` +
            `Nuevo vencimiento: ${nuevoVenc}.` +
            (dto.motivo ? ` Motivo: ${dto.motivo}` : ''),
          tx,
        );

        return {
          id_congelamiento: congelamiento.id_congelamiento,
          id_membresia: idMembresia,
          fecha_inicio: inicio,
          fecha_fin: fin,
          dias_extendidos: dias,
          fecha_vencimiento_anterior: mVenc,
          fecha_vencimiento_nueva: nuevoVenc,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private mapear(m: MembresiaCompleta, hoy: string, diasAviso: number) {
    const f = aFechas(m);
    return {
      id_membresia: m.id_membresia,
      plan: m.plan,
      fecha_inicio: f.fecha_inicio,
      fecha_vencimiento: f.fecha_vencimiento,
      estado: calcularEstado(f, hoy, diasAviso),
      es_renovacion: m.es_renovacion,
      id_membresia_anterior: m.id_membresia_anterior,
      creada_en: m.creada_en,
      congelamientos: m.congelamientos.map((c) => ({
        id_congelamiento: c.id_congelamiento,
        fecha_inicio: aISO(c.fecha_inicio),
        fecha_fin: aISO(c.fecha_fin),
        dias_extendidos: c.dias_extendidos,
        motivo: c.motivo,
      })),
      pagos: m.pagos.map((p) => ({
        ...p,
        id_pago: idNumero(p.id_pago),
        monto: aNumero(p.monto),
      })),
    };
  }

  /**
   * Termina un congelamiento antes de lo previsto (ayer es su último día) o lo anula si aún
   * no empieza. El vencimiento y las renovaciones posteriores se recorren hacia atrás.
   */
  async terminarCongelamiento(idCongelamiento: number, ctx: ContextoPeticion) {
    const hoy = hoyISO();
    return this.prisma.$transaction(
      async (tx) => {
        const c = await tx.congelamientoMembresia.findUnique({
          where: { id_congelamiento: idCongelamiento },
          include: { membresia: { include: { socio: true } } },
        });
        if (!c) throw new NotFoundException('Congelamiento no encontrado.');
        exigirSede(ctx.usuario, c.membresia.socio.id_sede);
        const ini = aISO(c.fecha_inicio);
        const fin = aISO(c.fecha_fin);
        if (fin < hoy) throw new ConflictException('El congelamiento ya terminó.');

        const anula = ini >= hoy;
        const nuevoFin = sumarDias(hoy, -1);
        const diasNuevos = anula ? 0 : diasCongelamiento({ fecha_inicio: ini, fecha_fin: nuevoFin });
        const reduccion = c.dias_extendidos - diasNuevos;

        if (anula) await tx.congelamientoMembresia.delete({ where: { id_congelamiento: idCongelamiento } });
        else {
          await tx.congelamientoMembresia.update({
            where: { id_congelamiento: idCongelamiento },
            data: { fecha_fin: aFecha(nuevoFin), dias_extendidos: diasNuevos },
          });
        }
        const m = c.membresia;
        const vencAnterior = aISO(m.fecha_vencimiento);
        const nuevoVenc = sumarDias(vencAnterior, -reduccion);
        await tx.membresia.update({ where: { id_membresia: m.id_membresia }, data: { fecha_vencimiento: aFecha(nuevoVenc) } });

        const posteriores = await tx.membresia.findMany({
          where: { id_socio: m.id_socio, estado: { not: 'cancelada' }, fecha_inicio: { gt: m.fecha_vencimiento } },
          include: { congelamientos: true },
        });
        for (const p of posteriores) {
          await tx.membresia.update({
            where: { id_membresia: p.id_membresia },
            data: {
              fecha_inicio: aFecha(sumarDias(aISO(p.fecha_inicio), -reduccion)),
              fecha_vencimiento: aFecha(sumarDias(aISO(p.fecha_vencimiento), -reduccion)),
            },
          });
          for (const pc of p.congelamientos) {
            await tx.congelamientoMembresia.update({
              where: { id_congelamiento: pc.id_congelamiento },
              data: {
                fecha_inicio: aFecha(sumarDias(aISO(pc.fecha_inicio), -reduccion)),
                fecha_fin: aFecha(sumarDias(aISO(pc.fecha_fin), -reduccion)),
              },
            });
          }
        }
        await this.audit.registrar(
          ctx,
          {
            entidad: 'membresia',
            idEntidad: m.id_membresia,
            idSocio: m.id_socio,
            accion: 'modificar',
            anterior: { fecha_vencimiento: vencAnterior, congelamiento: { fecha_inicio: ini, fecha_fin: fin } },
            nuevo: { fecha_vencimiento: nuevoVenc, congelamiento: anula ? null : { fecha_inicio: ini, fecha_fin: nuevoFin } },
          },
          tx,
        );
        await this.audit.interaccion(
          ctx,
          m.id_socio,
          'otro',
          anula
            ? `Congelamiento del ${ini} al ${fin} anulado. Nuevo vencimiento: ${nuevoVenc}.`
            : `Congelamiento terminado antes de tiempo (último día ${nuevoFin}). Nuevo vencimiento: ${nuevoVenc}.`,
          tx,
        );
        return { id_membresia: m.id_membresia, fecha_vencimiento: nuevoVenc, dias_devueltos: reduccion, anulado: anula };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

}
