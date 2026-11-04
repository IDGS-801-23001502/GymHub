import { useState, type FormEvent } from 'react';
import { planesApi } from '../api/servicios';
import type { Plan, TipoPlan } from '../api/tipos';
import { useAuth } from '../auth/contexto';
import { IconoMas } from '../components/iconos';
import { Alerta, Campo, Cargando, Modal } from '../components/ui';
import { formatoMoneda } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

const TIPOS: Record<TipoPlan, { texto: string; dias: number }> = {
  mensual: { texto: 'Mensual', dias: 30 },
  trimestral: { texto: 'Trimestral', dias: 90 },
  anual: { texto: 'Anual', dias: 365 },
};

/** Catálogo de planes (CRM-RF-02). Solo el administrador crea, edita o desactiva. */
export function PlanesPage() {
  const { puede } = useAuth();
  const admin = puede();
  const [inactivos, setInactivos] = useState(false);
  const [editando, setEditando] = useState<Plan | 'nuevo' | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const { datos, error, cargando, recargar } = useCarga(
    () => planesApi.listar(admin && inactivos),
    `planes-${admin && inactivos}`,
  );

  const alternar = async (p: Plan) => {
    setErrores([]);
    try {
      await planesApi.cambiarEstado(p.id_plan, !p.activo);
      setMensaje(`Plan “${p.nombre}” ${p.activo ? 'desactivado' : 'activado'}.`);
      recargar();
    } catch (err) {
      setErrores(mensajesError(err));
    }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Planes de membresía</h1>
          <p>
            {admin
              ? 'Desactivar un plan impide asignarlo, pero las membresías existentes no cambian.'
              : 'Planes disponibles para asignar a los socios.'}
          </p>
        </div>
        {admin && (
          <div className="fila">
            <label className="casilla">
              <input type="checkbox" checked={inactivos} onChange={(e) => setInactivos(e.target.checked)} />
              Mostrar inactivos
            </label>
            <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>
              <IconoMas /> Nuevo plan
            </button>
          </div>
        )}
      </div>

      <div className="espaciado">
        {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
        <Alerta mensajes={errores} />
        {error && <Alerta mensajes={error.detalles} />}
        {cargando && !datos ? (
          <Cargando />
        ) : datos?.length === 0 ? (
          <div className="tarjeta vacio">No hay planes registrados.</div>
        ) : (
          <div className="rejilla rejilla-3">
            {datos?.map((p) => (
              <article key={p.id_plan} className="tarjeta tarjeta-cuerpo espaciado" style={{ opacity: p.activo ? 1 : 0.65 }}>
                <div className="fila" style={{ justifyContent: 'space-between' }}>
                  <h2>{p.nombre}</h2>
                  {p.activo ? <span className="badge badge-ok">Activo</span> : <span className="badge badge-neutro">Inactivo</span>}
                </div>
                <div>
                  <div className="dias-grande">{formatoMoneda(p.precio)}</div>
                  <div className="muted pequeno">
                    {TIPOS[p.tipo].texto} · {p.duracion_dias} días
                  </div>
                </div>
                {p.beneficios && <p className="pequeno" style={{ whiteSpace: 'pre-line' }}>{p.beneficios}</p>}
                {admin && (
                  <div className="fila" style={{ marginTop: 'auto' }}>
                    <button className="btn btn-sm" onClick={() => setEditando(p)}>Editar</button>
                    <button className={`btn btn-sm${p.activo ? ' btn-peligro' : ''}`} onClick={() => alternar(p)}>
                      {p.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {editando && (
        <PlanModal
          plan={editando === 'nuevo' ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={(p) => {
            setEditando(null);
            setMensaje(`Plan “${p.nombre}” guardado.`);
            recargar();
          }}
        />
      )}
    </>
  );
}

function PlanModal({ plan, alCerrar, alGuardar }: { plan: Plan | null; alCerrar: () => void; alGuardar: (p: Plan) => void }) {
  const [nombre, setNombre] = useState(plan?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoPlan>(plan?.tipo ?? 'mensual');
  const [precio, setPrecio] = useState(plan ? String(plan.precio) : '');
  const [duracion, setDuracion] = useState(plan ? String(plan.duracion_dias) : '');
  const [beneficios, setBeneficios] = useState(plan?.beneficios ?? '');
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    setEnviando(true);
    setErrores([]);
    const datos = {
      nombre: nombre.trim(),
      tipo,
      precio: Number(precio),
      duracion_dias: duracion ? Number(duracion) : TIPOS[tipo].dias,
      beneficios: beneficios.trim() || undefined,
    };
    try {
      alGuardar(plan ? await planesApi.actualizar(plan.id_plan, datos) : await planesApi.crear(datos));
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={plan ? `Editar ${plan.nombre}` : 'Nuevo plan'}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={() => guardar()} disabled={enviando || !nombre.trim() || precio === ''}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form className="espaciado" onSubmit={guardar}>
        {plan && <Alerta tipo="info">Los cambios aplican a nuevas asignaciones; las membresías vendidas conservan sus fechas.</Alerta>}
        <Alerta mensajes={errores} />
        <Campo etiqueta="Nombre">{(p) => <input {...p} maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />}</Campo>
        <div className="rejilla rejilla-3">
          <Campo etiqueta="Tipo">
            {(p) => (
              <select {...p} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPlan)}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Precio (MXN)">
            {(p) => <input {...p} type="number" min="0" step="0.01" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />}
          </Campo>
          <Campo etiqueta="Duración (días)" ayuda={`Por defecto ${TIPOS[tipo].dias}`}>
            {(p) => <input {...p} type="number" min="1" step="1" placeholder={String(TIPOS[tipo].dias)} value={duracion} onChange={(e) => setDuracion(e.target.value)} />}
          </Campo>
        </div>
        <Campo etiqueta="Beneficios">
          {(p) => <textarea {...p} maxLength={4000} value={beneficios} onChange={(e) => setBeneficios(e.target.value)} />}
        </Campo>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
