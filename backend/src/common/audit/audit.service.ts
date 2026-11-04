import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { esPersonal, type Actor } from '../auth/auth.types.js';

export type AccionBitacora =
  | 'consulta'
  | 'crear'
  | 'modificar'
  | 'eliminar'
  | 'cancelar'
  | 'login'
  | 'login_fallido';

export interface RegistroBitacora {
  entidad: string;
  idEntidad?: string | number | bigint | null;
  idSocio?: number | null;
  accion: AccionBitacora;
  /** Nunca incluir datos sensibles en claro: usar nombres de campo o '[cifrado]'. */
  anterior?: unknown;
  nuevo?: unknown;
}

export type ClienteDb = PrismaService | Prisma.TransactionClient;

/** Bitácora de auditoría de solo inserción (CRM-RF-20). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Las operaciones del socio desde la app quedan con id_usuario nulo y su id_socio. */
  async registrar(
    ctx: Actor,
    datos: RegistroBitacora,
    cliente: ClienteDb = this.prisma,
  ): Promise<void> {
    await cliente.bitacoraAuditoria.create({
      data: {
        id_usuario: esPersonal(ctx) ? ctx.usuario.id_usuario : null,
        id_socio: datos.idSocio ?? (esPersonal(ctx) ? null : ctx.socio.id_socio),
        entidad: datos.entidad,
        id_entidad: datos.idEntidad == null ? null : String(datos.idEntidad),
        accion: datos.accion,
        valor_anterior:
          datos.anterior === undefined ? null : JSON.stringify(datos.anterior),
        valor_nuevo:
          datos.nuevo === undefined ? null : JSON.stringify(datos.nuevo),
        ip: ctx.ip?.slice(0, 45) ?? null,
      },
    });
  }

  /** Inicios de sesión exitosos y fallidos (sin usuario autenticado aún). */
  async registrarAcceso(
    idUsuario: number | null,
    accion: 'login' | 'login_fallido',
    ip: string | null,
    detalle?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.bitacoraAuditoria.create({
      data: {
        id_usuario: idUsuario,
        entidad: 'usuario',
        id_entidad: idUsuario == null ? null : String(idUsuario),
        accion,
        valor_nuevo: detalle ? JSON.stringify(detalle) : null,
        ip: ip?.slice(0, 45) ?? null,
      },
    });
  }

  /** Línea de tiempo del socio (CRM-RF-15). */
  async interaccion(
    ctx: Actor | null,
    idSocio: number,
    tipo: 'renovacion' | 'pago' | 'cambio_rutina' | 'nota' | 'llamada' | 'notificacion' | 'otro',
    descripcion: string,
    cliente: ClienteDb = this.prisma,
  ): Promise<void> {
    await cliente.interaccionSocio.create({
      data: {
        id_socio: idSocio,
        tipo,
        descripcion: descripcion.slice(0, 1000),
        id_usuario: ctx && esPersonal(ctx) ? ctx.usuario.id_usuario : null,
      },
    });
  }
}
