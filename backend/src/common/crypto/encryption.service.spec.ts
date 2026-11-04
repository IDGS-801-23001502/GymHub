import { randomBytes } from 'node:crypto';
import {
  EncryptionService,
  normalizarCorreo,
  normalizarTelefono,
} from './encryption.service.js';

const CLAVE_1 = randomBytes(32).toString('hex');
const CLAVE_2 = randomBytes(32).toString('base64');
const PEPPER = 'pepper-de-pruebas-123';

describe('EncryptionService', () => {
  const servicio = new EncryptionService({ clave: CLAVE_1, pepper: PEPPER });

  it('cifra y descifra texto (AES-256-GCM)', () => {
    const cifrado = servicio.cifrar('5512345678');
    expect(Buffer.from(cifrado).toString('utf8')).not.toContain('5512345678');
    expect(servicio.descifrar(cifrado)).toBe('5512345678');
  });

  it('usa IV aleatorio: el mismo texto produce cifrados distintos', () => {
    expect(Buffer.from(servicio.cifrar('x')).equals(Buffer.from(servicio.cifrar('x')))).toBe(false);
  });

  it('cifra y descifra JSON', () => {
    const contacto = { nombre: 'Ana', parentesco: 'madre', telefono: '5511112222' };
    expect(servicio.descifrarJson(servicio.cifrarJson(contacto))).toEqual(contacto);
  });

  it('detecta manipulación del dato cifrado', () => {
    const cifrado = servicio.cifrar('dato');
    cifrado[cifrado.length - 1] ^= 0xff;
    expect(() => servicio.descifrar(cifrado)).toThrow();
  });

  it('rota claves: descifra datos de la clave anterior y los re-cifra con la activa', () => {
    const viejo = servicio.cifrar('historial');
    const rotado = new EncryptionService({
      clave: CLAVE_2,
      idClave: 2,
      clavesAnteriores: `1:${CLAVE_1}`,
      pepper: PEPPER,
    });
    expect(rotado.necesitaRotacion(viejo)).toBe(true);
    const nuevo = rotado.reCifrar(viejo);
    expect(rotado.necesitaRotacion(nuevo)).toBe(false);
    expect(rotado.descifrar(nuevo)).toBe('historial');
  });

  it('falla si falta la clave con la que se cifró', () => {
    const otro = new EncryptionService({ clave: CLAVE_2, idClave: 2, pepper: PEPPER });
    expect(() => otro.descifrar(servicio.cifrar('x'))).toThrow(/id 1/);
  });

  it('valida longitud de clave y pepper', () => {
    expect(() => new EncryptionService({ clave: 'corta', pepper: PEPPER })).toThrow(/32 bytes/);
    expect(() => new EncryptionService({ clave: CLAVE_1, pepper: 'x' })).toThrow(/PEPPER/);
  });

  it('el índice ciego es determinista y normaliza correo y teléfono', () => {
    expect(servicio.hashCorreo(' Ana@Mail.com ')).toBe(servicio.hashCorreo('ana@mail.com'));
    expect(servicio.hashTelefono('+52 55 1234 5678')).toBe(servicio.hashTelefono('5512345678'));
    expect(servicio.hashCorreo('ana@mail.com')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el índice ciego depende del pepper', () => {
    const otro = new EncryptionService({ clave: CLAVE_1, pepper: 'otro-pepper-distinto' });
    expect(otro.hashCorreo('a@b.com')).not.toBe(servicio.hashCorreo('a@b.com'));
  });
});

describe('normalización', () => {
  it('correo en minúsculas y sin espacios', () => {
    expect(normalizarCorreo('  JUAN@Gym.MX ')).toBe('juan@gym.mx');
  });
  it('teléfono solo dígitos, últimos 10 si trae lada', () => {
    expect(normalizarTelefono('(55) 1234-5678')).toBe('5512345678');
    expect(normalizarTelefono('+52 1 55 1234 5678')).toBe('5512345678');
  });
});
