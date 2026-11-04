import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UsuarioAutenticado } from './auth.types.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

const jwt = new JwtService({ secret: 'secreto-de-pruebas' });

function contexto(req: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  const handler = () => undefined;
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

describe('JwtAuthGuard', () => {
  it('acepta un token válido y deja el usuario en la petición', async () => {
    const token = await jwt.signAsync({ sub: 3, rol: 'recepcionista', sedes: [1] });
    const req: { headers: object; user?: UsuarioAutenticado } = {
      headers: { authorization: `Bearer ${token}` },
    };
    const { ctx, reflector } = contexto(req);
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ id_usuario: 3, rol: 'recepcionista', sedes: [1], admin_general: false });
  });

  it('rechaza peticiones sin token o con token alterado', async () => {
    const sinToken = contexto({ headers: {} });
    await expect(new JwtAuthGuard(jwt, sinToken.reflector).canActivate(sinToken.ctx)).rejects.toThrow(
      UnauthorizedException,
    );
    const otro = new JwtService({ secret: 'otro-secreto' });
    const falso = await otro.signAsync({ sub: 1, rol: 'administrador', sedes: [] });
    const alterado = contexto({ headers: { authorization: `Bearer ${falso}` } });
    await expect(new JwtAuthGuard(jwt, alterado.reflector).canActivate(alterado.ctx)).rejects.toThrow(
      /inválido/,
    );
  });

  it('rechaza roles desconocidos', async () => {
    const token = await jwt.signAsync({ sub: 1, rol: 'root', sedes: [] });
    const { ctx, reflector } = contexto({ headers: { authorization: `Bearer ${token}` } });
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(ctx)).rejects.toThrow(/formato/);
  });

  it('deja pasar rutas públicas', async () => {
    const { ctx, reflector } = contexto({ headers: {} }, { esPublico: true });
    await expect(new JwtAuthGuard(jwt, reflector).canActivate(ctx)).resolves.toBe(true);
  });
});

describe('RolesGuard', () => {
  const usuario = (rol: string) => ({ user: { id_usuario: 1, rol, sedes: [1], admin_general: false } });

  it('permite el rol indicado y siempre al administrador', () => {
    const r1 = contexto(usuario('recepcionista'), { roles: ['recepcionista'] });
    expect(new RolesGuard(r1.reflector).canActivate(r1.ctx)).toBe(true);
    const r2 = contexto(usuario('administrador'), { roles: ['entrenador'] });
    expect(new RolesGuard(r2.reflector).canActivate(r2.ctx)).toBe(true);
  });

  it('niega a roles no permitidos (p. ej. recepción consultando la ficha de salud)', () => {
    const { ctx, reflector } = contexto(usuario('recepcionista'), { roles: ['entrenador'] });
    expect(() => new RolesGuard(reflector).canActivate(ctx)).toThrow(ForbiddenException);
  });
});
