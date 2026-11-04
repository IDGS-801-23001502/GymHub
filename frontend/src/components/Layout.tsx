import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/contexto';
import {
  IconoAsistencia,
  IconoBitacora,
  IconoCampanas,
  IconoEjercicios,
  IconoEscudo,
  IconoPagos,
  IconoPanel,
  IconoPlanes,
  IconoPlantillas,
  IconoReportes,
  IconoRiesgo,
  IconoSalir,
  IconoSedes,
  IconoSegmentos,
  IconoSocios,
  IconoUsuarios,
} from './iconos';

function Enlace({ a, icono, children }: { a: string; icono: ReactNode; children: string }) {
  return (
    <NavLink to={a} className="nav-link">
      {icono}
      <span>{children}</span>
    </NavLink>
  );
}

/** Estructura del CRM: el menú solo muestra lo que el rol puede usar (CRM-RNF-03). */
export function Layout() {
  const { usuario, puede, cerrarSesion } = useAuth();
  if (!usuario) return null;
  const admin = usuario.rol === 'administrador';

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Principal">
        <div className="marca">
          <img src="/logo.png" alt="" />
          <span>GymHub</span>
        </div>
        {admin && <Enlace a="/panel" icono={<IconoPanel />}>Panel</Enlace>}
        {puede('recepcionista') && <Enlace a="/asistencia" icono={<IconoAsistencia />}>Asistencia</Enlace>}
        <Enlace a="/socios" icono={<IconoSocios />}>Socios</Enlace>
        {puede('recepcionista') && <Enlace a="/pagos" icono={<IconoPagos />}>Pagos</Enlace>}
        <Enlace a="/planes" icono={<IconoPlanes />}>Planes</Enlace>

        {puede('entrenador') && (
          <>
            <div className="nav-seccion">Entrenamiento</div>
            <Enlace a="/ejercicios" icono={<IconoEjercicios />}>Ejercicios</Enlace>
            <Enlace a="/plantillas" icono={<IconoPlantillas />}>Plantillas</Enlace>
          </>
        )}

        {puede('recepcionista') && (
          <>
            <div className="nav-seccion">Retención</div>
            <Enlace a="/riesgo" icono={<IconoRiesgo />}>Riesgo</Enlace>
            {admin && <Enlace a="/segmentos" icono={<IconoSegmentos />}>Segmentos</Enlace>}
            {admin && <Enlace a="/campanas" icono={<IconoCampanas />}>Campañas</Enlace>}
          </>
        )}

        {admin && (
          <>
            <div className="nav-seccion">Administración</div>
            <Enlace a="/reportes" icono={<IconoReportes />}>Reportes</Enlace>
            <Enlace a="/usuarios" icono={<IconoUsuarios />}>Usuarios</Enlace>
            <Enlace a="/sedes" icono={<IconoSedes />}>Sedes</Enlace>
            <Enlace a="/bitacora" icono={<IconoBitacora />}>Bitácora</Enlace>
          </>
        )}
        {puede('recepcionista') && <Enlace a="/arco" icono={<IconoEscudo />}>Derechos ARCO</Enlace>}

        <div className="sidebar-pie">
          <div className="nombre">{usuario.nombre}</div>
          <div className="rol">
            {usuario.rol}
            {usuario.admin_general ? ' · todas las sedes' : ''}
          </div>
          <button className="btn btn-sm btn-texto" style={{ paddingLeft: 0, marginTop: 8 }} onClick={() => cerrarSesion()}>
            <IconoSalir /> Cerrar sesión
          </button>
        </div>
      </nav>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
