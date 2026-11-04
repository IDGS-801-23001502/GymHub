import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OBJETIVOS, type Objetivo } from '../../socios/dto/socio.dto.js';
import { NIVELES, TIPOS_BLOQUE } from '../rutinas.constantes.js';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EjercicioBloqueDto {
  @IsMongoId({ message: 'id_ejercicio no es válido' })
  id_ejercicio: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  series: number;

  // Admite "12", "8-10", "30 s" o "al fallo"
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  repeticiones: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  descanso_seg: number;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  notas?: string;
}

export class BloqueDto {
  @IsIn(TIPOS_BLOQUE, { message: `tipo debe ser ${TIPOS_BLOQUE.join(', ')}` })
  tipo: (typeof TIPOS_BLOQUE)[number];

  @IsArray()
  @ArrayMinSize(1, { message: 'Cada bloque necesita al menos un ejercicio' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => EjercicioBloqueDto)
  ejercicios: EjercicioBloqueDto[];
}

export class CrearPlantillaDto {
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre: string;

  @IsIn(OBJETIVOS)
  objetivo: Objetivo;

  @IsIn(NIVELES)
  nivel: (typeof NIVELES)[number];

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dias_semana?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'La plantilla necesita al menos un bloque' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BloqueDto)
  bloques: BloqueDto[];
}

export class ActualizarPlantillaDto extends PartialType(CrearPlantillaDto) {}

export class DuplicarPlantillaDto {
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre: string;
}

export class EstadoPlantillaDto {
  @IsBoolean()
  activa: boolean;
}

export class ListarPlantillasDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(OBJETIVOS)
  objetivo?: Objetivo;

  @IsOptional()
  @IsIn(NIVELES)
  nivel?: (typeof NIVELES)[number];

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluir_inactivas?: boolean;
}
