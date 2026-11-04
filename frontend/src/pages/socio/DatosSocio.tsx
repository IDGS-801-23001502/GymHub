import { useState, type FormEvent } from 'react';
import { sociosApi } from '../../api/servicios';
import { OBJETIVOS, type Objetivo, type SocioDetalle } from '../../api/tipos';
import { useAuth } from '../../auth/contexto';
import { Alerta, Campo, Modal } from '../../components/ui';
import { formatoFecha, hoyISO } from '../../utils/formato';
import { mensajesError } from '../../utils/useCarga';

export function DatosSocio({ socio, alActualizar }: { socio: SocioDetalle; alActualizar: () => void }) {
  const { usuario, puede } = useAuth();
  const [modal, setModal] = useState<'editar' | 'baja' | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const sede = usuario?.sedes.find((s) => s.id_sede === socio.id_sede)?.nombre ?? `Sede ${socio.id_sede}`;
  const editable = puede('recepcionista');

  const reactivar = async () => {
    setErrores([]);
    try {
      await sociosApi.reactivar(socio.id_socio);
      setMensaje('Socio reactivado.');
      alActualizar();
    } catch (err) {
      setErrores(mensajesError(err));
    }
  };

  return (
    <div className="espaciado">
      {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
      <Alerta mensajes={errores} />
      <div className="tarjeta">
        <div className="tarjeta-titulo">
          <h2>Información del socio</h2>
          {editable && (
            <div className="fila">
              <button className="btn btn-sm" onClick={() => setModal('editar')}>
                Editar
              </button>
              {socio.estado === 'activo' ? (
                <button className="btn btn-sm btn-peligro" onClick={() => setModal('baja')}>
                  Dar de baja
                </button>
              ) : (
                <button className="btn btn-sm" onClick={reactivar}>
                  Reactivar
                </button>
              )}
            </div>
          )}
        </div>
        <dl className="datos tarjeta-cuerpo">
          <div className="dato"><dt>Folio</dt><dd className="mono">{socio.folio}</dd></div>
          <div className="dato"><dt>Sede</dt><dd>{sede}</dd></div>
          <div className="dato"><dt>Fecha de nacimiento</dt><dd>{formatoFecha(socio.fecha_nacimiento)}</dd></div>
          <div className="dato"><dt>Objetivo</dt><dd>{socio.objetivo ? OBJETIVOS[socio.objetivo] : '—'}</dd></div>
          <div className="dato"><dt>Teléfono</dt><dd>{socio.telefono}</dd></div>
          <div className="dato"><dt>Correo</dt><dd>{socio.correo}</dd></div>
          <div className="dato">
            <dt>Contacto de emergencia</dt>
            <dd>
              {socio.contacto_emergencia.nombre} ({socio.contacto_emergencia.parentesco})
              <div className="muted">{socio.contacto_emergencia.telefono}</div>
            </dd>
          </div>
          <div className="dato"><dt>Alta</dt><dd>{formatoFecha(socio.fecha_alta)}</dd></div>
        </dl>
        <p className="muted pequeno tarjeta-cuerpo" style={{ paddingTop: 0 }}>
          Los datos de contacto se guardan cifrados. Cada consulta de este expediente queda en la bitácora.
        </p>
      </div>

      {modal === 'editar' && (
        <EditarSocioModal
          socio={socio}
          alCerrar={() => setModal(null)}
          alGuardar={() => {
            setModal(null);
            setMensaje('Datos actualizados.');
            alActualizar();
          }}
        />
      )}
      {modal === 'baja' && (
        <BajaModal
          socio={socio}
          alCerrar={() => setModal(null)}
          alGuardar={() => {
            setModal(null);
            setMensaje('Socio dado de baja. Su historial se conserva.');
            alActualizar();
          }}
        />
      )}
    </div>
  );
}

function EditarSocioModal({
  socio,
  alCerrar,
  alGuardar,
}: {
  socio: SocioDetalle;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const { usuario } = useAuth();
  const [f, setF] = useState({
    nombre: socio.nombre,
    fecha_nacimiento: socio.fecha_nacimiento,
    telefono: socio.telefono,
    correo: socio.correo,
    objetivo: (socio.objetivo ?? '') as Objetivo | '',
    foto_url: socio.foto_url ?? '',
    id_sede: String(socio.id_sede),
    ce_nombre: socio.contacto_emergencia.nombre,
    ce_parentesco: socio.contacto_emergencia.parentesco,
    ce_telefono: socio.contacto_emergencia.telefono,
  });
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    setEnviando(true);
    setErrores([]);
    // Solo se envían los campos modificados
    const cambios: Parameters<typeof sociosApi.actualizar>[1] = {};
    if (f.nombre.trim() !== socio.nombre) cambios.nombre = f.nombre.trim();
    if (f.fecha_nacimiento !== socio.fecha_nacimiento) cambios.fecha_nacimiento = f.fecha_nacimiento;
    if (f.telefono.trim() !== socio.telefono) cambios.telefono = f.telefono.trim();
    if (f.correo.trim().toLowerCase() !== socio.correo) cambios.correo = f.correo.trim();
    if (f.objetivo && f.objetivo !== socio.objetivo) cambios.objetivo = f.objetivo;
    if (f.foto_url.trim() && f.foto_url.trim() !== (socio.foto_url ?? '')) cambios.foto_url = f.foto_url.trim();
    if (Number(f.id_sede) !== socio.id_sede) cambios.id_sede = Number(f.id_sede);
    const ce = { nombre: f.ce_nombre.trim(), parentesco: f.ce_parentesco.trim(), telefono: f.ce_telefono.trim() };
    if (JSON.stringify(ce) !== JSON.stringify(socio.contacto_emergencia)) cambios.contacto_emergencia = ce;

    if (Object.keys(cambios).length === 0) {
      alCerrar();
      return;
    }
    try {
      await sociosApi.actualizar(socio.id_socio, cambios);
      alGuardar();
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo="Editar socio"
      alCerrar={alCerrar}
      ancho
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={() => guardar()} disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <form onSubmit={guardar} className="espaciado">
        <Alerta mensajes={errores} />
        <div className="rejilla rejilla-2">
          <Campo etiqueta="Nombre">{(p) => <input {...p} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />}</Campo>
          <Campo etiqueta="Fecha de nacimiento">
            {(p) => <input {...p} type="date" max={hoyISO()} value={f.fecha_nacimiento} onChange={(e) => set('fecha_nacimiento', e.target.value)} />}
          </Campo>
          <Campo etiqueta="Teléfono">{(p) => <input {...p} type="tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} />}</Campo>
          <Campo etiqueta="Correo">{(p) => <input {...p} type="email" value={f.correo} onChange={(e) => set('correo', e.target.value)} />}</Campo>
          <Campo etiqueta="Sede">
            {(p) => (
              <select {...p} value={f.id_sede} onChange={(e) => set('id_sede', e.target.value)}>
                {!usuario?.sedes.some((s) => s.id_sede === socio.id_sede) && <option value={socio.id_sede}>Sede {socio.id_sede}</option>}
                {usuario?.sedes.map((s) => <option key={s.id_sede} value={s.id_sede}>{s.nombre}</option>)}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Objetivo">
            {(p) => (
              <select {...p} value={f.objetivo} onChange={(e) => set('objetivo', e.target.value)}>
                <option value="" disabled>Sin especificar</option>
                {Object.entries(OBJETIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
          </Campo>
          <Campo etiqueta="URL de fotografía">{(p) => <input {...p} type="url" value={f.foto_url} onChange={(e) => set('foto_url', e.target.value)} />}</Campo>
        </div>
        <h3>Contacto de emergencia</h3>
        <div className="rejilla rejilla-3">
          <Campo etiqueta="Nombre">{(p) => <input {...p} value={f.ce_nombre} onChange={(e) => set('ce_nombre', e.target.value)} />}</Campo>
          <Campo etiqueta="Parentesco">{(p) => <input {...p} value={f.ce_parentesco} onChange={(e) => set('ce_parentesco', e.target.value)} />}</Campo>
          <Campo etiqueta="Teléfono">{(p) => <input {...p} type="tel" value={f.ce_telefono} onChange={(e) => set('ce_telefono', e.target.value)} />}</Campo>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function BajaModal({ socio, alCerrar, alGuardar }: { socio: SocioDetalle; alCerrar: () => void; alGuardar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    setEnviando(true);
    setErrores([]);
    try {
      await sociosApi.baja(socio.id_socio, motivo.trim());
      alGuardar();
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Dar de baja a ${socio.nombre}`}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-peligro" onClick={confirmar} disabled={enviando || !motivo.trim()}>
            {enviando ? 'Procesando…' : 'Confirmar baja'}
          </button>
        </>
      }
    >
      <p className="muted">Es una baja lógica: el historial de membresías y pagos se conserva y el socio puede reactivarse.</p>
      <Alerta mensajes={errores} />
      <Campo etiqueta="Motivo de la baja">
        {(p) => <textarea {...p} value={motivo} maxLength={255} onChange={(e) => setMotivo(e.target.value)} />}
      </Campo>
    </Modal>
  );
}
