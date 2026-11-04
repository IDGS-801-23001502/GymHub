import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const METODOS_PAGO = ['efectivo', 'tarjeta', 'transferencia'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class PagoMembresiaDto {
  @IsIn(METODOS_PAGO, {
    message: 'metodo debe ser efectivo, tarjeta o transferencia',
  })
  metodo: MetodoPago;

  /** Por defecto, el precio del plan. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto?: number;

  /** Obligatoria para transferencias (número de operación / voucher). */
  @ValidateIf((o: PagoMembresiaDto) => o.metodo === 'transferencia' || o.referencia !== undefined)
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'La referencia es obligatoria para transferencias' })
  @MaxLength(80)
  referencia?: string;

  /** Sede donde se cobra; por defecto, la sede del socio. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_sede?: number;
}

export class AsignarMembresiaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_plan: number;

  /** CRM-RNF-07: el pago se registra en la misma transacción que la membresía. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PagoMembresiaDto)
  pago?: PagoMembresiaDto;
}

export class CongelarMembresiaDto {
  /** Por defecto, hoy. No se permiten congelamientos retroactivos. */
  @IsOptional()
  @Matches(FECHA, { message: 'fecha_inicio debe ser YYYY-MM-DD' })
  fecha_inicio?: string;

  @Matches(FECHA, { message: 'fecha_fin debe ser YYYY-MM-DD' })
  fecha_fin: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  motivo?: string;
}
