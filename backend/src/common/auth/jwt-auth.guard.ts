import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { sha256 } from '../utils/tokens.js';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PUBLIC_KEY, SOCIO_KEY } from './decorators.js';
import {
  ROLES,
  type JwtPayloadPersonal,
  type JwtPayloadSocio,
  type UsuarioAutenticado,
} from './auth.types.js';

/**
 * Valida el JWT (CRM-RNF-03). Las rutas del CRM aceptan solo tokens del personal
 * (`req.user`) y las marcadas con @SoloSocio solo tokens del socio (`req.socio`).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (esPublico) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: UsuarioAutenticado; socio?: { id_socio: number } }>();
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta el token de acceso.');
    }

    let payload: JwtPayloadPersonal | JwtPayloadSocio;
    try {
      payload = await this.jwt.verifyAsync<JwtPayloadPersonal | JwtPayloadSocio>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    const rutaSocio = this.reflector.getAllAndOverride<boolean>(SOCIO_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (rutaSocio) {
      if (!('tipo' in payload) || payload.tipo !== 'socio' || !Number.isInteger(payload.sub)) {
        throw new UnauthorizedException('Esta ruta es solo para la app del socio.');
      }
      req.socio = { id_socio: payload.sub };
      return true;
    }
    if ('tipo' in payload) {
      throw new UnauthorizedException('El token de la app no da acceso al CRM.');
    }
    if (
      !Number.isInteger(payload.sub) ||
      !ROLES.includes(payload.rol) ||
      !Array.isArray(payload.sedes)
    ) {
      throw new UnauthorizedException('Token con formato inválido.');
    }

    // Sesiones revocables (CRM-RF-18): el token lleva el id de su fila en sesion_usuario
    if (this.prisma && payload.jti) {
      const sesion = await this.prisma.sesionUsuario.findUnique({
        where: { token_hash: sha256(payload.jti) },
        select: { revocada: true, expira_en: true, id_usuario: true },
      });
      if (!sesion || sesion.revocada || sesion.expira_en < new Date() || sesion.id_usuario !== payload.sub) {
        throw new UnauthorizedException('La sesión fue cerrada. Vuelve a iniciar sesión.');
      }
    } else if (this.prisma && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Token sin sesión asociada.');
    }

    req.user = {
      jti: payload.jti,
      id_usuario: payload.sub,
      rol: payload.rol,
      sedes: payload.sedes.map(Number),
      admin_general: payload.admin_general === true,
    };
    return true;
  }
}
