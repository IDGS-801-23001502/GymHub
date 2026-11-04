import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/cliente';

interface Resultado<T> {
  /** Llave (clave + versión) de la petición que produjo este resultado. */
  llave: string | null;
  datos: T | null;
  error: ApiError | null;
}

/** Carga datos y los vuelve a pedir cuando cambia `clave` o al llamar `recargar()`. */
export function useCarga<T>(cargar: () => Promise<T>, clave: string) {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<Resultado<T>>({ llave: null, datos: null, error: null });
  const llave = `${clave}#${version}`;

  useEffect(() => {
    let vigente = true;
    cargar()
      .then((datos) => vigente && setResultado({ llave, datos, error: null }))
      .catch((err: unknown) => {
        if (!vigente) return;
        const error = err instanceof ApiError ? err : new ApiError(0, ['Error inesperado.']);
        setResultado((r) => ({ llave, datos: r.datos, error }));
      });
    return () => {
      vigente = false;
    };
    // `cargar` cambia en cada render; la llave describe sus dependencias reales
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return {
    datos: resultado.datos,
    error: resultado.llave === llave ? resultado.error : null,
    cargando: resultado.llave !== llave,
    recargar,
  };
}

/** Mensajes de un error de API (la validación del backend devuelve varios). */
export function mensajesError(err: unknown): string[] {
  if (err instanceof ApiError) return err.detalles;
  return ['Ocurrió un error inesperado.'];
}
