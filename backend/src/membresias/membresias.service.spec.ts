import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuditService } from '../common/audit/audit.service.js';
import { hoyISO, sumarDias } from '../common/utils/fechas.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  crearPrismaMock,
  ctxRecepcion,
  d,
  type PrismaMock,
} from '../../test/helpers/prisma-mock.js';
import { MembresiasService } from './membresias.service.js';

const config = { get: () => undefined } as unknown as ConfigService;

describe('MembresiasService', () => {
  let prisma: PrismaMock;
  let servicio: MembresiasService;
  const hoy = hoyISO();

  const socio = { id_socio: 10, id_sede: 1, estado: 'activo' };
  const plan = {
    id_plan: 2,
    nombre: 'Mensual',
    duracion_dias: 30,
    precio: new Prisma.Decimal('500.00'),
    activo: true,
  };

  beforeEach(() => {
    prisma = crearPrismaMock();
    const db = prisma as unknown as PrismaService;
    servicio = new MembresiasService(db, new AuditService(db), config);
    prisma.socio.findUnique.mockResolvedValue(socio);
    prisma.planMembresia.findUnique.mockResolvedValue(plan);
    prisma.membresia.create.mockImplementation(({ data }) => ({ id_membresia: 99, ...data }));
    prisma.pago.create.mockResolvedValue({ id_pago: 5n });
  });

  describe('asignar', () => {
    it('alta nueva: inicia hoy, registra pago con folio y bitácora en la misma transacción', async () => {
      prisma.membresia.findFirst.mockResolvedValue(null);

      const r = await servicio.asignar(10, { id_plan: 2, pago: { metodo: 'efectivo' } }, ctxRecepcion());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(r.fecha_inicio).toBe(hoy);
      expect(r.fecha_vencimiento).toBe(sumarDias(hoy, 29));
      expect(r.es_renovacion).toBe(false);
      expect(r.pago).toMatchObject({ id_pago: 5, monto: 500 });
      expect(r.pago!.folio).toMatch(/^P\d{8}-000005$/);
      expect(prisma.pago.create.mock.calls[0][0].data).toMatchObject({
        id_sede: 1,
        metodo: 'efectivo',
        registrado_por: 7,
      });
      expect(prisma.bitacoraAuditoria.create).toHaveBeenCalledTimes(2); // pago + membresía
      expect(prisma.interaccionSocio.create).toHaveBeenCalledTimes(1);
    });

    it('renovación con vigencia: se acumula al vencimiento actual', async () => {
      const venceEn = sumarDias(hoy, 5);
      prisma.membresia.findFirst.mockResolvedValue({ id_membresia: 50, fecha_vencimiento: d(venceEn) });

      const r = await servicio.asignar(10, { id_plan: 2, pago: { metodo: 'tarjeta' } }, ctxRecepcion());

      expect(r.fecha_inicio).toBe(sumarDias(venceEn, 1));
      expect(r.es_renovacion).toBe(true);
      expect(r.acumulada).toBe(true);
      expect(prisma.membresia.create.mock.calls[0][0].data.id_membresia_anterior).toBe(50);
    });

    it('renovación de membresía vencida: inicia hoy pero queda ligada a la anterior', async () => {
      prisma.membresia.findFirst.mockResolvedValue({
        id_membresia: 50,
        fecha_vencimiento: d(sumarDias(hoy, -3)),
      });
      const r = await servicio.asignar(10, { id_plan: 2, pago: { metodo: 'efectivo' } }, ctxRecepcion());
      expect(r.fecha_inicio).toBe(hoy);
      expect(r).toMatchObject({ es_renovacion: true, acumulada: false });
    });

    it('rechaza planes desactivados', async () => {
      prisma.planMembresia.findUnique.mockResolvedValue({ ...plan, activo: false });
      await expect(
        servicio.asignar(10, { id_plan: 2, pago: { metodo: 'efectivo' } }, ctxRecepcion()),
      ).rejects.toThrow(ConflictException);
    });

    it('exige el pago si el plan tiene precio', async () => {
      await expect(servicio.asignar(10, { id_plan: 2 }, ctxRecepcion())).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.membresia.create).not.toHaveBeenCalled();
    });

    it('rechaza socios dados de baja', async () => {
      prisma.socio.findUnique.mockResolvedValue({ ...socio, estado: 'baja' });
      await expect(
        servicio.asignar(10, { id_plan: 2, pago: { metodo: 'efectivo' } }, ctxRecepcion()),
      ).rejects.toThrow(/reactívalo/);
    });

    it('no permite operar socios de otra sede', async () => {
      await expect(
        servicio.asignar(10, { id_plan: 2, pago: { metodo: 'efectivo' } }, ctxRecepcion([3])),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('congelar', () => {
    const membresia = (extra = {}) => ({
      id_membresia: 20,
      id_socio: 10,
      estado: 'activa',
      fecha_inicio: d(sumarDias(hoy, -10)),
      fecha_vencimiento: d(sumarDias(hoy, 20)),
      socio,
      congelamientos: [],
      ...extra,
    });

    it('extiende el vencimiento los días congelados y recorre renovaciones posteriores', async () => {
      prisma.membresia.findUnique.mockResolvedValue(membresia());
      prisma.congelamientoMembresia.create.mockResolvedValue({ id_congelamiento: 3 });
      prisma.membresia.findMany.mockResolvedValue([
        {
          id_membresia: 21,
          fecha_inicio: d(sumarDias(hoy, 21)),
          fecha_vencimiento: d(sumarDias(hoy, 50)),
          congelamientos: [],
        },
      ]);

      const r = await servicio.congelar(
        20,
        { fecha_inicio: hoy, fecha_fin: sumarDias(hoy, 9), motivo: 'Viaje' },
        ctxRecepcion(),
      );

      expect(r.dias_extendidos).toBe(10);
      expect(r.fecha_vencimiento_nueva).toBe(sumarDias(hoy, 30));
      const updates = prisma.membresia.update.mock.calls.map((c) => c[0]);
      expect(updates[1]).toMatchObject({
        where: { id_membresia: 21 },
        data: { fecha_inicio: d(sumarDias(hoy, 31)), fecha_vencimiento: d(sumarDias(hoy, 60)) },
      });
    });

    it('rechaza congelamientos retroactivos', async () => {
      prisma.membresia.findUnique.mockResolvedValue(membresia());
      await expect(
        servicio.congelar(20, { fecha_inicio: sumarDias(hoy, -1), fecha_fin: hoy }, ctxRecepcion()),
      ).rejects.toThrow(/retroactivos/);
    });

    it('rechaza traslapes con otro congelamiento', async () => {
      prisma.membresia.findUnique.mockResolvedValue(
        membresia({
          congelamientos: [
            { fecha_inicio: d(sumarDias(hoy, 2)), fecha_fin: d(sumarDias(hoy, 4)), dias_extendidos: 3 },
          ],
        }),
      );
      await expect(
        servicio.congelar(20, { fecha_inicio: hoy, fecha_fin: sumarDias(hoy, 3) }, ctxRecepcion()),
      ).rejects.toThrow(/traslapa/);
    });

    it('respeta el máximo de días congelados', async () => {
      prisma.membresia.findUnique.mockResolvedValue(membresia());
      await expect(
        servicio.congelar(20, { fecha_inicio: hoy, fecha_fin: sumarDias(hoy, 90) }, ctxRecepcion()),
      ).rejects.toThrow(/máximo de 90/);
    });

    it('no congela membresías canceladas', async () => {
      prisma.membresia.findUnique.mockResolvedValue(membresia({ estado: 'cancelada' }));
      await expect(
        servicio.congelar(20, { fecha_fin: sumarDias(hoy, 3) }, ctxRecepcion()),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('historial', () => {
    it('devuelve resumen y cada membresía con estado calculado, pagos serializados', async () => {
      prisma.membresia.findMany.mockResolvedValue([
        {
          id_membresia: 2,
          plan: { id_plan: 2, nombre: 'Mensual' },
          fecha_inicio: d(sumarDias(hoy, -5)),
          fecha_vencimiento: d(sumarDias(hoy, 3)),
          estado: 'activa',
          es_renovacion: true,
          id_membresia_anterior: 1,
          creada_en: new Date(),
          congelamientos: [],
          pagos: [{ id_pago: 9n, folio: 'P1', monto: new Prisma.Decimal('500'), metodo: 'efectivo', estado: 'registrado', fecha_pago: new Date() }],
        },
        {
          id_membresia: 1,
          plan: { id_plan: 2, nombre: 'Mensual' },
          fecha_inicio: d(sumarDias(hoy, -40)),
          fecha_vencimiento: d(sumarDias(hoy, -6)),
          estado: 'activa',
          es_renovacion: false,
          id_membresia_anterior: null,
          creada_en: new Date(),
          congelamientos: [],
          pagos: [],
        },
      ]);

      const r = await servicio.historial(10, ctxRecepcion().usuario);

      expect(r.resumen).toMatchObject({ id_membresia: 2, estado: 'por_vencer', dias_restantes: 3 });
      expect(r.membresias.map((m) => m.estado)).toEqual(['por_vencer', 'vencida']);
      expect(r.membresias[0].pagos[0]).toMatchObject({ id_pago: 9, monto: 500 });
    });
  });

  describe('diasAvisoPorSede', () => {
    it('usa la configuración de la sede, luego la global y luego 7', async () => {
      prisma.configRiesgo.findMany.mockResolvedValue([
        { id_sede: null, dias_aviso_vencimiento: 5 },
        { id_sede: 2, dias_aviso_vencimiento: 10 },
      ]);
      const dias = await servicio.diasAvisoPorSede();
      expect(dias(2)).toBe(10);
      expect(dias(1)).toBe(5);

      prisma.configRiesgo.findMany.mockResolvedValue([]);
      expect((await servicio.diasAvisoPorSede())(1)).toBe(7);
    });
  });
});
