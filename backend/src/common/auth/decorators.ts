import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  ContextoPeticion,
  ContextoSocio,
  RolNombre,
  UsuarioAutenticado,
} from './auth.types.js';

export const PUBLIC_KEY = 'esPublico';
export const ROLES_KEY = 'roles';
export const SOCIO_KEY = 'soloSocio';

/** Marca una ruta como pública (sin JWT). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Roles permitidos. El administrador siempre tiene acceso (acceso total). */
export const Roles = (...roles: RolNombre[]) => SetMetadata(ROLES_KEY, roles);

/** Rutas de la app móvil: exigen el token del socio en lugar del del personal. */
export const SoloSocio = () => SetMetadata(SOCIO_KEY, true);

/** Inyecta { socio, ip } en las rutas de la app. */
export const SocioCtx = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContextoSocio => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { socio: { id_socio: number } }>();
    return { socio: req.socio, ip: req.ip ?? null };
  },
);

/** Inyecta { usuario, ip } para servicios que registran en bitácora. */
export const Ctx = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ContextoPeticion => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user: UsuarioAutenticado }>();
    return { usuario: req.user, ip: req.ip ?? null };
  },
);
