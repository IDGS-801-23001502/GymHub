import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { crearPrismaMock, ctxRecepcion, type PrismaMock } from '../../test/helpers/prisma-mock.js';
import { FichaSaludService } from './ficha-salud.service.js';

const crypto = new EncryptionService({
  clave: randomBytes(32).toString('hex'),
  pepper: 'pepper-de-pruebas-123',
});
const ctx = ctxRecepcion();

describe('FichaSaludService', () => {
  let prisma: PrismaMock;
  let servicio: FichaSaludService;

  beforeEach(() => {
    prisma = crearPrismaMock();
    const db = prisma as unknown as PrismaService;
    servicio = new FichaSaludService(db, crypto, new AuditService(db));
    prisma.socio.findUnique.mockResolvedValue({ id_socio: 10, id_sede: 1 });
    prisma.fichaSalud.aggregate.mockResolvedValue({ _max: { version: 2 } });
    prisma.fichaSalud.create.mockImplementation(({ data }) => ({
      id_ficha: 30,
      creado_en: new Date(),
      ...data,
    }));
  });

  it('crea una versión nueva cifrada y no deja datos clínicos en la bitácora', async () => {
    prisma.consentimiento.findFirst.mockResolvedValue({ otorgado: true });

    const r = await servicio.guardar(
      10,
      { lesiones: 'Rodilla izquierda', alergias: 'Penicilina', restricciones_rutina: ['evitar_rodilla'] },
      ctx,
    );

    expect(r.version).toBe(3);
    expect(r.lesiones).toBe('Rodilla izquierda');
    expect(r.restricciones_rutina).toEqual(['evitar_rodilla']);
    const data = prisma.fichaSalud.create.mock.calls[0][0].data;
    expect(crypto.descifrarJson(data.datos_cifrados)).toMatchObject({ alergias: 'Penicilina' });
    expect(data).toMatchObject({ origen: 'crm', actualizado_por_usuario: 7 });

    const bitacora = prisma.bitacoraAuditoria.create.mock.calls[0][0].data.valor_nuevo;
    expect(bitacora).not.toContain('Penicilina');
    expect(JSON.parse(bitacora).campos_clinicos).toEqual(['lesiones', 'alergias']);
  });

  it('exige el consentimiento de datos de salud la primera vez y lo registra', async () => {
    prisma.consentimiento.findFirst.mockResolvedValue(null);
    await expect(servicio.guardar(10, { lesiones: 'x' }, ctx)).rejects.toThrow(BadRequestException);

    prisma.avisoPrivacidad.findFirst.mockResolvedValue({ id_aviso: 3 });
    await servicio.guardar(10, { lesiones: 'x', acepta_tratamiento_datos_salud: true }, ctx);
    expect(prisma.consentimiento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'datos_salud', otorgado: true, id_aviso: 3 }),
    });
  });

  it('rechaza una ficha vacía', async () => {
    await expect(servicio.guardar(10, {}, ctx)).rejects.toThrow(/no contiene datos/);
  });

  it('traduce el choque de versiones concurrentes a 409', async () => {
    prisma.consentimiento.findFirst.mockResolvedValue({ otorgado: true });
    prisma.fichaSalud.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(servicio.guardar(10, { lesiones: 'x' }, ctx)).rejects.toThrow(ConflictException);
  });

  it('consulta la versión actual descifrada y registra la consulta', async () => {
    prisma.fichaSalud.findFirst.mockResolvedValue({
      id_ficha: 30,
      id_socio: 10,
      version: 3,
      datos_cifrados: crypto.cifrarJson({ antecedentes: null, lesiones: 'Hombro', alergias: null, medicamentos: null }),
      nivel_actividad: 'medio',
      objetivo: null,
      restricciones_rutina: null,
      origen: 'crm',
      borrador: false,
      actualizado_por_usuario: 3,
      actualizado_por: { id_usuario: 3, nombre: 'Entrenador' },
      creado_en: new Date(),
    });

    const r = await servicio.obtenerActual(10, ctx);

    expect(r.lesiones).toBe('Hombro');
    expect(r.actualizado_por).toEqual({ id_usuario: 3, nombre: 'Entrenador' });
    expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('consulta');
  });

  it('404 si no hay ficha o versión', async () => {
    prisma.fichaSalud.findFirst.mockResolvedValue(null);
    await expect(servicio.obtenerActual(10, ctx)).rejects.toThrow(NotFoundException);
    prisma.fichaSalud.findUnique.mockResolvedValue(null);
    await expect(servicio.obtenerVersion(10, 9, ctx)).rejects.toThrow(NotFoundException);
  });

  it('lista versiones sin datos clínicos', async () => {
    prisma.fichaSalud.findMany.mockResolvedValue([{ id_ficha: 1, version: 1 }]);
    await servicio.versiones(10, ctx);
    expect(prisma.fichaSalud.findMany.mock.calls[0][0].select).not.toHaveProperty('datos_cifrados');
  });
});
