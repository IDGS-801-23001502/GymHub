import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class CancelarPagoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El motivo de cancelación es obligatorio' })
  @MaxLength(255)
  motivo: string;
}

export class ListarPagosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_socio?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_sede?: number;

  @IsOptional()
  @IsIn(['registrado', 'cancelado'])
  estado?: 'registrado' | 'cancelado';

  /** Rango por fecha de pago (YYYY-MM-DD, inclusive). */
  @IsOptional()
  @Matches(FECHA)
  desde?: string;

  @IsOptional()
  @Matches(FECHA)
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  por_pagina?: number = 50;
}
