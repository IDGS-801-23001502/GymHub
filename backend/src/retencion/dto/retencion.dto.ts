import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OBJETIVOS } from '../../socios/dto/socio.dto.js';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const ESTADOS_MEMBRESIA_FILTRO = ['activa', 'por_vencer', 'vencida', 'congelada', 'cancelada', 'sin_membresia'] as const;

/** Filtros de un segmento (CRM-RF-12). Todos son opcionales y se combinan con AND. */
export class FiltrosSegmentoDto {
  @IsOptional()
  @IsArray()
  @IsIn(ESTADOS_MEMBRESIA_FILTRO, { each: true })
  estados_membresia?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  sedes?: number[];

  @IsOptional()
  @IsArray()
  @IsIn(OBJETIVOS, { each: true })
  objetivos?: string[];

  /** Visitas en los últimos 30 días. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  visitas_min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  visitas_max?: number;

  /** Días desde el alta. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  antiguedad_min_dias?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  antiguedad_max_dias?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  edad_min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  edad_max?: number;

  @IsOptional()
  @IsBoolean()
  incluir_bajas?: boolean;
}

export class SegmentoDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @ValidateNested()
  @Type(() => FiltrosSegmentoDto)
  filtros: FiltrosSegmentoDto;
}

export class ConfigRiesgoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_sede?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dias_inactividad: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  dias_aviso_vencimiento: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export const TIPOS_ACCION = ['llamada', 'notificacion', 'visita', 'promocion', 'otra'] as const;
export const ESTADOS_RIESGO = ['abierto', 'atendido', 'resuelto', 'descartado'] as const;

export class AccionRiesgoDto {
  @IsIn(TIPOS_ACCION)
  tipo_accion: (typeof TIPOS_ACCION)[number];

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsIn(ESTADOS_RIESGO)
  estado?: (typeof ESTADOS_RIESGO)[number];
}

export const CATEGORIAS = ['vencimiento', 'rutina', 'promociones', 'avisos'] as const;

export class CampanaDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  titulo: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  contenido: string;

  @IsIn(CATEGORIAS)
  categoria: (typeof CATEGORIAS)[number];

  @IsIn(['socio', 'segmento'])
  tipo_destino: 'socio' | 'segmento';

  @ValidateIf((o: CampanaDto) => o.tipo_destino === 'socio')
  @Type(() => Number)
  @IsInt()
  id_socio_destino?: number;

  @ValidateIf((o: CampanaDto) => o.tipo_destino === 'segmento')
  @Type(() => Number)
  @IsInt()
  id_segmento?: number;

  @IsIn(['inmediato', 'programado'])
  modo_envio: 'inmediato' | 'programado';

  @ValidateIf((o: CampanaDto) => o.modo_envio === 'programado')
  @IsISO8601({}, { message: 'programada_para debe ser una fecha y hora ISO' })
  programada_para?: string;

  /** Guardar sin enviar ni programar. */
  @IsOptional()
  @IsBoolean()
  borrador?: boolean;
}

export class InteraccionDto {
  @IsIn(['llamada', 'nota'])
  tipo: 'llamada' | 'nota';

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  descripcion: string;
}
