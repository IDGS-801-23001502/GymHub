import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { map, type Observable } from 'rxjs';

/**
 * Los archivos de /uploads (fotos de socios, multimedia de ejercicios) solo se sirven con una
 * URL firmada que expira. Las rutas se guardan sin firma en la BD y se firman al responder.
 */
const VENTANA_MS = 6 * 3_600_000;
const RUTA_ARCHIVO = /^\/uploads\/[\w./-]+$/;

function secreto(): string {
  const s = process.env.ARCHIVOS_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('Define ARCHIVOS_SECRET o JWT_SECRET para firmar archivos.');
  return s;
}

const hmac = (ruta: string, exp: number) => createHmac('sha256', secreto()).update(`${ruta}|${exp}`).digest('base64url');

/**
 * Agrega `?exp=&firma=`. La expiración se redondea a ventanas de 6 h (vale entre 6 y 12 h)
 * para que la misma foto conserve la misma URL un rato y el navegador la pueda cachear.
 */
export function firmarRuta(ruta: string, ahora = Date.now()): string {
  const exp = Math.ceil(ahora / VENTANA_MS) * VENTANA_MS + VENTANA_MS;
  return `${ruta}?exp=${exp}&firma=${hmac(ruta, exp)}`;
}

export function firmaValida(ruta: string, exp: unknown, firma: unknown, ahora = Date.now()): boolean {
  if (typeof exp !== 'string' || typeof firma !== 'string' || !/^\d{10,15}$/.test(exp)) return false;
  if (Number(exp) < ahora) return false;
  const esperada = Buffer.from(hmac(ruta, Number(exp)));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Quita la firma si el cliente devuelve una URL que recibió (p. ej. al editar un ejercicio). */
export function sinFirma(valor: unknown): unknown {
  return typeof valor === 'string' && valor.startsWith('/uploads/') ? valor.split('?')[0] : valor;
}

/** Firma toda cadena "/uploads/..." dentro de la respuesta. */
export function firmarEnRespuesta(valor: unknown, ahora = Date.now()): unknown {
  if (typeof valor === 'string') return RUTA_ARCHIVO.test(valor) ? firmarRuta(valor, ahora) : valor;
  if (Array.isArray(valor)) return valor.map((v) => firmarEnRespuesta(v, ahora));
  // Solo objetos planos: Date, Buffer, BigInt, ObjectId, etc. se dejan intactos
  if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    const copia: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) copia[k] = firmarEnRespuesta(v, ahora);
    return copia;
  }
  return valor;
}

@Injectable()
export class FirmarArchivosInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((cuerpo) => firmarEnRespuesta(cuerpo)));
  }
}

/** Middleware delante de los archivos estáticos: sin firma vigente responde 403. */
export function exigirFirma(req: Request, res: Response, next: NextFunction) {
  const ruta = `/uploads${req.path}`;
  if (!RUTA_ARCHIVO.test(ruta) || !firmaValida(ruta, req.query.exp, req.query.firma)) {
    res.status(403).json({ statusCode: 403, message: 'Enlace de archivo inválido o vencido.' });
    return;
  }
  next();
}
