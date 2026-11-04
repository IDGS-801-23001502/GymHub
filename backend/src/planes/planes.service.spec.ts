import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { crearPrismaMock, ctxAdmin, type PrismaMock } from '../../test/helpers/prisma-mock.js';
import { PlanesService } from './planes.service.js';

const plan = (extra = {}) => ({
  id_plan: 1,
  nombre: 'Mensual',
  tipo: 'mensual',
  duracion_dias: 30,
  precio: new Prisma.Decimal('500.00'),
  beneficios: null,
  activo: true,
  creado_en: new Date(),
  ...extra,
});

describe('PlanesService', () => {
  let prisma: PrismaMock;
  let servicio: PlanesService;

  beforeEach(() => {
    prisma = crearPrismaMock();
    const db = prisma as unknown as PrismaService;
    servicio = new PlanesService(db, new AuditService(db));
    prisma.planMembresia.create.mockImplementation(({ data }) => plan({ ...data }));
    prisma.planMembresia.update.mockImplementation(({ data }) =>
      plan(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))),
    );
  });

  it('lista solo activos salvo que se pidan inactivos', async () => {
    await servicio.listar();
    expect(prisma.planMembresia.findMany.mock.calls[0][0].where).toEqual({ activo: true });
    await servicio.listar(true);
    expect(prisma.planMembresia.findMany.mock.calls[1][0].where).toBeUndefined();
  });

  it('crea con duración por tipo y precio decimal, y audita', async () => {
    const r = await servicio.crear({ nombre: 'Anual', tipo: 'anual', precio: 4800 }, ctxAdmin());
    expect(prisma.planMembresia.create.mock.calls[0][0].data.duracion_dias).toBe(365);
    expect(r.precio).toBe(4800);
    expect(prisma.bitacoraAuditoria.create).toHaveBeenCalled();
  });

  it('rechaza nombres duplicados', async () => {
    prisma.planMembresia.findFirst.mockResolvedValue(plan());
    await expect(
      servicio.crear({ nombre: 'Mensual', tipo: 'mensual', precio: 1 }, ctxAdmin()),
    ).rejects.toThrow(ConflictException);
  });

  it('actualiza y registra valores anterior y nuevo', async () => {
    prisma.planMembresia.findUnique.mockResolvedValue(plan());
    const r = await servicio.actualizar(1, { precio: 550 }, ctxAdmin());
    expect(r.precio).toBe(550);
    const datos = prisma.bitacoraAuditoria.create.mock.calls[0][0].data;
    expect(JSON.parse(datos.valor_anterior).precio).toBe(500);
  });

  it('desactiva sin borrar (se conserva en el historial)', async () => {
    prisma.planMembresia.findUnique.mockResolvedValue(plan());
    const r = await servicio.cambiarEstado(1, false, ctxAdmin());
    expect(r.activo).toBe(false);
    expect(prisma.planMembresia.update).toHaveBeenCalledWith({ where: { id_plan: 1 }, data: { activo: false } });
  });

  it('no hace nada si el estado ya es el pedido; 404 si no existe', async () => {
    prisma.planMembresia.findUnique.mockResolvedValueOnce(plan());
    await servicio.cambiarEstado(1, true, ctxAdmin());
    expect(prisma.planMembresia.update).not.toHaveBeenCalled();
    prisma.planMembresia.findUnique.mockResolvedValueOnce(null);
    await expect(servicio.obtener(9)).rejects.toThrow(NotFoundException);
  });
});
