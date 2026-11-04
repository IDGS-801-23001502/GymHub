import { createContext, useContext } from 'react';
import type { Rol, UsuarioSesion } from '../api/tipos';

export interface ContextoAuth {
  usuario: UsuarioSesion | null;
  /** true mientras se valida un token guardado al recargar la página. */
  iniciando: boolean;
  /** Motivo del último cierre de sesión automático (inactividad o expiración). */
  avisoCierre: string | null;
  iniciarSesion: (correo: string, password: string) => Promise<void>;
  cerrarSesion: (motivo?: string) => void;
  /** El administrador siempre tiene permiso (igual que RolesGuard en el backend). */
  puede: (...roles: Rol[]) => boolean;
}

export const AuthContext = createContext<ContextoAuth | null>(null);

export function useAuth(): ContextoAuth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
