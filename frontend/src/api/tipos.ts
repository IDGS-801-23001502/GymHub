// Tipos de las respuestas de la API (backend/src/*). Fechas "solo día" como YYYY-MM-DD.

export type Rol = 'administrador' | 'recepcionista' | 'entrenador';

export interface SedeResumen {
  id_sede: number;
  nombre: string;
}

export interface Sede extends SedeResumen {
  direccion: string | null;
  telefono: string | null;
}

export interface UsuarioSesion {
  id_usuario: number;
  nombre: string;
  correo: string;
  rol: Rol;
  admin_general: boolean;
  sedes: SedeResumen[];
}

export interface RespuestaLogin {
  access_token: string;
  usuario: UsuarioSesion;
}

export type EstadoMembresia = 'activa' | 'por_vencer' | 'vencida' | 'congelada' | 'cancelada';

export interface ResumenMembresia {
  id_membresia: number;
  plan: { id_plan: number; nombre: string };
  estado: EstadoMembresia;
  fecha_inicio: string;
  vigente_hasta: string;
  dias_restantes: number;
}

export const OBJETIVOS = {
  perder_peso: 'Perder peso',
  ganar_masa: 'Ganar masa muscular',
  tonificar: 'Tonificar',
  resistencia: 'Resistencia',
  salud_general: 'Salud general',
  rehabilitacion: 'Rehabilitación',
  otro: 'Otro',
} as const;
export type Objetivo = keyof typeof OBJETIVOS;

export interface ContactoEmergencia {
  nombre: string;
  parentesco: string;
  telefono: string;
}

export interface SocioListado {
  id_socio: number;
  folio: string;
  nombre: string;
  id_sede: number;
  sede: string;
  foto_url: string | null;
  estado: 'activo' | 'baja';
  telefono_mascara: string;
  membresia: ResumenMembresia | null;
}

export interface SocioDetalle {
  id_socio: number;
  folio: string;
  id_sede: number;
  nombre: string;
  fecha_nacimiento: string;
  edad: number;
  telefono: string;
  correo: string;
  contacto_emergencia: ContactoEmergencia;
  foto_url: string | null;
  objetivo: Objetivo | null;
  estado: 'activo' | 'baja';
  fecha_alta: string;
  fecha_baja: string | null;
  motivo_baja: string | null;
  membresia: ResumenMembresia | null;
}

export interface SocioEntrada {
  nombre: string;
  fecha_nacimiento: string;
  telefono: string;
  correo: string;
  contacto_emergencia: ContactoEmergencia;
  foto_url?: string;
  objetivo?: Objetivo;
  id_sede: number;
}

export interface Pagina<T> {
  total: number;
  pagina: number;
  por_pagina: number;
  datos: T[];
}

export type TipoPlan = 'mensual' | 'trimestral' | 'anual';

export interface Plan {
  id_plan: number;
  nombre: string;
  tipo: TipoPlan;
  duracion_dias: number;
  precio: number;
  beneficios: string | null;
  activo: boolean;
}

export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia';

export interface PagoResumen {
  id_pago: number;
  folio: string;
  monto: number;
  metodo: MetodoPago;
  estado: 'registrado' | 'cancelado';
  fecha_pago: string;
}

export interface Membresia {
  id_membresia: number;
  plan: { id_plan: number; nombre: string; tipo: TipoPlan; duracion_dias: number };
  fecha_inicio: string;
  fecha_vencimiento: string;
  estado: EstadoMembresia;
  es_renovacion: boolean;
  creada_en: string;
  congelamientos: {
    id_congelamiento: number;
    fecha_inicio: string;
    fecha_fin: string;
    dias_extendidos: number;
    motivo: string | null;
  }[];
  pagos: PagoResumen[];
}

export interface HistorialMembresias {
  resumen: ResumenMembresia | null;
  membresias: Membresia[];
}

export interface ResultadoAsignacion {
  id_membresia: number;
  plan: { id_plan: number; nombre: string };
  fecha_inicio: string;
  fecha_vencimiento: string;
  es_renovacion: boolean;
  acumulada: boolean;
  pago: { id_pago: number; folio: string; monto: number } | null;
}

export interface Pago {
  id_pago: number;
  folio: string;
  socio: { id_socio: number; folio: string; nombre: string };
  plan: { id_plan: number; nombre: string; tipo: TipoPlan };
  sede: { id_sede: number; nombre: string };
  membresia: { id_membresia: number; fecha_inicio: string; fecha_vencimiento: string; estado: string };
  monto: number;
  metodo: MetodoPago;
  referencia: string | null;
  estado: 'registrado' | 'cancelado';
  fecha_pago: string;
  registrado_por: { id_usuario: number; nombre: string };
  motivo_cancelacion: string | null;
  autorizado_por: { id_usuario: number; nombre: string } | null;
  cancelado_en: string | null;
}

export type NivelActividad = 'sedentario' | 'bajo' | 'medio' | 'alto';

export interface FichaSalud {
  id_ficha: number;
  version: number;
  antecedentes: string | null;
  lesiones: string | null;
  alergias: string | null;
  medicamentos: string | null;
  nivel_actividad: NivelActividad | null;
  objetivo: string | null;
  restricciones_rutina: string[];
  origen: 'crm' | 'app';
  borrador: boolean;
  actualizado_por: { id_usuario: number | null; nombre?: string };
  creado_en: string;
}

export interface VersionFicha {
  id_ficha: number;
  version: number;
  origen: 'crm' | 'app';
  borrador: boolean;
  nivel_actividad: NivelActividad | null;
  creado_en: string;
  actualizado_por: { id_usuario: number; nombre: string } | null;
}

export interface AvisoPrivacidad {
  id_aviso: number;
  version: string;
  contenido: string;
  vigente_desde: string;
}

// Rutinas y entrenamiento

export const TIPOS_BLOQUE = {
  calentamiento: 'Calentamiento',
  fuerza: 'Fuerza',
  cardio: 'Cardio',
  estiramiento: 'Estiramiento',
} as const;
export type TipoBloque = keyof typeof TIPOS_BLOQUE;

export const NIVELES = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
} as const;
export type Nivel = keyof typeof NIVELES;

/** Etiquetas compartidas entre la ficha de salud y las contraindicaciones de ejercicios. */
export const RESTRICCIONES: Record<string, string> = {
  sin_impacto: 'Sin impacto',
  sin_saltos: 'Sin saltos',
  evitar_rodilla: 'Evitar carga en rodilla',
  evitar_hombro: 'Evitar carga en hombro',
  evitar_lumbar: 'Evitar carga lumbar',
  sin_carga_axial: 'Sin carga sobre la columna',
};

export interface Ejercicio {
  id: string;
  nombre: string;
  grupo_muscular: string;
  equipo: string;
  descripcion: string | null;
  media_url: string | null;
  media_tipo: 'imagen' | 'video' | null;
  contraindicaciones: string[];
  activo: boolean;
}

export interface EjercicioEnBloque {
  id_ejercicio: string;
  nombre: string;
  series: number;
  repeticiones: string;
  descanso_seg: number;
  notas: string | null;
  activo?: boolean;
  contraindicaciones?: string[];
}

export interface Bloque {
  tipo: TipoBloque;
  orden?: number;
  ejercicios: EjercicioEnBloque[];
}

export interface Plantilla {
  id: string;
  nombre: string;
  objetivo: Objetivo;
  nivel: Nivel;
  descripcion: string | null;
  dias_semana: number | null;
  activa: boolean;
  duplicada_de: string | null;
  total_ejercicios: number;
  bloques: Bloque[];
}

export interface Conflicto {
  id_ejercicio: string;
  ejercicio: string;
  restricciones: string[];
}

export interface Sugerencia {
  id: string;
  nombre: string;
  objetivo: Objetivo;
  nivel: Nivel;
  dias_semana: number | null;
  total_ejercicios: number;
  coincide_objetivo: boolean;
  compatible: boolean;
  conflictos: Conflicto[];
}

export interface Sugerencias {
  objetivo_socio: Objetivo | null;
  restricciones: string[];
  plantillas: Sugerencia[];
}

interface PersonaResumen {
  id_usuario: number;
  nombre: string;
}

export interface RutinaResumen {
  id_rutina: number;
  estado: 'vigente' | 'reemplazada' | 'finalizada';
  plantilla: { id: string; nombre: string | null };
  entrenador: PersonaResumen;
  sesiones_planeadas_semana: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  total_versiones: number;
  version_actual: { numero_version: number; fecha: string; motivo: string | null; autor: PersonaResumen };
}

export interface RutinasSocio {
  vigente: (RutinaResumen & { bloques: Bloque[] }) | null;
  historial: RutinaResumen[];
}

export interface VersionRutina {
  numero_version: number;
  fecha: string;
  motivo: string | null;
  autor: PersonaResumen;
}

export interface ContenidoVersion extends VersionRutina {
  id_rutina: number;
  nombre_plantilla: string | null;
  bloques: Bloque[];
}

export interface SesionEntrenamiento {
  id_sesion: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  duracion_min: number | null;
  completada: boolean;
  calorias: number | null;
  fc_promedio: number | null;
  fc_maxima: number | null;
  pasos: number | null;
  numero_version: number | null;
  detalle: { ejercicios?: { nombre: string; series?: { repeticiones?: number; carga_kg?: number }[] }[] } | null;
}

export interface Seguimiento {
  desde: string;
  hasta: string;
  resumen: {
    sesiones_planeadas: number;
    sesiones_cumplidas: number;
    adherencia: number | null;
    minutos_totales: number;
    calorias_totales: number;
    fc_promedio: number | null;
  };
  sesiones: SesionEntrenamiento[];
}
