import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const NIVELES_ACTIVIDAD = ['sedentario', 'bajo', 'medio', 'alto'] as const;

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Cuestionario de salud. Los campos clínicos se guardan cifrados (AES-256). */
export class GuardarFichaSaludDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(2000)
  antecedentes?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(2000)
  lesiones?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(2000)
  alergias?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(2000)
  medicamentos?: string;

  @IsOptional()
  @IsIn(NIVELES_ACTIVIDAD)
  nivel_actividad?: (typeof NIVELES_ACTIVIDAD)[number];

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  objetivo?: string;

  /** Etiquetas no sensibles para sugerir plantillas (CRM-RF-08); se guardan en claro. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(/^[a-z0-9_]{1,40}$/, {
    each: true,
    message: 'Cada restricción debe ser una etiqueta en minúsculas (a-z, 0-9, _)',
  })
  restricciones_rutina?: string[];

  @IsOptional()
  @IsBoolean()
  borrador?: boolean;

  /** Consentimiento para tratar datos de salud; obligatorio si aún no se ha otorgado. */
  @IsOptional()
  @IsBoolean()
  acepta_tratamiento_datos_salud?: boolean;
}
