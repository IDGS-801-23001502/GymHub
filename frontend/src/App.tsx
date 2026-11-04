import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Rol } from './api/tipos';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/contexto';
import { Layout } from './components/Layout';
import { Cargando } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { NuevoSocioPage } from './pages/NuevoSocioPage';
import { EjerciciosPage } from './pages/EjerciciosPage';
import { PagosPage } from './pages/PagosPage';
import { PlantillaEditorPage } from './pages/PlantillaEditorPage';
import { PlantillasPage } from './pages/PlantillasPage';
import { PlanesPage } from './pages/PlanesPage';
import { SocioDetallePage } from './pages/socio/SocioDetallePage';
import { SociosPage } from './pages/SociosPage';
import { ArcoPage } from './pages/ArcoPage';
import { AsistenciaPage } from './pages/AsistenciaPage';
import { BitacoraPage } from './pages/BitacoraPage';
import { CampanasPage } from './pages/CampanasPage';
import { PanelPage } from './pages/PanelPage';
import { ReportesPage } from './pages/ReportesPage';
import { RiesgoPage } from './pages/RiesgoPage';
import { SedesPage } from './pages/SedesPage';
import { SegmentosPage } from './pages/SegmentosPage';
import { UsuariosPage } from './pages/UsuariosPage';

/** Exige sesión (y, opcionalmente, un rol). El backend vuelve a validar cada petición. */
function Protegida({ children, roles }: { children: ReactNode; roles?: Rol[] }) {
  const { usuario, iniciando, puede } = useAuth();
  const location = useLocation();
  if (iniciando) return <Cargando texto="Verificando sesión…" />;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location.pathname + location.search }} />;
  if (roles && !puede(...roles)) {
    return (
      <div className="vacio">
        <h2>Sin acceso</h2>
        <p>Tu rol no tiene permiso para esta sección.</p>
        <Link to="/socios">Ir a socios</Link>
      </div>
    );
  }
  return children;
}

/** Cada rol entra a la pantalla que más usa. */
function Inicio() {
  const { usuario } = useAuth();
  const destino = usuario?.rol === 'administrador' ? '/panel' : usuario?.rol === 'recepcionista' ? '/asistencia' : '/socios';
  return <Navigate to={destino} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <Protegida>
                <Layout />
              </Protegida>
            }
          >
            <Route index element={<Inicio />} />
            <Route path="socios" element={<SociosPage />} />
            <Route path="socios/nuevo" element={<Protegida roles={['recepcionista']}><NuevoSocioPage /></Protegida>} />
            <Route path="socios/:id" element={<SocioDetallePage />} />
            <Route path="pagos" element={<Protegida roles={['recepcionista']}><PagosPage /></Protegida>} />
            <Route path="planes" element={<PlanesPage />} />
            <Route path="ejercicios" element={<Protegida roles={['entrenador']}><EjerciciosPage /></Protegida>} />
            <Route path="plantillas" element={<Protegida roles={['entrenador']}><PlantillasPage /></Protegida>} />
            <Route path="plantillas/:id" element={<Protegida roles={['entrenador']}><PlantillaEditorPage /></Protegida>} />
            <Route path="panel" element={<Protegida roles={['administrador']}><PanelPage /></Protegida>} />
            <Route path="reportes" element={<Protegida roles={['administrador']}><ReportesPage /></Protegida>} />
            <Route path="asistencia" element={<Protegida roles={['recepcionista']}><AsistenciaPage /></Protegida>} />
            <Route path="riesgo" element={<Protegida roles={['recepcionista']}><RiesgoPage /></Protegida>} />
            <Route path="segmentos" element={<Protegida roles={['administrador']}><SegmentosPage /></Protegida>} />
            <Route path="campanas" element={<Protegida roles={['administrador']}><CampanasPage /></Protegida>} />
            <Route path="usuarios" element={<Protegida roles={['administrador']}><UsuariosPage /></Protegida>} />
            <Route path="sedes" element={<Protegida roles={['administrador']}><SedesPage /></Protegida>} />
            <Route path="bitacora" element={<Protegida roles={['administrador']}><BitacoraPage /></Protegida>} />
            <Route path="arco" element={<Protegida roles={['recepcionista']}><ArcoPage /></Protegida>} />
            <Route path="*" element={<div className="vacio">Página no encontrada. <Link to="/socios">Ir a socios</Link></div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
