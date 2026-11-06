import { useState } from 'react';
import { adminApi, type Horario, type SedeAdmin } from '../api/crm';
import { IconoMas, IconoSedes } from '../components/iconos';
import { Alerta, Campo, Cargando, Modal } from '../components/ui';
import { mensajesError, useCarga } from '../utils/useCarga';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Sedes del gimnasio con su horario (CRM-RF-19). */
export function SedesPage() {
  const { datos, error, cargando, recargar } = useCarga(() => adminApi.sedes(), 'sedes-admin');
  const [editando, setEditando] = useState<SedeAdmin | 'nueva' | null>(null);

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Sedes</h1>
          <p>Sucursales, horarios y personal asignado.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setEditando('nueva')}>
          <IconoMas /> Nueva sede
        </button>
      </div>
      {error && <Alerta mensajes={error.detalles} />}
      {cargando && !datos ? (
        <Cargando />
      ) : (
        <div className="rejilla rejilla-2">
          {datos?.map((s) => (
            <div key={s.id_sede} className={`tarjeta tarjeta-cuerpo espaciado gap-3 ${s.activa ? '' : 'opacity-60'}`}>
              <div className="fila justify-between">
                <div className="persona">
                  <div className="kpi-icono static">
                    <IconoSedes />
                  </div>
                  <div>
                    <h3>{s.nombre}</h3>
                    <div className="sub">{s.direccion ?? 'Sin dirección'}</div>
                  </div>
                </div>
                {s.activa ? <span className="badge badge-ok">Activa</span> : <span className="badge badge-neutro">Inactiva</span>}
              </div>
              <div className="fila pequeno">
                <span>
                  <b>{s.socios_activos}</b> socios activos
                </span>
                <span>
                  <b>{s.personal.length}</b> personas del staff
                </span>
                {s.telefono && <span className="muted">Tel. {s.telefono}</span>}
              </div>
              <div className="pequeno">
                {s.horarios.length ? (
                  s.horarios.map((h) => (
                    <div key={h.dia_semana} className="fila justify-between">
                      <span className="muted">{DIAS[h.dia_semana - 1]}</span>
                      <span className="mono">
                        {h.hora_apertura}–{h.hora_cierre}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="muted">Sin horario registrado</span>
                )}
              </div>
              <div className="fila justify-end">
                <button className="btn btn-sm" onClick={() => setEditando(s)}>
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editando && (
        <EditorSede
          sede={editando === 'nueva' ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

function EditorSede({ sede, alCerrar, alGuardar }: { sede: SedeAdmin | null; alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(sede?.nombre ?? '');
  const [direccion, setDireccion] = useState(sede?.direccion ?? '');
  const [telefono, setTelefono] = useState(sede?.telefono ?? '');
  const [activa, setActiva] = useState(sede?.activa ?? true);
  const [horarios, setHorarios] = useState<Horario[]>(
    sede?.horarios.map(({ dia_semana, hora_apertura, hora_cierre }) => ({ dia_semana, hora_apertura, hora_cierre })) ??
      [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, hora_apertura: '06:00', hora_cierre: '22:00' })).concat({ dia_semana: 6, hora_apertura: '08:00', hora_cierre: '14:00' }),
  );
  const [error, setError] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const deDia = (d: number) => horarios.find((h) => h.dia_semana === d);
  const cambiar = (d: number, campo: 'hora_apertura' | 'hora_cierre', v: string) =>
    setHorarios(horarios.map((h) => (h.dia_semana === d ? { ...h, [campo]: v } : h)));

  async function guardar() {
    if (!nombre.trim()) return setError(['Escribe el nombre de la sede.']);
    if (telefono && !/^\d{10}$/.test(telefono)) return setError(['El teléfono debe tener 10 dígitos.']);
    if (horarios.some((h) => h.hora_cierre <= h.hora_apertura)) return setError(['La hora de cierre debe ser posterior a la de apertura.']);
    setGuardando(true);
    try {
      const datos = { nombre: nombre.trim(), direccion: direccion.trim() || undefined, telefono: telefono || undefined, horarios };
      if (sede) await adminApi.actualizarSede(sede.id_sede, { ...datos, activa });
      else await adminApi.crearSede(datos);
      alGuardar();
    } catch (e) {
      setError(mensajesError(e));
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={sede ? 'Editar sede' : 'Nueva sede'}
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
      <Campo etiqueta="Nombre">{(p) => <input {...p} maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} />}</Campo>
      <Campo etiqueta="Dirección">{(p) => <input {...p} maxLength={255} value={direccion} onChange={(e) => setDireccion(e.target.value)} />}</Campo>
      <Campo etiqueta="Teléfono">{(p) => <input {...p} inputMode="numeric" maxLength={10} value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))} />}</Campo>
      <div className="campo">
        <label>Horario</label>
        <div className="espaciado gap-1.5">
          {DIAS.map((nombreDia, i) => {
            const d = i + 1;
            const h = deDia(d);
            return (
              <div key={d} className="horario">
                <label className="casilla items-center">
                  <input
                    type="checkbox"
                    checked={!!h}
                    onChange={(e) =>
                      setHorarios(
                        e.target.checked
                          ? [...horarios, { dia_semana: d, hora_apertura: '07:00', hora_cierre: '21:00' }].sort((a, b) => a.dia_semana - b.dia_semana)
                          : horarios.filter((x) => x.dia_semana !== d),
                      )
                    }
                  />
                  {nombreDia}
                </label>
                {h ? (
                  <>
                    <input type="time" aria-label={`Apertura ${nombreDia}`} value={h.hora_apertura} onChange={(e) => cambiar(d, 'hora_apertura', e.target.value)} />
                    <input type="time" aria-label={`Cierre ${nombreDia}`} value={h.hora_cierre} onChange={(e) => cambiar(d, 'hora_cierre', e.target.value)} />
                  </>
                ) : (
                  <span className="muted pequeno col-span-2">
                    Cerrado
                  </span>
                )}
                <span />
              </div>
            );
          })}
        </div>
      </div>
      {sede && (
        <label className="casilla">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Sede activa
        </label>
      )}
    </Modal>
  );
}
