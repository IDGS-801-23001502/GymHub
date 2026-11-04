import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const minusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const mayusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

// Mismas reglas que las contraseñas del personal
const PASSWORD_SEGURA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
const MENSAJE_PASSWORD =
  'La contraseña debe tener al menos 10 caracteres, con mayúscula, minúscula, número y símbolo.';

export class ActivarCuentaDto {
  @Transform(mayusculas)
  @Matches(/^GH\d{6,}$/, { message: 'El folio no es válido (ej. GH000123).' })
  folio: string;

  @Transform(minusculas)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(150)
  correo: string;

  @IsString()
  @MaxLength(200)
  @Matches(PASSWORD_SEGURA, { message: MENSAJE_PASSWORD })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dispositivo?: string;
}

export class LoginAppDto {
  @Transform(minusculas)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(150)
  correo: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dispositivo?: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refresh_token: string;
}

export class LogoutDto extends RefreshDto {
  /** Token FCM del dispositivo, para dejar de enviarle notificaciones. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fcm_token?: string;
}

export class RecuperarDto {
  @Transform(minusculas)
  @IsEmail({}, { message: 'El correo no es válido' })
  correo: string;
}

export class RestablecerDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @IsString()
  @MaxLength(200)
  @Matches(PASSWORD_SEGURA, { message: MENSAJE_PASSWORD })
  password: string;
}

class SerieRealizadaDto {
  @IsInt()
  @Min(0)
  @Max(1000)
  repeticiones: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  carga_kg?: number;

  @IsOptional()
  @IsBoolean()
  completada?: boolean;
}

class EjercicioRealizadoDto {
  @IsOptional()
  @IsString()
  @MaxLength(24)
  id_ejercicio?: string;

  @IsString()
  @MaxLength(100)
  nombre: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SerieRealizadaDto)
  series: SerieRealizadaDto[];
}

/** Sesión registrada en la app (APP-RF-07). `uuid_cliente` evita duplicados al reintentar. */
export class RegistrarSesionDto {
  @IsUUID()
  uuid_cliente: string;

  @IsOptional()
  @IsInt()
  id_rutina?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  numero_version?: number;

  @IsISO8601()
  fecha_inicio: string;

  @IsOptional()
  @IsISO8601()
  fecha_fin?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  duracion_min?: number;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => EjercicioRealizadoDto)
  ejercicios: EjercicioRealizadoDto[];

  @IsBoolean()
  completada: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20000)
  calorias?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(250)
  fc_promedio?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(250)
  fc_maxima?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200000)
  pasos?: number;
}

export class PeriodoDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe ser YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe ser YYYY-MM-DD' })
  hasta?: string;
}

export const TIPOS_CONSENTIMIENTO_APP = ['datos_salud', 'notificaciones', 'health_connect'] as const;

export class ConsentimientoDto {
  @IsIn(TIPOS_CONSENTIMIENTO_APP)
  tipo: (typeof TIPOS_CONSENTIMIENTO_APP)[number];

  @IsBoolean()
  otorgado: boolean;
}

class DatoSaludDto {
  @IsIn(['calorias', 'frecuencia_cardiaca', 'pasos'])
  tipo: 'calorias' | 'frecuencia_cardiaca' | 'pasos';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  valor: number;

  @IsISO8601()
  inicio: string;

  @IsISO8601()
  fin: string;
}

/** Lote de Health Connect desde la última sincronización (APP-RF-12). */
export class SincronizarSaludDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => DatoSaludDto)
  datos: DatoSaludDto[];
}

export class DispositivoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fcm_token: string;
}

export const CATEGORIAS_NOTIFICACION = ['vencimiento', 'rutina', 'promociones', 'avisos'] as const;
export type CategoriaNotificacion = (typeof CATEGORIAS_NOTIFICACION)[number];

class PreferenciaDto {
  @IsIn(CATEGORIAS_NOTIFICACION)
  categoria: CategoriaNotificacion;

  @IsBoolean()
  habilitada: boolean;
}

export class PreferenciasDto {
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PreferenciaDto)
  preferencias: PreferenciaDto[];
}
