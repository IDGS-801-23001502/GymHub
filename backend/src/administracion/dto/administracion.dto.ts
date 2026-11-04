import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ROLES, type RolNombre } from '../../common/auth/auth.types.js';
import { MENSAJE_PASSWORD, PASSWORD_SEGURA } from '../../common/utils/tokens.js';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class CrearUsuarioDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Correo no válido.' })
  @MaxLength(150)
  correo: string;

  @Matches(PASSWORD_SEGURA, { message: MENSAJE_PASSWORD })
  password: string;

  @IsIn(ROLES, { message: 'rol debe ser administrador, recepcionista o entrenador' })
  rol: RolNombre;

  @IsArray()
  @ArrayMinSize(1, { message: 'Asigna al menos una sede.' })
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  sedes: number[];

  @IsOptional()
  @IsBoolean()
  es_admin_general?: boolean;
}

export class ActualizarUsuarioDto extends PartialType(CrearUsuarioDto) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class HorarioDto {
  @IsInt()
  @Min(1)
  @Max(7)
  dia_semana: number;

  @Matches(HORA, { message: 'hora_apertura debe ser HH:mm' })
  hora_apertura: string;

  @Matches(HORA, { message: 'hora_cierre debe ser HH:mm' })
  hora_cierre: string;
}

export class CrearSedeDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'El teléfono debe tener 10 dígitos.' })
  telefono?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => HorarioDto)
  horarios?: HorarioDto[];
}

export class ActualizarSedeDto extends PartialType(CrearSedeDto) {
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

export const ACCIONES_BITACORA = ['consulta', 'crear', 'modificar', 'eliminar', 'cancelar', 'login', 'login_fallido'] as const;

export class FiltroBitacoraDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_usuario?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_socio?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  entidad?: string;

  @IsOptional()
  @IsIn(ACCIONES_BITACORA)
  accion?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'desde debe ser YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe ser YYYY-MM-DD' })
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  por_pagina?: number;
}

export const TIPOS_ARCO = ['acceso', 'rectificacion', 'cancelacion', 'oposicion'] as const;
export const ESTADOS_ARCO = ['recibida', 'en_proceso', 'atendida', 'rechazada'] as const;

export class CrearArcoDto {
  @IsIn(TIPOS_ARCO, { message: 'tipo debe ser acceso, rectificacion, cancelacion u oposicion' })
  tipo: (typeof TIPOS_ARCO)[number];

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  descripcion?: string;
}

export class AtenderArcoDto {
  @IsIn(ESTADOS_ARCO)
  estado: (typeof ESTADOS_ARCO)[number];
}
