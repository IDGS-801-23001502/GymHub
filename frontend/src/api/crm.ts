/** Tipos y servicios de asistencia, retención, analítica y administración. */
import { api, query } from './cliente';
import type { ResumenMembresia, Rol } from './tipos';

// ---------- Asistencia (CRM-RF-11) ----------
export type MembresiaBreve = ResumenMembresia;

export interface SocioEncontrado {
  id_socio: number;
  folio: string;
  nombre: string;
  foto_url: string | null;
  estado: 'activo' | 'baja';
  sede: string;
  membresia: MembresiaBreve | null;
  ultima_visita: string | null;
}

export interface ResultadoEntrada {
  id_asistencia: number;
  fecha_hora: string;
  duplicada: boolean;
  socio: { id_socio: number; folio: string; nombre: string; foto_url: string | null };
  membresia: MembresiaBreve | null;
  alerta: 'ok' | 'aviso' | 'error';
  mensaje: string;
}

export type EstadoAsistencia = 'vigente' | 'por_vencer' | 'vencida';

export interface AsistenciaDia {
  fecha: string;
  total: number;
  socios_unicos: number;
  por_estado: Record<EstadoAsistencia, number>;
  registros: {
    id_asistencia: number;
    fecha_hora: string;
    metodo_registro: 'qr' | 'busqueda';
    estado_membresia: EstadoAsistencia;
    socio: { id_socio: number; folio: string; nombre: string };
    sede: string;
    registrado_por: string;
  }[];
}

export interface AsistenciasSocio {
  visitas_30_dias: number;
  ultima_visita: string | null;
  registros: { id_asistencia: number; fecha_hora: string; sede: string; metodo_registro: string; estado_membresia: EstadoAsistencia }[];
}

export const asistenciaApi = {
  buscar: (q: string) => api.get<SocioEncontrado[]>(`/asistencia/buscar${query({ q })}`),
  registrar: (datos: { id_sede: number; id_socio?: number; codigo?: string }) => api.post<ResultadoEntrada>('/asistencia', datos),
  delDia: (f: { id_sede?: number; fecha?: string }) => api.get<AsistenciaDia>(`/asistencia${query(f)}`),
  deSocio: (idSocio: number) => api.get<AsistenciasSocio>(`/socios/${idSocio}/asistencias`),
};

// ---------- Interacciones (CRM-RF-15) ----------
export type TipoInteraccion = 'notificacion' | 'renovacion' | 'cambio_rutina' | 'llamada' | 'nota' | 'pago' | 'otro';

export interface Interaccion {
  id_interaccion: number;
  tipo: TipoInteraccion;
  descripcion: string;
  fecha: string;
  responsable: string;
}

export const interaccionesApi = {
  listar: (idSocio: number, tipo?: string) => api.get<Interaccion[]>(`/socios/${idSocio}/interacciones${query({ tipo })}`),
  agregar: (idSocio: number, tipo: 'nota' | 'llamada', descripcion: string) =>
    api.post<Interaccion>(`/socios/${idSocio}/interacciones`, { tipo, descripcion }),
};

// ---------- Segmentos (CRM-RF-12) ----------
export interface FiltrosSegmento {
  estados_membresia?: string[];
  sedes?: number[];
  objetivos?: string[];
  visitas_min?: number;
  visitas_max?: number;
  antiguedad_min_dias?: number;
  antiguedad_max_dias?: number;
  edad_min?: number;
  edad_max?: number;
  incluir_bajas?: boolean;
}

export interface Segmento {
  id_segmento: number;
  nombre: string;
  descripcion: string | null;
  filtros: FiltrosSegmento;
  creado_por: string;
  creado_en: string;
  campanas: number;
  total: number;
}

export interface SocioDeSegmento {
  id_socio: number;
  folio: string;
  nombre: string;
  sede: string;
  objetivo: string | null;
  edad: number;
  fecha_alta: string;
  estado_membresia: string;
  vigente_hasta: string | null;
  visitas_30: number;
}

export const segmentosApi = {
  listar: () => api.get<Segmento[]>('/segmentos'),
  previsualizar: (filtros: FiltrosSegmento) => api.post<{ total: number; socios: SocioDeSegmento[] }>('/segmentos/previsualizar', filtros),
  crear: (datos: { nombre: string; descripcion?: string; filtros: FiltrosSegmento }) => api.post<Segmento>('/segmentos', datos),
  actualizar: (id: number, datos: { nombre: string; descripcion?: string; filtros: FiltrosSegmento }) => api.put<Segmento>(`/segmentos/${id}`, datos),
  eliminar: (id: number) => api.delete<{ ok: boolean }>(`/segmentos/${id}`),
  socios: (id: number) => api.get<{ segmento: { id_segmento: number; nombre: string }; socios: SocioDeSegmento[] }>(`/segmentos/${id}/socios`),
  exportar: (id: number, nombre: string) => api.descargar(`/segmentos/${id}/exportar`, `segmento-${nombre}.csv`),
};

// ---------- Riesgo de deserción (CRM-RF-13) ----------
export type EstadoRiesgo = 'abierto' | 'atendido' | 'resuelto' | 'descartado';
export type TipoAccion = 'llamada' | 'notificacion' | 'visita' | 'promocion' | 'otra';

export interface Riesgo {
  id_riesgo: number;
  motivo: 'inactividad' | 'membresia_por_vencer';
  detalle: string | null;
  estado: EstadoRiesgo;
  detectado_en: string;
  cerrado_en: string | null;
  socio: { id_socio: number; folio: string; nombre: string; sede: string };
  acciones: { id_accion: number; tipo_accion: TipoAccion; descripcion: string | null; fecha: string; realizada_por: string }[];
}

export interface ConfigRiesgo {
  dias_inactividad: number;
  dias_aviso_vencimiento: number;
  activa: boolean;
}

export interface ConfiguracionesRiesgo {
  global: ConfigRiesgo;
  sedes: ({ id_sede: number; nombre: string; personalizada: boolean } & Partial<ConfigRiesgo>)[];
}

export const riesgoApi = {
  tablero: (f: { estado?: string; id_sede?: number }) => api.get<Riesgo[]>(`/riesgo${query(f)}`),
  accion: (id: number, datos: { tipo_accion: TipoAccion; descripcion?: string; estado?: EstadoRiesgo }) =>
    api.post<Riesgo>(`/riesgo/${id}/acciones`, datos),
  config: () => api.get<ConfiguracionesRiesgo>('/riesgo/config'),
  guardarConfig: (datos: ConfigRiesgo & { id_sede?: number | null }) => api.put<ConfiguracionesRiesgo>('/riesgo/config', datos),
  evaluar: () => api.post<{ evaluados: number; nuevos: number; resueltos: number; recordatorios: number }>('/riesgo/evaluar'),
};

// ---------- Campañas (CRM-RF-14) ----------
export type CategoriaNotif = 'vencimiento' | 'rutina' | 'promociones' | 'avisos';
export type EstadoCampana = 'borrador' | 'programada' | 'procesando' | 'enviada' | 'cancelada';

export interface Campana {
  id_campana: number;
  titulo: string;
  contenido: string;
  categoria: CategoriaNotif;
  tipo_destino: 'socio' | 'segmento';
  destino: string;
  id_socio_destino: number | null;
  id_segmento: number | null;
  modo_envio: 'inmediato' | 'programado';
  programada_para: string | null;
  estado: EstadoCampana;
  creada_por: string;
  creada_en: string;
  envios: { pendiente: number; enviado: number; entregado: number; fallido: number };
}

export interface CampanaDetalle extends Campana {
  notificaciones: {
    id_notificacion: number;
    socio: { id_socio: number; folio: string; nombre: string };
    estado: 'pendiente' | 'enviado' | 'entregado' | 'fallido';
    intentos: number;
    error: string | null;
    enviada_en: string | null;
    entregada_en: string | null;
    leida_en: string | null;
  }[];
}

export interface EntradaCampana {
  titulo: string;
  contenido: string;
  categoria: CategoriaNotif;
  tipo_destino: 'socio' | 'segmento';
  id_socio_destino?: number;
  id_segmento?: number;
  modo_envio: 'inmediato' | 'programado';
  programada_para?: string;
  borrador?: boolean;
}

export const campanasApi = {
  listar: () => api.get<Campana[]>('/campanas'),
  detalle: (id: number) => api.get<CampanaDetalle>(`/campanas/${id}`),
  crear: (datos: EntradaCampana) => api.post<CampanaDetalle>('/campanas', datos),
  enviar: (id: number) => api.post<CampanaDetalle>(`/campanas/${id}/enviar`),
  cancelar: (id: number) => api.post<CampanaDetalle>(`/campanas/${id}/cancelar`),
  reintentar: (id: number) => api.post<{ reintentos: number }>(`/campanas/${id}/reintentar`),
};

// ---------- Analítica (CRM-RF-16, CRM-RF-17) ----------
export interface FiltroAnalitica {
  id_sede?: number;
  desde?: string;
  hasta?: string;
}

export interface Panel {
  desde: string;
  hasta: string;
  indicadores: {
    socios_activos: number;
    altas: number;
    bajas: number;
    por_vencer: number;
    vencidas: number;
    en_riesgo: number;
    riesgo_por_motivo: Record<string, number>;
    asistencia_hoy: number;
    ingresos: number;
  };
  asistencia_diaria: { fecha: string; visitas: number }[];
  por_sede: { id_sede: number; nombre: string; socios_activos: number; asistencia_hoy: number; visitas_periodo: number; ingresos: number }[];
}

export interface Reportes {
  desde: string;
  hasta: string;
  resumen: { visitas: number; ingresos: number; renovaciones: number; tasa_retencion: number | null; adherencia: number | null };
  por_mes: {
    mes: string;
    visitas: number;
    ingresos: number;
    altas_membresia: number;
    renovaciones: number;
    vencimientos: number;
    renovaron: number;
    tasa_retencion: number | null;
    sesiones_planeadas: number;
    sesiones_cumplidas: number;
    adherencia: number | null;
  }[];
  horas_pico: number[][];
  renovaciones_por_plan: { nombre: string; total: number }[];
  renovaciones_por_sede: { nombre: string; total: number }[];
  ingresos_por_plan: { nombre: string; total: number }[];
  ingresos_por_sede: { nombre: string; total: number }[];
  ingresos_por_metodo: { nombre: string; total: number }[];
}

export const analiticaApi = {
  panel: (f: FiltroAnalitica) => api.get<Panel>(`/analitica/panel${query({ ...f })}`),
  reportes: (f: FiltroAnalitica) => api.get<Reportes>(`/analitica/reportes${query({ ...f })}`),
};

// ---------- Administración (CRM-RF-18 a CRM-RF-20) ----------
export interface UsuarioAdmin {
  id_usuario: number;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  es_admin_general: boolean;
  bloqueado: boolean;
  ultimo_acceso: string | null;
  creado_en: string;
  sedes: { id_sede: number; nombre: string }[];
  sesiones_activas: number;
}

export interface SesionActiva {
  id_sesion: number;
  ip: string | null;
  creada_en: string;
  expira_en: string;
  activa: boolean;
}

export interface Horario {
  dia_semana: number;
  dia?: string;
  hora_apertura: string;
  hora_cierre: string;
}

export interface SedeAdmin {
  id_sede: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
  horarios: Horario[];
  personal: { id_usuario: number; nombre: string; rol: Rol }[];
  socios_activos: number;
}

export interface RegistroBitacora {
  id: number;
  fecha: string;
  usuario: { id_usuario: number; nombre: string } | null;
  socio: { id_socio: number; nombre?: string; folio?: string } | null;
  entidad: string;
  id_entidad: string | null;
  accion: string;
  ip: string | null;
  anterior: unknown;
  nuevo: unknown;
}

export interface PaginaBitacora {
  registros: RegistroBitacora[];
  total: number;
  pagina: number;
  por_pagina: number;
  entidades: string[];
}

export const TIPOS_ARCO = { acceso: 'Acceso', rectificacion: 'Rectificación', cancelacion: 'Cancelación', oposicion: 'Oposición' } as const;
export const ESTADOS_ARCO = { recibida: 'Recibida', en_proceso: 'En proceso', atendida: 'Atendida', rechazada: 'Rechazada' } as const;

export interface SolicitudArco {
  id_solicitud: number;
  tipo: keyof typeof TIPOS_ARCO;
  descripcion: string | null;
  estado: keyof typeof ESTADOS_ARCO;
  creada_en: string;
  atendida_en: string | null;
  socio: { id_socio: number; folio: string; nombre: string };
  atendida_por: string | null;
}

export const adminApi = {
  usuarios: () => api.get<UsuarioAdmin[]>('/usuarios'),
  crearUsuario: (d: { nombre: string; correo: string; password: string; rol: Rol; sedes: number[]; es_admin_general?: boolean }) =>
    api.post<UsuarioAdmin>('/usuarios', d),
  actualizarUsuario: (id: number, d: Partial<{ nombre: string; correo: string; password: string; rol: Rol; sedes: number[]; es_admin_general: boolean; activo: boolean }>) =>
    api.patch<UsuarioAdmin>(`/usuarios/${id}`, d),
  desbloquear: (id: number) => api.post<{ ok: boolean }>(`/usuarios/${id}/desbloquear`),
  sesiones: (id: number) => api.get<SesionActiva[]>(`/usuarios/${id}/sesiones`),
  cerrarSesiones: (id: number) => api.post<{ cerradas: number }>(`/usuarios/${id}/sesiones/cerrar`),
  cerrarSesion: (id: number, idSesion: number) => api.post<{ cerradas: number }>(`/usuarios/${id}/sesiones/${idSesion}/cerrar`),

  sedes: () => api.get<SedeAdmin[]>('/sedes-admin'),
  crearSede: (d: { nombre: string; direccion?: string; telefono?: string; horarios?: Horario[] }) => api.post<SedeAdmin>('/sedes-admin', d),
  actualizarSede: (id: number, d: Partial<{ nombre: string; direccion: string; telefono: string; horarios: Horario[]; activa: boolean }>) =>
    api.patch<SedeAdmin>(`/sedes-admin/${id}`, d),

  bitacora: (f: Record<string, string | number | undefined>) => api.get<PaginaBitacora>(`/bitacora${query(f)}`),

  solicitudesArco: (estado?: string) => api.get<SolicitudArco[]>(`/solicitudes-arco${query({ estado })}`),
  crearArco: (idSocio: number, d: { tipo: string; descripcion?: string }) => api.post<SolicitudArco>(`/socios/${idSocio}/solicitudes-arco`, d),
  atenderArco: (id: number, d: { estado: string }) => api.patch<SolicitudArco>(`/solicitudes-arco/${id}`, d),
  datosPersonales: (idSocio: number) => api.get<unknown>(`/socios/${idSocio}/datos-personales`),
};

export const archivosApi = {
  fotoSocio: (idSocio: number, archivo: File) => api.subir<{ foto_url: string }>(`/archivos/socios/${idSocio}/foto`, archivo),
  mediaEjercicio: (archivo: File) => api.subir<{ media_url: string; media_tipo: 'imagen' | 'video' }>('/archivos/ejercicios', archivo),
};

export const sesionApi = {
  logout: () => api.post<{ ok: boolean }>('/auth/logout'),
};

export const congelamientosApi = {
  terminar: (id: number) =>
    api.post<{ id_membresia: number; fecha_vencimiento: string; dias_devueltos: number; anulado: boolean }>(`/congelamientos/${id}/terminar`),
};
