import { api, query } from './cliente';
import type {
  AvisoPrivacidad,
  Bloque,
  ContenidoVersion,
  Ejercicio,
  Nivel,
  Objetivo,
  Plantilla,
  RutinasSocio,
  Seguimiento,
  Sugerencias,
  TipoBloque,
  VersionRutina,
  ContactoEmergencia,
  FichaSalud,
  HistorialMembresias,
  MetodoPago,
  NivelActividad,
  Pagina,
  Pago,
  Plan,
  RespuestaLogin,
  ResultadoAsignacion,
  Sede,
  SocioDetalle,
  SocioEntrada,
  SocioListado,
  TipoPlan,
  UsuarioSesion,
  VersionFicha,
} from './tipos';

export const authApi = {
  login: (correo: string, password: string) =>
    api.post<RespuestaLogin>('/auth/login', { correo, password }),
  perfil: () => api.get<UsuarioSesion>('/auth/me'),
  sedes: () => api.get<Sede[]>('/sedes'),
};

export interface FiltrosSocios {
  q?: string;
  id_sede?: number;
  estado?: 'activo' | 'baja';
  pagina?: number;
  por_pagina?: number;
}

export const sociosApi = {
  buscar: (f: FiltrosSocios) => api.get<Pagina<SocioListado>>(`/socios${query({ ...f })}`),
  obtener: (id: number) => api.get<SocioDetalle>(`/socios/${id}`),
  crear: (datos: SocioEntrada & { acepta_aviso_privacidad: true }) =>
    api.post<SocioDetalle>('/socios', datos),
  actualizar: (id: number, datos: Partial<SocioEntrada> & { contacto_emergencia?: ContactoEmergencia }) =>
    api.patch<SocioDetalle>(`/socios/${id}`, datos),
  baja: (id: number, motivo: string) => api.post<SocioDetalle>(`/socios/${id}/baja`, { motivo }),
  reactivar: (id: number) => api.post<SocioDetalle>(`/socios/${id}/reactivar`),
  avisoVigente: () => api.get<AvisoPrivacidad>('/avisos-privacidad/vigente'),
};

export interface EntradaPlan {
  nombre: string;
  tipo: TipoPlan;
  precio: number;
  duracion_dias?: number;
  beneficios?: string;
}

export const planesApi = {
  listar: (incluirInactivos = false) =>
    api.get<Plan[]>(`/planes${query({ incluir_inactivos: incluirInactivos || undefined })}`),
  crear: (datos: EntradaPlan) => api.post<Plan>('/planes', datos),
  actualizar: (id: number, datos: Partial<EntradaPlan>) => api.patch<Plan>(`/planes/${id}`, datos),
  cambiarEstado: (id: number, activo: boolean) => api.patch<Plan>(`/planes/${id}/estado`, { activo }),
};

export interface EntradaPago {
  metodo: MetodoPago;
  monto?: number;
  referencia?: string;
}

export const membresiasApi = {
  historial: (idSocio: number) => api.get<HistorialMembresias>(`/socios/${idSocio}/membresias`),
  asignar: (idSocio: number, id_plan: number, pago?: EntradaPago) =>
    api.post<ResultadoAsignacion>(`/socios/${idSocio}/membresias`, { id_plan, pago }),
  congelar: (idMembresia: number, datos: { fecha_inicio?: string; fecha_fin: string; motivo?: string }) =>
    api.post<unknown>(`/membresias/${idMembresia}/congelamientos`, datos),
};

export interface FiltrosPagos {
  id_socio?: number;
  id_sede?: number;
  estado?: 'registrado' | 'cancelado';
  desde?: string;
  hasta?: string;
  pagina?: number;
  por_pagina?: number;
}

export const pagosApi = {
  listar: (f: FiltrosPagos) => api.get<Pagina<Pago>>(`/pagos${query({ ...f })}`),
  cancelar: (id: number, motivo: string) => api.post<Pago>(`/pagos/${id}/cancelar`, { motivo }),
  comprobante: (id: number) => api.texto(`/pagos/${id}/comprobante`),
};

export interface EntradaFicha {
  antecedentes?: string;
  lesiones?: string;
  alergias?: string;
  medicamentos?: string;
  nivel_actividad?: NivelActividad;
  objetivo?: string;
  restricciones_rutina?: string[];
  borrador?: boolean;
  acepta_tratamiento_datos_salud?: boolean;
}

export const fichaApi = {
  actual: (idSocio: number) => api.get<FichaSalud>(`/socios/${idSocio}/ficha-salud`),
  versiones: (idSocio: number) => api.get<VersionFicha[]>(`/socios/${idSocio}/ficha-salud/versiones`),
  version: (idSocio: number, v: number) =>
    api.get<FichaSalud>(`/socios/${idSocio}/ficha-salud/versiones/${v}`),
  guardar: (idSocio: number, datos: EntradaFicha) =>
    api.post<FichaSalud>(`/socios/${idSocio}/ficha-salud`, datos),
};

export interface EntradaEjercicio {
  nombre: string;
  grupo_muscular: string;
  equipo: string;
  descripcion?: string;
  media_url?: string;
  media_tipo?: 'imagen' | 'video';
  contraindicaciones?: string[];
}

export const ejerciciosApi = {
  listar: (f: { q?: string; grupo_muscular?: string; incluir_inactivos?: boolean } = {}) =>
    api.get<Ejercicio[]>(`/ejercicios${query({ ...f, incluir_inactivos: f.incluir_inactivos || undefined })}`),
  grupos: () => api.get<string[]>('/ejercicios/grupos'),
  crear: (datos: EntradaEjercicio) => api.post<Ejercicio>('/ejercicios', datos),
  actualizar: (id: string, datos: Partial<EntradaEjercicio>) => api.patch<Ejercicio>(`/ejercicios/${id}`, datos),
  cambiarEstado: (id: string, activo: boolean) => api.patch<Ejercicio>(`/ejercicios/${id}/estado`, { activo }),
};

/** Formato que acepta la API: sin nombres, porque el backend los copia del catálogo. */
export type BloqueEntrada = {
  tipo: TipoBloque;
  ejercicios: { id_ejercicio: string; series: number; repeticiones: string; descanso_seg: number; notas?: string }[];
};

export function aBloquesEntrada(bloques: Bloque[]): BloqueEntrada[] {
  return bloques.map((b) => ({
    tipo: b.tipo,
    ejercicios: b.ejercicios.map((e) => ({
      id_ejercicio: e.id_ejercicio,
      series: e.series,
      repeticiones: e.repeticiones.trim(),
      descanso_seg: e.descanso_seg,
      ...(e.notas?.trim() && { notas: e.notas.trim() }),
    })),
  }));
}

export interface EntradaPlantilla {
  nombre: string;
  objetivo: Objetivo;
  nivel: Nivel;
  descripcion?: string;
  dias_semana?: number;
  bloques: BloqueEntrada[];
}

export const plantillasApi = {
  listar: (f: { q?: string; objetivo?: string; nivel?: string; incluir_inactivas?: boolean } = {}) =>
    api.get<Plantilla[]>(`/plantillas${query({ ...f, incluir_inactivas: f.incluir_inactivas || undefined })}`),
  obtener: (id: string) => api.get<Plantilla>(`/plantillas/${id}`),
  crear: (datos: EntradaPlantilla) => api.post<Plantilla>('/plantillas', datos),
  actualizar: (id: string, datos: Partial<EntradaPlantilla>) => api.patch<Plantilla>(`/plantillas/${id}`, datos),
  duplicar: (id: string, nombre: string) => api.post<Plantilla>(`/plantillas/${id}/duplicar`, { nombre }),
  cambiarEstado: (id: string, activa: boolean) => api.patch<Plantilla>(`/plantillas/${id}/estado`, { activa }),
};

export interface EntradaAsignacion {
  id_plantilla: string;
  sesiones_planeadas_semana: number;
  fecha_inicio?: string;
  bloques?: BloqueEntrada[];
  motivo?: string;
  confirmar_conflictos?: boolean;
}

export const rutinasApi = {
  deSocio: (idSocio: number) => api.get<RutinasSocio>(`/socios/${idSocio}/rutinas`),
  sugerencias: (idSocio: number) => api.get<Sugerencias>(`/socios/${idSocio}/rutinas/sugerencias`),
  asignar: (idSocio: number, datos: EntradaAsignacion) =>
    api.post<{ id_rutina: number; numero_version: number }>(`/socios/${idSocio}/rutinas`, datos),
  versiones: (idRutina: number) => api.get<VersionRutina[]>(`/rutinas/${idRutina}/versiones`),
  version: (idRutina: number, n: number) => api.get<ContenidoVersion>(`/rutinas/${idRutina}/versiones/${n}`),
  nuevaVersion: (idRutina: number, datos: { bloques: BloqueEntrada[]; motivo: string; confirmar_conflictos?: boolean }) =>
    api.post<{ numero_version: number }>(`/rutinas/${idRutina}/versiones`, datos),
  finalizar: (idRutina: number, motivo?: string) => api.post<unknown>(`/rutinas/${idRutina}/finalizar`, { motivo }),
  seguimiento: (idSocio: number, desde?: string, hasta?: string) =>
    api.get<Seguimiento>(`/socios/${idSocio}/seguimiento${query({ desde, hasta })}`),
};
