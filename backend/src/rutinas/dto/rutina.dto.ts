import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BloqueDto } from './plantilla.dto.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AsignarRutinaDto {
  @IsMongoId({ message: 'id_plantilla no es válido' })
  id_plantilla: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  sesiones_planeadas_semana: number;

  @IsOptional()
  @Matches(FECHA, { message: 'fecha_inicio debe ser YYYY-MM-DD' })
  fecha_inicio?: string;

  // Ajustes del entrenador sobre la plantilla; si no se envían se usa la plantilla tal cual
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BloqueDto)
  bloques?: BloqueDto[];

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  motivo?: string;

  // El entrenador confirma que revisó ejercicios que chocan con la ficha de salud
  @IsOptional()
  @IsBoolean()
  confirmar_conflictos?: boolean;
}

export class NuevaVersionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BloqueDto)
  bloques: BloqueDto[];

  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'El motivo del cambio es obligatorio' })
  @MaxLength(255)
  motivo: string;

  @IsOptional()
  @IsBoolean()
  confirmar_conflictos?: boolean;
}

export class FinalizarRutinaDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  motivo?: string;
}

export class SeguimientoDto {
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe ser YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe ser YYYY-MM-DD' })
  hasta?: string;
}
