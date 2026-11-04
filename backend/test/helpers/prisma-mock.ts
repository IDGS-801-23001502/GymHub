import { vi } from 'vitest';
import type { ContextoPeticion } from '../../src/common/auth/auth.types.js';

type Mocks = Record<string, ReturnType<typeof vi.fn>>;

/** Doble de PrismaService; `$transaction(fn)` ejecuta `fn` con el mismo doble. */
export function crearPrismaMock() {
  const modelo = (): Mocks => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn(),
  });
  const prisma = {
    socio: modelo(),
    sede: modelo(),
    avisoPrivacidad: modelo(),
    consentimiento: modelo(),
    planMembresia: modelo(),
    membresia: modelo(),
    congelamientoMembresia: modelo(),
    pago: modelo(),
    fichaSalud: modelo(),
    configRiesgo: modelo(),
    bitacoraAuditoria: modelo(),
    interaccionSocio: modelo(),
    rutinaAsignada: modelo(),
    rutinaVersion: modelo(),
    sesionEntrenamiento: modelo(),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

export type PrismaMock = ReturnType<typeof crearPrismaMock>;

export function ctxRecepcion(sedes = [1]): ContextoPeticion {
  return {
    usuario: { id_usuario: 7, rol: 'recepcionista', sedes, admin_general: false },
    ip: '127.0.0.1',
  };
}

export function ctxEntrenador(sedes = [1]): ContextoPeticion {
  return {
    usuario: { id_usuario: 3, rol: 'entrenador', sedes, admin_general: false },
    ip: '127.0.0.1',
  };
}

export function ctxAdmin(): ContextoPeticion {
  return {
    usuario: { id_usuario: 1, rol: 'administrador', sedes: [1], admin_general: true },
    ip: '127.0.0.1',
  };
}

/** Fecha DATE como la devuelve Prisma. */
export const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
