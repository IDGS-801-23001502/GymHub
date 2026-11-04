import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuditService } from '../common/audit/audit.service.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { MembresiasService } from '../membresias/membresias.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  crearPrismaMock,
  ctxRecepcion,
  d,
  type PrismaMock,
} from '../../test/helpers/prisma-mock.js';
import type { CrearSocioDto } from './dto/socio.dto.js';
import { SociosService } from './socios.service.js';

const crypto = new EncryptionService({
  clave: randomBytes(32).toString('hex'),
  pepper: 'pepper-de-pruebas-123',
});

const alta = (extra: Partial<CrearSocioDto> = {}): CrearSocioDto => ({
  nombre: 'Laura Gómez',
  fecha_nacimiento: '1995-04-12',
  telefono: '+52 55 1234 5678',
  correo: 'Laura@Mail.com',
  contacto_emergencia: { nombre: 'Pedro Gómez', parentesco: 'padre', telefono: '5598765432' },
  id_sede: 1,
  acepta_aviso_privacidad: true,
  ...extra,
});

describe('SociosService', () => {
  let prisma: PrismaMock;
  let servicio: SociosService;

  beforeEach(() => {
    prisma = crearPrismaMock();
    const db = prisma as unknown as PrismaService;
    const audit = new AuditService(db);
    const membresias = new MembresiasService(db, audit, { get: () => undefined } as unknown as ConfigService);
    servicio = new SociosService(db, crypto, audit, membresias);

    prisma.sede.findUnique.mockResolvedValue({ id_sede: 1, activa: true });
    prisma.avisoPrivacidad.findFirst.mockResolvedValue({ id_aviso: 3, version: '1.0' });
    prisma.socio.create.mockImplementation(({ data }) => ({
      id_socio: 42,
      ...data,
      estado: 'activo',
      fecha_alta: d('2026-11-02'),
    }));
    prisma.socio.update.mockImplementation(({ data }) => ({
      ...prisma.socio.create.mock.calls[0][0].data,
      id_socio: 42,
      estado: 'activo',
      fecha_alta: d('2026-11-02'),
      fecha_baja: null,
      ...data,
    }));
  });

  describe('crear', () => {
    it('cifra contacto, guarda índices ciegos, asigna folio y registra consentimiento', async () => {
      const r = await servicio.crear(alta(), ctxRecepcion());

      const data = prisma.socio.create.mock.calls[0][0].data;
      expect(Buffer.from(data.telefono_cifrado).toString('latin1')).not.toContain('5512345678');
      expect(data.correo_hash).toBe(crypto.hashCorreo('laura@mail.com'));
      expect(data.telefono_hash).toBe(crypto.hashTelefono('5512345678'));

      expect(r.folio).toBe('GH000042');
      expect(r.telefono).toBe('5512345678');
      expect(r.correo).toBe('laura@mail.com');
      expect(r.contacto_emergencia).toEqual({
        nombre: 'Pedro Gómez',
        parentesco: 'padre',
        telefono: '5598765432',
      });

      expect(prisma.consentimiento.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tipo: 'aviso_privacidad', id_aviso: 3, otorgado: true, origen: 'crm' }),
      });
      const bitacora = JSON.parse(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.valor_nuevo);
      expect(bitacora.telefono).toBe('[cifrado]');
      expect(JSON.stringify(bitacora)).not.toContain('laura@mail.com');
    });

    it('evita duplicados por correo o teléfono e indica el folio existente', async () => {
      prisma.socio.findMany.mockResolvedValueOnce([
        {
          folio: 'GH000007',
          estado: 'baja',
          correo_hash: crypto.hashCorreo('laura@mail.com'),
          telefono_hash: 'otro',
        },
      ]);
      await expect(servicio.crear(alta(), ctxRecepcion())).rejects.toThrow(
        /correo \(folio GH000007, dado de baja: reactívalo/,
      );
      expect(prisma.socio.create).not.toHaveBeenCalled();
    });

    it('exige aviso de privacidad vigente', async () => {
      prisma.avisoPrivacidad.findFirst.mockResolvedValue(null);
      await expect(servicio.crear(alta(), ctxRecepcion())).rejects.toThrow(/aviso de privacidad/);
    });

    it('valida fecha de nacimiento', async () => {
      await expect(
        servicio.crear(alta({ fecha_nacimiento: '2999-01-01' }), ctxRecepcion()),
      ).rejects.toThrow(/anterior a hoy/);
    });

    it('no permite registrar en una sede ajena', async () => {
      await expect(servicio.crear(alta({ id_sede: 5 }), ctxRecepcion([1]))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('baja y reactivación', () => {
    const existente = () => ({
      id_socio: 42,
      folio: 'GH000042',
      id_sede: 1,
      nombre: 'Laura',
      fecha_nacimiento: d('1995-04-12'),
      telefono_cifrado: crypto.cifrar('5512345678'),
      correo_cifrado: crypto.cifrar('laura@mail.com'),
      contacto_emergencia_cifrado: crypto.cifrarJson({ nombre: 'P', parentesco: 'padre', telefono: '1' }),
      estado: 'activo',
      fecha_alta: d('2026-01-01'),
      fecha_baja: null,
      motivo_baja: null,
    });

    it('da de baja lógica con motivo y deja constancia', async () => {
      prisma.socio.findUnique.mockResolvedValue(existente());
      prisma.socio.update.mockImplementation(({ data }) => ({ ...existente(), ...data }));

      const r = await servicio.darDeBaja(42, { motivo: 'Cambio de ciudad' }, ctxRecepcion());

      expect(r.estado).toBe('baja');
      expect(r.motivo_baja).toBe('Cambio de ciudad');
      expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('eliminar');
    });

    it('no reactiva un socio que ya está activo', async () => {
      prisma.socio.findUnique.mockResolvedValue(existente());
      await expect(servicio.reactivar(42, ctxRecepcion())).rejects.toThrow(ConflictException);
    });
  });

  describe('expediente y edición', () => {
    const existente = () => ({
      id_socio: 42,
      folio: 'GH000042',
      id_sede: 1,
      nombre: 'Laura',
      fecha_nacimiento: d('1995-04-12'),
      telefono_cifrado: crypto.cifrar('5512345678'),
      telefono_hash: crypto.hashTelefono('5512345678'),
      correo_cifrado: crypto.cifrar('laura@mail.com'),
      correo_hash: crypto.hashCorreo('laura@mail.com'),
      contacto_emergencia_cifrado: crypto.cifrarJson({ nombre: 'P', parentesco: 'padre', telefono: '1' }),
      foto_url: null,
      objetivo: null,
      estado: 'activo',
      fecha_alta: d('2026-01-01'),
      fecha_baja: null,
      motivo_baja: null,
    });

    it('el expediente descifra contacto, incluye la membresía y registra la consulta', async () => {
      prisma.socio.findUnique.mockResolvedValue(existente());
      prisma.membresia.findMany.mockResolvedValue([
        {
          id_membresia: 1,
          fecha_inicio: d('2026-01-01'),
          fecha_vencimiento: d('2099-01-01'),
          estado: 'activa',
          plan: { id_plan: 1, nombre: 'Anual' },
          congelamientos: [],
        },
      ]);

      const r = await servicio.obtener(42, ctxRecepcion());

      expect(r.correo).toBe('laura@mail.com');
      expect(r.membresia).toMatchObject({ estado: 'activa', plan: { nombre: 'Anual' } });
      expect(prisma.bitacoraAuditoria.create.mock.calls[0][0].data.accion).toBe('consulta');
    });

    it('al cambiar el correo re-cifra, recalcula el hash y audita sin exponer el valor', async () => {
      prisma.socio.findUnique.mockResolvedValue(existente());
      prisma.socio.update.mockImplementation(({ data }) => ({ ...existente(), ...data }));

      const r = await servicio.actualizar(
        42,
        { correo: 'nuevo@mail.com', nombre: 'Laura G.' },
        ctxRecepcion(),
      );

      const data = prisma.socio.update.mock.calls[0][0].data;
      expect(data.correo_hash).toBe(crypto.hashCorreo('nuevo@mail.com'));
      expect(data.telefono_cifrado).toBeUndefined();
      expect(r.correo).toBe('nuevo@mail.com');
      const bit = prisma.bitacoraAuditoria.create.mock.calls[0][0].data;
      expect(JSON.parse(bit.valor_nuevo)).toEqual({ nombre: 'Laura G.', correo: '[cifrado]' });
      expect(bit.valor_anterior).not.toContain('laura@mail.com');
    });

    it('no actualiza ni audita si no hay cambios', async () => {
      prisma.socio.findUnique.mockResolvedValue(existente());
      await servicio.actualizar(42, { nombre: 'Laura', correo: 'laura@mail.com' }, ctxRecepcion());
      expect(prisma.socio.update).not.toHaveBeenCalled();
      expect(prisma.bitacoraAuditoria.create).not.toHaveBeenCalled();
    });

    it('reactiva a un socio dado de baja', async () => {
      prisma.socio.findUnique.mockResolvedValue({ ...existente(), estado: 'baja', fecha_baja: d('2026-05-01') });
      prisma.socio.update.mockImplementation(({ data }) => ({ ...existente(), ...data }));
      const r = await servicio.reactivar(42, ctxRecepcion());
      expect(r.estado).toBe('activo');
      expect(r.fecha_baja).toBeNull();
    });
  });

  describe('buscar', () => {
    it('busca por correo exacto usando el índice ciego y limita a las sedes del usuario', async () => {
      await servicio.buscar({ q: 'LAURA@mail.com' }, ctxRecepcion([1, 2]).usuario);
      expect(prisma.socio.findMany.mock.calls[0][0].where).toMatchObject({
        id_sede: { in: [1, 2] },
        correo_hash: crypto.hashCorreo('laura@mail.com'),
      });
    });

    it('busca por nombre o folio con texto libre', async () => {
      await servicio.buscar({ q: 'laura' }, ctxRecepcion().usuario);
      expect(prisma.socio.findMany.mock.calls[0][0].where.OR).toEqual([
        { nombre: { contains: 'laura' } },
        { folio: { contains: 'laura' } },
      ]);
    });
  });
});
