import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { crearPrismaMock, type PrismaMock } from '../../test/helpers/prisma-mock.js';
import { AuthService } from './auth.service.js';

const jwt = new JwtService({ secret: 'secreto-de-pruebas' });
const hash = bcrypt.hashSync('Correcta#2026', 4);

const usuario = (extra = {}) => ({
  id_usuario: 2,
  nombre: 'Recepción',
  correo: 'recepcion@gymhub.dev',
  password_hash: hash,
  activo: true,
  es_admin_general: false,
  intentos_fallidos: 0,
  bloqueado_hasta: null,
  rol: { nombre: 'recepcionista' },
  sedes: [
    { sede: { id_sede: 1, nombre: 'Matriz', activa: true } },
    { sede: { id_sede: 3, nombre: 'Cerrada', activa: false } },
  ],
  ...extra,
});

describe('AuthService.login', () => {
  let prisma: PrismaMock & {
    usuario: Record<string, ReturnType<typeof vi.fn>>;
    sesionUsuario: Record<string, ReturnType<typeof vi.fn>>;
  };
  let servicio: AuthService;

  beforeEach(() => {
    prisma = Object.assign(crearPrismaMock(), {
      usuario: { findUnique: vi.fn(), update: vi.fn() },
      sesionUsuario: { create: vi.fn(), updateMany: vi.fn() },
    });
    const db = prisma as unknown as PrismaService;
    servicio = new AuthService(db, jwt, new AuditService(db), {
      get: (k: string) => (k === 'LOGIN_MAX_INTENTOS' ? 3 : undefined),
    } as unknown as ConfigService);
  });

  it('emite un JWT con rol y sedes activas, reinicia intentos y registra el acceso', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario({ intentos_fallidos: 2 }));

    const r = await servicio.login({ correo: 'recepcion@gymhub.dev', password: 'Correcta#2026' }, '1.1.1.1');

    const payload = await jwt.verifyAsync(r.access_token);
    expect(payload).toMatchObject({ sub: 2, rol: 'recepcionista', sedes: [1], admin_general: false });
    expect(r.usuario.sedes).toEqual([{ id_sede: 1, nombre: 'Matriz' }]);
    expect(prisma.usuario.update.mock.calls[0][0].data).toMatchObject({ intentos_fallidos: 0, bloqueado_hasta: null });
    expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('login');
    // La sesión queda registrada para poder cerrarla desde el servidor
    expect(payload.jti).toEqual(expect.any(String));
    expect(prisma.sesionUsuario.create.mock.calls[0][0].data.token_hash).toHaveLength(64);
  });

  it('con contraseña incorrecta suma el intento y responde un mensaje genérico', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario());
    await expect(
      servicio.login({ correo: 'recepcion@gymhub.dev', password: 'mala' }, null),
    ).rejects.toThrow('Correo o contraseña incorrectos.');
    expect(prisma.usuario.update.mock.calls[0][0].data.intentos_fallidos).toBe(1);
    expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('login_fallido');
  });

  it('bloquea la cuenta al llegar al máximo de intentos', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario({ intentos_fallidos: 2 }));
    await expect(servicio.login({ correo: 'recepcion@gymhub.dev', password: 'mala' }, null)).rejects.toThrow();
    const data = prisma.usuario.update.mock.calls[0][0].data;
    expect(data.bloqueado_hasta).toBeInstanceOf(Date);
  });

  it('rechaza cuentas bloqueadas aunque la contraseña sea correcta', async () => {
    prisma.usuario.findUnique.mockResolvedValue(
      usuario({ bloqueado_hasta: new Date(Date.now() + 10 * 60_000) }),
    );
    await expect(
      servicio.login({ correo: 'recepcion@gymhub.dev', password: 'Correcta#2026' }, null),
    ).rejects.toThrow(/bloqueada/);
  });

  it('mismo mensaje para correo inexistente o usuario inactivo', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(servicio.login({ correo: 'x@y.com', password: 'a' }, null)).rejects.toThrow(
      UnauthorizedException,
    );
    prisma.usuario.findUnique.mockResolvedValue(usuario({ activo: false }));
    await expect(
      servicio.login({ correo: 'recepcion@gymhub.dev', password: 'Correcta#2026' }, null),
    ).rejects.toThrow('Correo o contraseña incorrectos.');
  });
});
