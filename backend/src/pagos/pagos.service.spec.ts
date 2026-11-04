import { ConflictException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { crearPrismaMock, ctxAdmin, d, type PrismaMock } from '../../test/helpers/prisma-mock.js';
import { escaparHtml, renderComprobante } from './comprobante.js';
import { mapearPago, PagosService } from './pagos.service.js';

const pagoCompleto = (extra = {}) => ({
  id_pago: 5n,
  folio: 'P20261102-000005',
  id_socio: 10,
  id_membresia: 20,
  id_sede: 1,
  monto: new Prisma.Decimal('500.00'),
  metodo: 'efectivo',
  referencia: null,
  estado: 'registrado',
  fecha_pago: new Date('2026-11-02T18:00:00Z'),
  motivo_cancelacion: null,
  cancelado_en: null,
  socio: { id_socio: 10, folio: 'GH000010', nombre: '<script>alert(1)</script>' },
  plan: { id_plan: 2, nombre: 'Mensual', tipo: 'mensual' },
  sede: { id_sede: 1, nombre: 'Matriz', direccion: null, telefono: null },
  membresia: { id_membresia: 20, fecha_inicio: d('2026-11-02'), fecha_vencimiento: d('2026-12-01'), estado: 'activa' },
  registrador: { id_usuario: 7, nombre: 'Recepción' },
  autorizador: null,
  ...extra,
});

describe('PagosService.cancelar', () => {
  let prisma: PrismaMock;
  let servicio: PagosService;

  beforeEach(() => {
    prisma = crearPrismaMock();
    const db = prisma as unknown as PrismaService;
    servicio = new PagosService(db, new AuditService(db));
  });

  it('cancela el pago con motivo y autorizador, y cancela la membresía sin otros pagos', async () => {
    prisma.pago.findUnique
      .mockResolvedValueOnce({ ...pagoCompleto(), membresia: { estado: 'activa', renovaciones: [] } })
      .mockResolvedValueOnce(pagoCompleto({ estado: 'cancelado' }));
    prisma.pago.count.mockResolvedValue(0);

    const r = await servicio.cancelar(5, { motivo: 'Cobro duplicado' }, ctxAdmin());

    expect(prisma.pago.update.mock.calls[0][0].data).toMatchObject({
      estado: 'cancelado',
      motivo_cancelacion: 'Cobro duplicado',
      autorizado_por: 1,
    });
    expect(prisma.membresia.update).toHaveBeenCalledWith({
      where: { id_membresia: 20 },
      data: { estado: 'cancelada' },
    });
    const acciones = prisma.bitacoraAuditoria.create.mock.calls.map((c) => c[0].data.accion);
    expect(acciones).toEqual(['cancelar', 'cancelar']);
    expect(r.estado).toBe('cancelado');
  });

  it('no cancela si la membresía tiene una renovación posterior vigente', async () => {
    prisma.pago.findUnique.mockResolvedValue({
      ...pagoCompleto(),
      membresia: { estado: 'activa', renovaciones: [{ id_membresia: 21 }] },
    });
    await expect(servicio.cancelar(5, { motivo: 'x' }, ctxAdmin())).rejects.toThrow(
      /renovación posterior/,
    );
    expect(prisma.pago.update).not.toHaveBeenCalled();
  });

  it('no cancela dos veces', async () => {
    prisma.pago.findUnique.mockResolvedValue({
      ...pagoCompleto({ estado: 'cancelado' }),
      membresia: { estado: 'cancelada', renovaciones: [] },
    });
    await expect(servicio.cancelar(5, { motivo: 'x' }, ctxAdmin())).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('PagosService consultas', () => {
  let prisma: PrismaMock;
  let servicio: PagosService;

  beforeEach(() => {
    prisma = crearPrismaMock();
    const db = prisma as unknown as PrismaService;
    servicio = new PagosService(db, new AuditService(db));
  });

  it('lista con filtros de fecha inclusivos y serializa BigInt/Decimal', async () => {
    prisma.pago.findMany.mockResolvedValue([pagoCompleto()]);
    prisma.pago.count.mockResolvedValue(1);
    const usuario = { id_usuario: 7, rol: 'recepcionista' as const, sedes: [1], admin_general: false };

    const r = await servicio.listar({ desde: '2026-11-01', hasta: '2026-11-02' }, usuario);

    expect(prisma.pago.findMany.mock.calls[0][0].where).toMatchObject({
      id_sede: { in: [1] },
      fecha_pago: { gte: d('2026-11-01'), lt: d('2026-11-03') },
    });
    expect(r.datos[0]).toMatchObject({ id_pago: 5, monto: 500 });
    expect(() => JSON.stringify(r)).not.toThrow();
  });

  it('no deja ver pagos de otra sede', async () => {
    prisma.pago.findUnique.mockResolvedValue(pagoCompleto({ id_sede: 2 }));
    const usuario = { id_usuario: 7, rol: 'recepcionista' as const, sedes: [1], admin_general: false };
    await expect(servicio.comprobante(5, usuario)).rejects.toThrow(/sede/);
  });
});

describe('comprobante', () => {
  it('escapa los datos capturados (sin XSS) e incluye folio y total', () => {
    const html = renderComprobante(mapearPago(pagoCompleto() as never));
    expect(html).toContain('P20261102-000005');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toMatch(/\$500\.00/);
  });

  it('marca los pagos cancelados', () => {
    const html = renderComprobante(
      mapearPago(pagoCompleto({ estado: 'cancelado', motivo_cancelacion: 'Error' }) as never),
    );
    expect(html).toContain('PAGO CANCELADO: Error');
  });

  it('escaparHtml cubre los caracteres especiales', () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
