import { createHash, randomBytes } from 'node:crypto';

export const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');

/** Token opaco para enlaces y refresh tokens (base64url, 256 bits). */
export const tokenAleatorio = () => randomBytes(32).toString('base64url');

/** Misma regla para el personal y para la app: 10+ caracteres con mayúscula, minúscula, número y símbolo. */
export const PASSWORD_SEGURA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
export const MENSAJE_PASSWORD =
  'La contraseña debe tener al menos 10 caracteres, con mayúscula, minúscula, número y símbolo.';
