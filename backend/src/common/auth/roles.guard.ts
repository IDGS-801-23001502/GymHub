import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY, ROLES_KEY, SOCIO_KEY } from './decorators.js';
import type { RolNombre, UsuarioAutenticado } from './auth.types.js';

/** Autorización por rol (CRM-RNF-03). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, objetivos) ||
      this.reflector.getAllAndOverride<boolean>(SOCIO_KEY, objetivos)
    ) {
      return true;
    }
    const roles = this.reflector.getAllAndOverride<RolNombre[]>(
      ROLES_KEY,
      objetivos,
    );
    if (!roles?.length) return true;

    const usuario = ctx
      .switchToHttp()
      .getRequest<{ user?: UsuarioAutenticado }>().user;
    if (
      usuario &&
      (usuario.rol === 'administrador' || roles.includes(usuario.rol))
    ) {
      return true;
    }
    throw new ForbiddenException('Tu rol no tiene permiso para esta operación.');
  }
}
