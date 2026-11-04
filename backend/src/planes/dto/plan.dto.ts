import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const TIPOS_PLAN = ['mensual', 'trimestral', 'anual'] as const;
export type TipoPlan = (typeof TIPOS_PLAN)[number];

/** Duración por defecto si no se indica. */
export const DURACION_POR_TIPO: Record<TipoPlan, number> = {
  mensual: 30,
  trimestral: 90,
  anual: 365,
};

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearPlanDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre: string;

  @IsIn(TIPOS_PLAN, { message: 'tipo debe ser mensual, trimestral o anual' })
  tipo: TipoPlan;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duracion_dias?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(4000)
  beneficios?: string;
}

export class ActualizarPlanDto extends PartialType(CrearPlanDto) {}

export class EstadoPlanDto {
  @IsBoolean()
  activo: boolean;
}

export class ListarPlanesDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluir_inactivos?: boolean;
}
