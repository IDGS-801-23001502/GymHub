import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ObjectId } from 'mongodb';

export const TIPOS_BLOQUE = ['calentamiento', 'fuerza', 'cardio', 'estiramiento'] as const;
export const NIVELES = ['principiante', 'intermedio', 'avanzado'] as const;

// Etiquetas que comparten ficha_salud.restricciones_rutina y ejercicios.contraindicaciones
export const ETIQUETA = /^[a-z0-9_]{1,40}$/;

/** Valida que el parámetro sea un ObjectId de MongoDB. */
export class ParseObjectIdPipe implements PipeTransform<string, ObjectId> {
  transform(valor: string): ObjectId {
    if (!ObjectId.isValid(valor) || String(new ObjectId(valor)) !== valor.toLowerCase()) {
      throw new BadRequestException('Identificador no válido.');
    }
    return new ObjectId(valor);
  }
}
