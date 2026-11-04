import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { SOCIO_KEY } from '../common/auth/decorators.js';
import { d } from '../../test/helpers/prisma-mock.js';
import { lunesDe, sesionesPlaneadas } from './app-socio.service.js';

const jwt = new JwtService({ secret: 'secreto-de-prueba' });

function contexto(token: string, rutaSocio: boolean) {
  const req: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
  const reflector = { getAllAndOverride: (clave: string) => (clave === SOCIO_KEY ? rutaSocio : false) } as unknown as Reflector;
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { guard: new JwtAuthGuard(jwt, reflector), ctx, req };
}

describe('JwtAuthGuard con tokens de la app', () => {
  it('acepta el token del socio solo en rutas @SoloSocio', async () => {
    const token = await jwt.signAsync({ sub: 7, tipo: 'socio' });
    const app = contexto(token, true);
    await expect(app.guard.canActivate(app.ctx)).resolves.toBe(true);
    expect(app.req.socio).toEqual({ id_socio: 7 });

    const crm = contexto(token, false);
    await expect(crm.guard.canActivate(crm.ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza el token del personal en rutas de la app', async () => {
    const token = await jwt.signAsync({ sub: 1, rol: 'administrador', sedes: [1] });
    const app = contexto(token, true);
    await expect(app.guard.canActivate(app.ctx)).rejects.toThrow(/solo para la app/);
  });
});

describe('progreso de la app', () => {
  it('lunesDe devuelve el lunes de la semana', () => {
    expect(lunesDe('2026-11-03')).toBe('2026-11-02'); // martes
    expect(lunesDe('2026-11-08')).toBe('2026-11-02'); // domingo
    expect(lunesDe('2026-11-02')).toBe('2026-11-02');
  });

  it('sesionesPlaneadas recorta cada rutina al periodo', () => {
    const rutinas = [
      { fecha_inicio: d('2026-10-01'), fecha_fin: d('2026-10-31'), sesiones_planeadas_semana: 3 },
      { fecha_inicio: d('2026-11-01'), fecha_fin: null, sesiones_planeadas_semana: 4 },
    ];
    // 2 semanas de octubre (3/sem) + 2 semanas de noviembre (4/sem) = 6 + 8
    expect(sesionesPlaneadas(rutinas, '2026-10-18', '2026-11-14')).toBe(14);
    expect(sesionesPlaneadas(rutinas, '2026-09-01', '2026-09-30')).toBe(0);
  });
});
