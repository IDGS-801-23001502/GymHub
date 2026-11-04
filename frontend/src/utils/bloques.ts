import { TIPOS_BLOQUE, type Bloque } from '../api/tipos';

/** Errores que se pueden detectar antes de enviar. */
export function validarBloques(bloques: Bloque[]): string[] {
  const errores: string[] = [];
  if (bloques.length === 0) errores.push('Agrega al menos un bloque.');
  bloques.forEach((b, i) => {
    if (b.ejercicios.length === 0) errores.push(`El bloque ${i + 1} (${TIPOS_BLOQUE[b.tipo]}) no tiene ejercicios.`);
    b.ejercicios.forEach((e) => {
      if (!e.repeticiones.trim()) errores.push(`Indica las repeticiones de "${e.nombre}".`);
      if (!(e.series >= 1 && e.series <= 20)) errores.push(`Las series de "${e.nombre}" deben estar entre 1 y 20.`);
    });
  });
  return errores;
}
