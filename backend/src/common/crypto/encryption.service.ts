import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CABECERA = 1 + IV_BYTES + TAG_BYTES; // [idClave][iv][tag]

export interface ConfigCifrado {
  /** Clave activa: 32 bytes en hex (64 caracteres) o base64. */
  clave: string;
  /** Identificador de la clave activa (1-255). Se guarda en cada valor cifrado. */
  idClave?: number;
  /** Claves anteriores "id:clave,id:clave" para descifrar datos previos a una rotación. */
  clavesAnteriores?: string;
  /** Pepper secreto para los índices ciegos (*_hash). */
  pepper: string;
}

function decodificarClave(valor: string): Buffer {
  const limpio = valor.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(limpio)
    ? Buffer.from(limpio, 'hex')
    : Buffer.from(limpio, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      'La clave de cifrado debe medir 32 bytes (64 caracteres hex o base64).',
    );
  }
  return buf;
}

/**
 * Cifrado AES-256-GCM de datos sensibles (CRM-RNF-01).
 *
 * Formato almacenado (VARBINARY): [idClave:1][iv:12][tag:16][texto cifrado].
 * El byte de idClave permite rotar claves: los datos viejos se siguen
 * descifrando con `clavesAnteriores` y `reCifrar` los migra a la clave activa.
 */
@Injectable()
export class EncryptionService {
  private readonly idActivo: number;
  private readonly claves = new Map<number, Buffer>();
  private readonly pepper: Buffer;

  constructor(config: ConfigCifrado) {
    this.idActivo = config.idClave ?? 1;
    if (
      !Number.isInteger(this.idActivo) ||
      this.idActivo < 1 ||
      this.idActivo > 255
    ) {
      throw new Error('ENCRYPTION_KEY_ID debe ser un entero entre 1 y 255.');
    }
    this.claves.set(this.idActivo, decodificarClave(config.clave));

    for (const par of (config.clavesAnteriores ?? '').split(',')) {
      if (!par.trim()) continue;
      const [id, clave] = par.split(':');
      const num = Number(id);
      if (!clave || !Number.isInteger(num)) {
        throw new Error(
          'ENCRYPTION_OLD_KEYS debe tener el formato "id:clave,id:clave".',
        );
      }
      if (num !== this.idActivo) this.claves.set(num, decodificarClave(clave));
    }

    if (!config.pepper || config.pepper.length < 16) {
      throw new Error('BLIND_INDEX_PEPPER debe tener al menos 16 caracteres.');
    }
    this.pepper = Buffer.from(config.pepper, 'utf8');
  }

  cifrar(texto: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(
      ALGORITMO,
      this.claves.get(this.idActivo)!,
      iv,
    );
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    const salida = Buffer.concat([
      Buffer.from([this.idActivo]),
      iv,
      cipher.getAuthTag(),
      cifrado,
    ]);
    return new Uint8Array(salida);
  }

  descifrar(datos: Uint8Array): string {
    const buf = Buffer.from(datos);
    if (buf.length < CABECERA) throw new Error('Dato cifrado corrupto.');
    const clave = this.claves.get(buf[0]);
    if (!clave) throw new Error(`No hay clave configurada con id ${buf[0]}.`);
    const iv = buf.subarray(1, 1 + IV_BYTES);
    const tag = buf.subarray(1 + IV_BYTES, CABECERA);
    const decipher = createDecipheriv(ALGORITMO, clave, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(buf.subarray(CABECERA)),
      decipher.final(),
    ]).toString('utf8');
  }

  cifrarJson(valor: unknown): Uint8Array<ArrayBuffer> {
    return this.cifrar(JSON.stringify(valor));
  }

  descifrarJson<T>(datos: Uint8Array): T {
    return JSON.parse(this.descifrar(datos)) as T;
  }

  /** true si el valor fue cifrado con una clave distinta a la activa. */
  necesitaRotacion(datos: Uint8Array): boolean {
    return datos[0] !== this.idActivo;
  }

  /** Re-cifra con la clave activa (para el proceso de rotación de claves). */
  reCifrar(datos: Uint8Array): Uint8Array<ArrayBuffer> {
    return this.cifrar(this.descifrar(datos));
  }

  /** Índice ciego: HMAC-SHA256(pepper, valor normalizado) en hex (CHAR(64)). */
  indiceCiego(valorNormalizado: string): string {
    return createHmac('sha256', this.pepper)
      .update(valorNormalizado)
      .digest('hex');
  }

  hashCorreo(correo: string): string {
    return this.indiceCiego(normalizarCorreo(correo));
  }

  hashTelefono(telefono: string): string {
    return this.indiceCiego(normalizarTelefono(telefono));
  }
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

/** Solo dígitos; si trae lada internacional (+52...) se usan los últimos 10. */
export function normalizarTelefono(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  return digitos.length > 10 ? digitos.slice(-10) : digitos;
}
