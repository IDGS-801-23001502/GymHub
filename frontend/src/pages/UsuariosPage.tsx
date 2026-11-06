import { useState } from 'react';
import { adminApi, type UsuarioAdmin } from '../api/crm';
import type { Rol } from '../api/tipos';
import { useAuth } from '../auth/contexto';
import { IconoMas } from '../components/iconos';
import { Alerta, Avatar, Campo, Cargando, Modal } from '../components/ui';
import { formatoFechaHora } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

const ROLES: Record<Rol, string> = { administrador: 'Administrador', recepcionista: 'Recepcionista', entrenador: 'Entrenador' };
const PASSWORD_SEGURA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

/** Cuentas del personal, roles y sedes (CRM-RF-18). */
export function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const { datos, error, cargando, recargar } = useCarga(() => adminApi.usuarios(), 'usuarios');
  const [editando, setEditando] = useState<UsuarioAdmin | 'nuevo' | null>(null);
  const [sesiones, setSesiones] = useState<UsuarioAdmin | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [filtro, setFiltro] = useState('');

  const accion = async (fn: () => Promise<unknown>) => {
    setErrores([]);
    try {
      await fn();
      recargar();
    } catch (e) {
      setErrores(mensajesError(e));
    }
  };
  const lista = (datos ?? []).filter((u) => !filtro || `${u.nombre} ${u.correo}`.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Usuarios</h1>
          <p>Personal con acceso al CRM. Cambiar rol, sedes o contraseña cierra sus sesiones abiertas.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>
          <IconoMas /> Nuevo usuario
        </button>
      </div>
      {error && <Alerta mensajes={error.detalles} />}
      <Alerta mensajes={errores} />
      <div className="tarjeta">
        <div className="tarjeta-titulo">
          <input placeholder="Buscar por nombre o correo" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-80" aria-label="Buscar usuario" />
          <span className="muted pequeno">{lista.length} usuarios</span>
        </div>
        {cargando && !datos ? (
          <Cargando />
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Sedes</th>
                  <th>Estado</th>
                  <th>Último acceso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id_usuario}>
                    <td>
                      <div className="persona">
                        <Avatar nombre={u.nombre} />
                        <div>
                          <div className="font-semibold">
                            {u.nombre} {u.id_usuario === yo?.id_usuario && <span className="muted">(tú)</span>}
                          </div>
                          <div className="sub">{u.correo}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {ROLES[u.rol]}
                      {u.es_admin_general && <div className="pequeno muted">Todas las sedes</div>}
                    </td>
                    <td className="pequeno">{u.sedes.map((s) => s.nombre).join(', ') || '—'}</td>
                    <td>
                      {!u.activo ? (
                        <span className="badge badge-neutro">Inactivo</span>
                      ) : u.bloqueado ? (
                        <span className="badge badge-error">Bloqueado</span>
                      ) : (
                        <span className="badge badge-ok">Activo</span>
                      )}
                      {u.sesiones_activas > 0 && <div className="pequeno muted">{u.sesiones_activas} sesiones abiertas</div>}
                    </td>
                    <td className="pequeno">{formatoFechaHora(u.ultimo_acceso)}</td>
                    <td>
                      <div className="fila justify-end flex-nowrap">
                        {u.bloqueado && (
                          <button className="btn btn-sm" onClick={() => void accion(() => adminApi.desbloquear(u.id_usuario))}>
                            Desbloquear
                          </button>
                        )}
                        <button className="btn btn-sm" onClick={() => setSesiones(u)}>
                          Sesiones
                        </button>
                        <button className="btn btn-sm" onClick={() => setEditando(u)}>
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && (
        <EditorUsuario
          usuario={editando === 'nuevo' ? null : editando}
          esYo={editando !== 'nuevo' && editando.id_usuario === yo?.id_usuario}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
      {sesiones && (
        <SesionesUsuario
          usuario={sesiones}
          alCerrar={() => {
            setSesiones(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

function SesionesUsuario({ usuario, alCerrar }: { usuario: UsuarioAdmin; alCerrar: () => void }) {
  const { datos, error, recargar } = useCarga(() => adminApi.sesiones(usuario.id_usuario), `ses-${usuario.id_usuario}`);
  const [errores, setErrores] = useState<string[]>([]);
  const cerrar = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      recargar();
    } catch (e) {
      setErrores(mensajesError(e));
    }
  };
  const activas = datos?.filter((s) => s.activa) ?? [];
  return (
    <Modal
      titulo={`Sesiones de ${usuario.nombre}`}
      alCerrar={alCerrar}
      pie={
        <button className="btn btn-peligro" disabled={!activas.length} onClick={() => void cerrar(() => adminApi.cerrarSesiones(usuario.id_usuario))}>
          Cerrar todas
        </button>
      }
    >
      {error && <Alerta mensajes={error.detalles} />}
      <Alerta mensajes={errores} />
      {!datos ? (
        <Cargando />
      ) : !datos.length ? (
        <div className="vacio">Sin sesiones registradas.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Inicio</th>
              <th>IP</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datos.map((s) => (
              <tr key={s.id_sesion}>
                <td className="pequeno">{formatoFechaHora(s.creada_en)}</td>
                <td className="mono pequeno">{s.ip ?? '—'}</td>
                <td>{s.activa ? <span className="badge badge-ok">Activa</span> : <span className="badge badge-neutro">Cerrada</span>}</td>
                <td>
                  {s.activa && (
                    <button className="btn btn-sm btn-texto" onClick={() => void cerrar(() => adminApi.cerrarSesion(usuario.id_usuario, s.id_sesion))}>
                      Cerrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function EditorUsuario({ usuario, esYo, alCerrar, alGuardar }: { usuario: UsuarioAdmin | null; esYo: boolean; alCerrar: () => void; alGuardar: () => void }) {
  const sedes = useCarga(() => adminApi.sedes(), 'sedes-usuarios');
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [correo, setCorreo] = useState(usuario?.correo ?? '');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'recepcionista');
  const [idsSedes, setIdsSedes] = useState<number[]>(usuario?.sedes.map((s) => s.id_sede) ?? []);
  const [adminGeneral, setAdminGeneral] = useState(usuario?.es_admin_general ?? false);
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [error, setError] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const errores: string[] = [];
    if (!nombre.trim()) errores.push('Escribe el nombre.');
    if (!/^\S+@\S+\.\S+$/.test(correo)) errores.push('Correo no válido.');
    if ((!usuario || password) && !PASSWORD_SEGURA.test(password))
      errores.push('La contraseña debe tener al menos 10 caracteres, con mayúscula, minúscula, número y símbolo.');
    if (!idsSedes.length) errores.push('Asigna al menos una sede.');
    if (errores.length) return setError(errores);
    setGuardando(true);
    try {
      if (usuario) {
        await adminApi.actualizarUsuario(usuario.id_usuario, {
          nombre: nombre.trim(),
          correo,
          rol,
          sedes: idsSedes,
          es_admin_general: adminGeneral,
          activo,
          ...(password && { password }),
        });
      } else {
        await adminApi.crearUsuario({ nombre: nombre.trim(), correo, password, rol, sedes: idsSedes, es_admin_general: adminGeneral });
      }
      alGuardar();
    } catch (e) {
      setError(mensajesError(e));
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={usuario ? 'Editar usuario' : 'Nuevo usuario'}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={() => void guardar()} disabled={guardando}>
            Guardar
          </button>
        </>
      }
    >
      <Alerta mensajes={error} />
      <Campo etiqueta="Nombre">{(p) => <input {...p} value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} />}</Campo>
      <Campo etiqueta="Correo">{(p) => <input {...p} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />}</Campo>
      <Campo etiqueta={usuario ? 'Nueva contraseña (opcional)' : 'Contraseña'} ayuda="Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo.">
        {(p) => <input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Campo>
      <Campo etiqueta="Rol">
        {(p) => (
          <select {...p} value={rol} disabled={esYo} onChange={(e) => setRol(e.target.value as Rol)}>
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <div className="campo">
        <label>Sedes</label>
        <div className="chips">
          {sedes.datos?.map((s) => (
            <button
              key={s.id_sede}
              type="button"
              className="chip"
              aria-pressed={idsSedes.includes(s.id_sede)}
              onClick={() => setIdsSedes(idsSedes.includes(s.id_sede) ? idsSedes.filter((x) => x !== s.id_sede) : [...idsSedes, s.id_sede])}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      </div>
      {rol === 'administrador' && (
        <label className="casilla">
          <input type="checkbox" checked={adminGeneral} disabled={esYo} onChange={(e) => setAdminGeneral(e.target.checked)} />
          Administrador general (ve y compara todas las sedes)
        </label>
      )}
      {usuario && !esYo && (
        <label className="casilla">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Cuenta activa
        </label>
      )}
    </Modal>
  );
}
