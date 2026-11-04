/** Cliente HTTP del CRM: agrega el JWT y normaliza los errores de NestJS. */

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const CLAVE_TOKEN = 'gymhub.token';

/** El token vive en sessionStorage: se borra al cerrar la pestaña. */
export const almacenToken = {
  leer(): string | null {
    try {
      return sessionStorage.getItem(CLAVE_TOKEN);
    } catch {
      return null;
    }
  },
  guardar(token: string) {
    try {
      sessionStorage.setItem(CLAVE_TOKEN, token);
    } catch {
      /* almacenamiento no disponible */
    }
  },
  borrar() {
    try {
      sessionStorage.removeItem(CLAVE_TOKEN);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

export class ApiError extends Error {
  readonly estado: number;
  readonly detalles: string[];
  readonly cuerpo: unknown;

  constructor(estado: number, mensajes: string[], cuerpo?: unknown) {
    super(mensajes[0] ?? 'Error inesperado');
    this.name = 'ApiError';
    this.estado = estado;
    this.detalles = mensajes;
    this.cuerpo = cuerpo;
  }
}

let alExpirarSesion: (() => void) | null = null;
/** Lo registra AuthProvider para cerrar sesión ante un 401. */
export function registrarExpiracion(fn: (() => void) | null) {
  alExpirarSesion = fn;
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function solicitar(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<Response> {
  const token = almacenToken.leer();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined && !(cuerpo instanceof FormData) && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: cuerpo === undefined ? undefined : cuerpo instanceof FormData ? cuerpo : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ApiError(0, ['No se pudo conectar con el servidor. Revisa tu conexión.']);
  }

  if (!respuesta.ok) {
    let mensajes = [`Error ${respuesta.status}`];
    let cuerpoError: unknown;
    try {
      const datos = (await respuesta.json()) as { message?: string | string[] };
      cuerpoError = datos;
      if (datos.message) mensajes = Array.isArray(datos.message) ? datos.message : [datos.message];
    } catch {
      /* respuesta sin JSON */
    }
    if (respuesta.status === 401 && token && !ruta.startsWith('/auth/login')) {
      alExpirarSesion?.();
    }
    if (respuesta.status === 403) mensajes = ['No tienes permiso para esta operación.', ...mensajes.slice(1)];
    throw new ApiError(respuesta.status, mensajes, cuerpoError);
  }
  return respuesta;
}

export const api = {
  async get<T>(ruta: string): Promise<T> {
    return (await solicitar('GET', ruta)).json() as Promise<T>;
  },
  async post<T>(ruta: string, cuerpo?: unknown): Promise<T> {
    return (await solicitar('POST', ruta, cuerpo ?? {})).json() as Promise<T>;
  },
  async patch<T>(ruta: string, cuerpo: unknown): Promise<T> {
    return (await solicitar('PATCH', ruta, cuerpo)).json() as Promise<T>;
  },
  async put<T>(ruta: string, cuerpo: unknown): Promise<T> {
    return (await solicitar('PUT', ruta, cuerpo)).json() as Promise<T>;
  },
  async delete<T>(ruta: string): Promise<T> {
    return (await solicitar('DELETE', ruta)).json() as Promise<T>;
  },
  async texto(ruta: string): Promise<string> {
    return (await solicitar('GET', ruta)).text();
  },
  /** Sube un archivo como multipart/form-data en el campo "archivo". */
  async subir<T>(ruta: string, archivo: File): Promise<T> {
    const datos = new FormData();
    datos.append('archivo', archivo);
    return (await solicitar('POST', ruta, datos)).json() as Promise<T>;
  },
  /** Descarga una respuesta autenticada como archivo. */
  async descargar(ruta: string, nombre: string) {
    const blob = await (await solicitar('GET', ruta)).blob();
    descargarBlob(blob, nombre);
  },
};

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** URL absoluta de un archivo servido por el backend (/uploads/...). */
export function urlArchivo(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  return /^https?:/.test(ruta) ? ruta : `${API_URL}${ruta}`;
}


/** Construye un query string omitiendo valores vacíos. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
