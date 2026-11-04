export const ROLES = ['administrador', 'recepcionista', 'entrenador'] as const;
export type RolNombre = (typeof ROLES)[number];

/** Datos del personal autenticado, tomados del JWT. */
export interface UsuarioAutenticado {
  id_usuario: number;
  rol: RolNombre;
  /** Sedes donde puede operar (CRM-RF-19). */
  sedes: number[];
  /** El administrador general consulta todas las sedes. */
  admin_general: boolean;
  /** Id de la sesión (sesion_usuario) para poder revocarla. */
  jti?: string;
}

/** Payload esperado en el JWT del personal. */
export interface JwtPayloadPersonal {
  sub: number;
  rol: RolNombre;
  sedes: number[];
  admin_general?: boolean;
  jti?: string;
}

/** Contexto de la petición para auditoría. */
export interface ContextoPeticion {
  usuario: UsuarioAutenticado;
  ip: string | null;
}

/** Payload del access token de la app móvil del socio. */
export interface JwtPayloadSocio {
  sub: number;
  tipo: 'socio';
}

/** Petición hecha por el propio socio desde la app (APP-RF-01). */
export interface ContextoSocio {
  socio: { id_socio: number };
  ip: string | null;
}

/** Quien ejecuta la operación: personal del CRM o el socio desde la app. */
export type Actor = ContextoPeticion | ContextoSocio;

export const esPersonal = (actor: Actor): actor is ContextoPeticion => 'usuario' in actor;
