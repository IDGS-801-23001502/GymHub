import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { sinFirma } from '../../archivos/firma.js';
import { ETIQUETA } from '../rutinas.constantes.js';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const minusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CrearEjercicioDto {
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre: string;

  // Texto libre en minúsculas para poder agregar grupos nuevos (CRM-RNF-06)
  @Transform(minusculas)
  @Matches(/^[a-z_]{2,40}$/, { message: 'grupo_muscular debe usar minúsculas y guion bajo' })
  grupo_muscular: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  equipo: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  // URL externa o archivo subido al servidor (/uploads/ejercicios/...)
  @Transform(({ value }) => sinFirma(value))
  @Matches(/^(https?:\/\/\S+|\/uploads\/[\w./-]+)$/, { message: 'media_url debe ser una URL o un archivo subido' })
  @MaxLength(500)
  media_url?: string;

  @IsOptional()
  @IsIn(['imagen', 'video'])
  media_tipo?: 'imagen' | 'video';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(ETIQUETA, { each: true, message: 'Cada contraindicación debe ser una etiqueta (a-z, 0-9, _)' })
  contraindicaciones?: string[];
}

export class ActualizarEjercicioDto extends PartialType(CrearEjercicioDto) {}

export class EstadoEjercicioDto {
  @IsBoolean()
  activo: boolean;
}

export class ListarEjerciciosDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(minusculas)
  @IsString()
  grupo_muscular?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluir_inactivos?: boolean;
}
