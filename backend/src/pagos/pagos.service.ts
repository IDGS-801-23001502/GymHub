import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion, UsuarioAutenticado } from '../common/auth/auth.types.js';
import { exigirSede, filtroSedes } from '../common/auth/sedes.js';
import { aFecha, aISO, sumarDias } from '../common/utils/fechas.js';
import { aNumero, idNumero } from '../common/utils/serializar.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { renderComprobante } from './comprobante.js';
import type { CancelarPagoDto, ListarPagosDto } from './dto/pago.dto.js';

const MAX_POR_PAGINA = 200;

const incluirPago = {
  socio: { select: { id_socio: true, folio: true, nombre: true } },
  plan: { select: { id_plan: true, nombre: true, tipo: true } },
  sede: { select: { id_sede: true, nombre: true, direccion: true, telefono: true } },
  membresia: {
    select: { id_membresia: true, fecha_inicio: true, fecha_vencimiento: true, estado: true },
  },
  registrador: { select: { id_usuario: true, nombre: true } },
  autorizador: { select: { id_usuario: true, nombre: true } },
} satisfies Prisma.PagoInclude;

type PagoCompleto = Prisma.PagoGetPayload<{ include: typeof incluirPago }>;

/** Pagos presenciales (CRM-RF-04). El alta ocurre en MembresiasService.asignar. */
@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(f: ListarPagosDto, usuario: UsuarioAutenticado) {
    if (f.id_sede !== undefined) exigirSede(usuario, f.id_sede);
    const pagina = f.pagina ?? 1;
    const porPagina = Math.min(f.por_pagina ?? 50, MAX_POR_PAGINA);

    const where: Prisma.PagoWhereInput = {
      id_socio: f.id_socio,
      id_sede: f.id_sede ?? filtroSedes(usuario),
      estado: f.estado,
      fecha_pago: {
        gte: f.desde ? aFecha(f.desde) : undefined,
        lt: f.hasta ? aFecha(sumarDias(f.hasta, 1)) : undefined,
      },
    };
    const [total, pagos] = await Promise.all([
      this.prisma.pago.count({ where }),
      this.prisma.pago.findMany({
        where,
        include: incluirPago,
        orderBy: { fecha_pago: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { total, pagina, por_pagina: porPagina, datos: pagos.map(mapearPago) };
  }

  async obtener(idPago: number, usuario: UsuarioAutenticado) {
    return mapearPago(await this.buscarAutorizado(idPago, usuario));
  }

  async comprobante(idPago: number, usuario: UsuarioAutenticado): Promise<string> {
    return renderComprobante(mapearPago(await this.buscarAutorizado(idPago, usuario)));
  }

  /** Si la membresía se queda sin pagos válidos, también se cancela. */
  async cancelar(idPago: number, dto: CancelarPagoDto, ctx: ContextoPeticion) {
    const pago = await this.prisma.$transaction(
      async (tx) => {
        const pago = await tx.pago.findUnique({
          where: { id_pago: BigInt(idPago) },
          include: {
            membresia: {
              include: {
                renovaciones: {
                  where: { estado: { not: 'cancelada' } },
                  select: { id_membresia: true },
                },
              },
            },
          },
        });
        if (!pago) throw new NotFoundException('Pago no encontrado.');
        exigirSede(ctx.usuario, pago.id_sede);
        if (pago.estado === 'cancelado') {
          throw new ConflictException('El pago ya está cancelado.');
        }

        const otrosValidos = await tx.pago.count({
          where: {
            id_membresia: pago.id_membresia,
            estado: 'registrado',
            NOT: { id_pago: pago.id_pago },
          },
        });
        const cancelaMembresia = otrosValidos === 0;
        if (cancelaMembresia && pago.membresia.renovaciones.length > 0) {
          throw new ConflictException(
            'La membresía de este pago tiene una renovación posterior vigente; ' +
              'cancela primero el pago de la renovación.',
          );
        }

        await tx.pago.update({
          where: { id_pago: pago.id_pago },
          data: {
            estado: 'cancelado',
            motivo_cancelacion: dto.motivo,
            autorizado_por: ctx.usuario.id_usuario,
            cancelado_en: new Date(),
          },
        });
        await this.audit.registrar(
          ctx,
          {
            entidad: 'pago',
            idEntidad: pago.id_pago,
            idSocio: pago.id_socio,
            accion: 'cancelar',
            anterior: { estado: 'registrado' },
            nuevo: { estado: 'cancelado', motivo: dto.motivo, membresia_cancelada: cancelaMembresia },
          },
          tx,
        );

        if (cancelaMembresia) {
          await tx.membresia.update({
            where: { id_membresia: pago.id_membresia },
            data: { estado: 'cancelada' },
          });
          await this.audit.registrar(
            ctx,
            {
              entidad: 'membresia',
              idEntidad: pago.id_membresia,
              idSocio: pago.id_socio,
              accion: 'cancelar',
              anterior: { estado: pago.membresia.estado },
              nuevo: { estado: 'cancelada', por_pago: pago.folio },
            },
            tx,
          );
        }
        await this.audit.interaccion(
          ctx,
          pago.id_socio,
          'pago',
          `Pago ${pago.folio} cancelado. Motivo: ${dto.motivo}` +
            (cancelaMembresia ? '. La membresía asociada quedó cancelada.' : ''),
          tx,
        );
        return pago.id_pago;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.obtener(idNumero(pago), ctx.usuario);
  }

  private async buscarAutorizado(idPago: number, usuario: UsuarioAutenticado) {
    const pago = await this.prisma.pago.findUnique({
      where: { id_pago: BigInt(idPago) },
      include: incluirPago,
    });
    if (!pago) throw new NotFoundException('Pago no encontrado.');
    exigirSede(usuario, pago.id_sede);
    return pago;
  }
}

export function mapearPago(p: PagoCompleto) {
  return {
    id_pago: idNumero(p.id_pago),
    folio: p.folio,
    socio: p.socio,
    plan: p.plan,
    sede: p.sede,
    membresia: {
      id_membresia: p.membresia.id_membresia,
      fecha_inicio: aISO(p.membresia.fecha_inicio),
      fecha_vencimiento: aISO(p.membresia.fecha_vencimiento),
      estado: p.membresia.estado,
    },
    monto: aNumero(p.monto),
    metodo: p.metodo,
    referencia: p.referencia,
    estado: p.estado,
    fecha_pago: p.fecha_pago,
    registrado_por: p.registrador,
    motivo_cancelacion: p.motivo_cancelacion,
    autorizado_por: p.autorizador,
    cancelado_en: p.cancelado_en,
  };
}

export type PagoDetalle = ReturnType<typeof mapearPago>;
