import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { almacenToken, registrarExpiracion } from '../api/cliente';
import { sesionApi } from '../api/crm';
import { authApi } from '../api/servicios';
import type { Rol, UsuarioSesion } from '../api/tipos';
import { AuthContext, type ContextoAuth } from './contexto';

/** Cierre automático por inactividad (CRM-RNF-03). */
const MINUTOS_INACTIVIDAD = Number(import.meta.env.VITE_MINUTOS_INACTIVIDAD ?? 30);
const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

/** Lee la expiración (exp, en segundos) del JWT sin validarlo; la validación la hace el backend. */
function expiracionToken(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [iniciando, setIniciando] = useState(() => almacenToken.leer() !== null);
  const [avisoCierre, setAvisoCierre] = useState<string | null>(null);

  const cerrarSesion = useCallback((motivo?: string) => {
    // Revoca la sesión en el servidor; si falla (sin red o ya expirada) igual se cierra localmente
    if (almacenToken.leer() && !motivo) void sesionApi.logout().catch(() => undefined);
    almacenToken.borrar();
    setUsuario(null);
    setAvisoCierre(motivo ?? null);
  }, []);

  // Restaura la sesión al recargar si el token sigue siendo válido
  useEffect(() => {
    if (!almacenToken.leer()) return;
    let activo = true;
    authApi
      .perfil()
      .then((u) => activo && setUsuario(u))
      .catch(() => activo && almacenToken.borrar())
      .finally(() => activo && setIniciando(false));
    return () => {
      activo = false;
    };
  }, []);

  // Un 401 de cualquier petición cierra la sesión
  useEffect(() => {
    registrarExpiracion(() => cerrarSesion('Tu sesión expiró. Vuelve a iniciar sesión.'));
    return () => registrarExpiracion(null);
  }, [cerrarSesion]);

  // Inactividad y expiración del token
  useEffect(() => {
    if (!usuario) return;
    const token = almacenToken.leer();
    const expira = token ? expiracionToken(token) : null;
    let temporizador: number;

    const reiniciar = () => {
      window.clearTimeout(temporizador);
      const porInactividad = MINUTOS_INACTIVIDAD * 60_000;
      const porExpiracion = expira ? expira - Date.now() : Infinity;
      temporizador = window.setTimeout(
        () =>
          cerrarSesion(
            porExpiracion < porInactividad
              ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
              : `Sesión cerrada tras ${MINUTOS_INACTIVIDAD} minutos de inactividad.`,
          ),
        Math.max(0, Math.min(porInactividad, porExpiracion)),
      );
    };
    reiniciar();
    for (const e of EVENTOS_ACTIVIDAD) window.addEventListener(e, reiniciar, { passive: true });
    return () => {
      window.clearTimeout(temporizador);
      for (const e of EVENTOS_ACTIVIDAD) window.removeEventListener(e, reiniciar);
    };
  }, [usuario, cerrarSesion]);

  const iniciarSesion = useCallback(async (correo: string, password: string) => {
    const r = await authApi.login(correo, password);
    almacenToken.guardar(r.access_token);
    setAvisoCierre(null);
    setUsuario(r.usuario);
  }, []);

  const valor = useMemo<ContextoAuth>(
    () => ({
      usuario,
      iniciando,
      avisoCierre,
      iniciarSesion,
      cerrarSesion,
      puede: (...roles: Rol[]) =>
        !!usuario && (usuario.rol === 'administrador' || roles.includes(usuario.rol)),
    }),
    [usuario, iniciando, avisoCierre, iniciarSesion, cerrarSesion],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
