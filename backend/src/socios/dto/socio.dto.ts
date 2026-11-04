import { PartialType, OmitType, PickType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { sinFirma } from '../../archivos/firma.js';

export const OBJETIVOS = [
  'perder_peso',
  'ganar_masa',
  'tonificar',
  'resistencia',
  'salud_general',
  'rehabilitacion',
  'otro',
] as const;
export type Objetivo = (typeof OBJETIVOS)[number];

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Teléfono: 10 dígitos, opcionalmente con +52 / espacios / guiones. */
const TELEFONO = /^\+?[\d\s()-]{10,20}$/;

export class ContactoEmergenciaDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  parentesco: string;

  @Transform(recortar)
  @Matches(TELEFONO, { message: 'contacto_emergencia.telefono no es válido' })
  telefono: string;
}

export class CrearSocioDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(120)
  nombre: string;

  @IsISO8601({ strict: true }, { message: 'fecha_nacimiento debe ser YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha_nacimiento debe ser YYYY-MM-DD' })
  fecha_nacimiento: string;

  @Transform(recortar)
  @Matches(TELEFONO, { message: 'El teléfono no es válido' })
  telefono: string;

  @Transform(recortar)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(150)
  correo: string;

  @ValidateNested()
  @Type(() => ContactoEmergenciaDto)
  contacto_emergencia: ContactoEmergenciaDto;

  @IsOptional()
  @Transform(({ value }) => sinFirma(value))
  @Matches(/^(https?:\/\/\S+|\/uploads\/[\w./-]+)$/, { message: 'foto_url debe ser una URL o una foto subida' })
  @MaxLength(255)
  foto_url?: string;

  @IsOptional()
  @IsIn(OBJETIVOS)
  objetivo?: Objetivo;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_sede: number;

  /** CRM-RNF-02: el socio debe aceptar el aviso de privacidad vigente. */
  @IsBoolean()
  @Equals(true, { message: 'El socio debe aceptar el aviso de privacidad' })
  acepta_aviso_privacidad: boolean;
}

export class ActualizarSocioDto extends PartialType(
  OmitType(CrearSocioDto, ['acepta_aviso_privacidad'] as const),
) {}

/** Datos que el socio puede cambiar desde la app (APP-RF-02). */
export class ActualizarPerfilAppDto extends PartialType(
  PickType(CrearSocioDto, ['telefono', 'correo', 'foto_url', 'contacto_emergencia'] as const),
) {}

export class BajaSocioDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'El motivo de la baja es obligatorio' })
  @MaxLength(255)
  motivo: string;
}

export class BuscarSociosDto {
  /** Nombre, folio, correo exacto o teléfono exacto. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(150)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_sede?: number;

  @IsOptional()
  @IsIn(['activo', 'baja'])
  estado?: 'activo' | 'baja';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  por_pagina?: number = 20;
}
