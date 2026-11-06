import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/cliente';
import { fichaApi, type EntradaFicha } from '../../api/servicios';
import { RESTRICCIONES, type FichaSalud, type NivelActividad } from '../../api/tipos';
import { useAuth } from '../../auth/contexto';
import { Alerta, Campo, Cargando, Modal } from '../../components/ui';
import { formatoFechaHora } from '../../utils/formato';
import { mensajesError, useCarga } from '../../utils/useCarga';

const NIVELES: Record<NivelActividad, string> = {
  sedentario: 'Sedentario',
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
};

/** Ficha de salud versionada (CRM-RF-05). Consultarla es solo para entrenadores y administradores. */
export function FichaSaludTab({ idSocio }: { idSocio: number }) {
  const { puede } = useAuth();
  const consultar = puede('entrenador');
  const [editando, setEditando] = useState(false);
  const [verVersion, setVerVersion] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const ficha = useCarga<FichaSalud | null>(
    () =>
      consultar
        ? fichaApi.actual(idSocio).catch((e: unknown) => {
            if (e instanceof ApiError && e.estado === 404) return null;
            throw e;
          })
        : Promise.resolve(null),
    `ficha-${idSocio}`,
  );
  const versiones = useCarga(
    () => (consultar ? fichaApi.versiones(idSocio) : Promise.resolve([])),
    `versiones-${idSocio}-${ficha.datos?.version ?? 0}`,
  );

  if (ficha.cargando && ficha.datos === null && !ficha.error) return <Cargando />;
  if (ficha.error) return <Alerta mensajes={ficha.error.detalles} />;

  const f = ficha.datos;

  // Recepción puede capturar la ficha en el alta, pero no consultarla
  if (!consultar) {
    return (
      <div className="espaciado">
        {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
        <Alerta tipo="info">
          Puedes capturar la ficha de salud del socio, pero solo entrenadores y administradores pueden consultarla. Cada
          guardado crea una versión nueva.
        </Alerta>
        <FormularioFicha
          idSocio={idSocio}
          actual={null}
          alGuardar={(v) => setMensaje(`Ficha guardada (versión ${v}).`)}
        />
      </div>
    );
  }

  return (
    <div className="espaciado">
      {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
      {editando || !f ? (
        <div className="tarjeta tarjeta-cuerpo espaciado">
          <h2>{f ? `Nueva versión (actual: v${f.version})` : 'Capturar ficha de salud'}</h2>
          <FormularioFicha
            idSocio={idSocio}
            actual={f}
            alCancelar={f ? () => setEditando(false) : undefined}
            alGuardar={(v) => {
              setEditando(false);
              setMensaje(`Ficha guardada (versión ${v}).`);
              ficha.recargar();
            }}
          />
        </div>
      ) : (
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <div>
              <h2>Ficha de salud · v{f.version}</h2>
              <p className="muted pequeno">
                {formatoFechaHora(f.creado_en)} · {f.actualizado_por.nombre ?? 'App del socio'} · origen {f.origen}
                {f.borrador && ' · borrador'}
              </p>
            </div>
            <button className="btn btn-sm" onClick={() => setEditando(true)}>
              Actualizar
            </button>
          </div>
          <div className="tarjeta-cuerpo">
            <VistaFicha ficha={f} />
          </div>
        </div>
      )}

      {versiones.datos && versiones.datos.length > 1 && (
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>Historial de versiones</h2>
          </div>
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Fecha</th>
                  <th>Registró</th>
                  <th>Origen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {versiones.datos.map((v) => (
                  <tr key={v.id_ficha}>
                    <td>
                      v{v.version}
                      {v.borrador && <span className="badge badge-aviso ml-2">Borrador</span>}
                    </td>
                    <td>{formatoFechaHora(v.creado_en)}</td>
                    <td>{v.actualizado_por?.nombre ?? 'App del socio'}</td>
                    <td>{v.origen.toUpperCase()}</td>
                    <td className="num">
                      <button className="btn btn-sm" onClick={() => setVerVersion(v.version)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {verVersion !== null && (
        <VersionModal idSocio={idSocio} version={verVersion} alCerrar={() => setVerVersion(null)} />
      )}
    </div>
  );
}

function VistaFicha({ ficha }: { ficha: FichaSalud }) {
  const texto = (v: string | null) => v || <span className="muted">—</span>;
  return (
    <dl className="datos">
      <div className="dato"><dt>Antecedentes</dt><dd>{texto(ficha.antecedentes)}</dd></div>
      <div className="dato"><dt>Lesiones</dt><dd>{texto(ficha.lesiones)}</dd></div>
      <div className="dato"><dt>Alergias</dt><dd>{texto(ficha.alergias)}</dd></div>
      <div className="dato"><dt>Medicamentos</dt><dd>{texto(ficha.medicamentos)}</dd></div>
      <div className="dato"><dt>Nivel de actividad</dt><dd>{ficha.nivel_actividad ? NIVELES[ficha.nivel_actividad] : '—'}</dd></div>
      <div className="dato"><dt>Objetivo</dt><dd>{texto(ficha.objetivo)}</dd></div>
      <div className="dato">
        <dt>Restricciones para rutinas</dt>
        <dd className="fila">
          {ficha.restricciones_rutina.length === 0
            ? '—'
            : ficha.restricciones_rutina.map((r) => (
                <span key={r} className="badge badge-aviso">{RESTRICCIONES[r] ?? r.replace(/_/g, ' ')}</span>
              ))}
        </dd>
      </div>
    </dl>
  );
}

function VersionModal({ idSocio, version, alCerrar }: { idSocio: number; version: number; alCerrar: () => void }) {
  const { datos, error, cargando } = useCarga(() => fichaApi.version(idSocio, version), `v-${idSocio}-${version}`);
  return (
    <Modal titulo={`Ficha de salud · v${version}`} alCerrar={alCerrar} ancho>
      {cargando && <Cargando />}
      {error && <Alerta mensajes={error.detalles} />}
      {datos && (
        <>
          <p className="muted pequeno">
            {formatoFechaHora(datos.creado_en)} · {datos.actualizado_por.nombre ?? 'App del socio'}
          </p>
          <VistaFicha ficha={datos} />
        </>
      )}
    </Modal>
  );
}

/** Convierte "sin saltos, rodilla izquierda" en etiquetas sin_saltos, rodilla_izquierda. */
function aEtiquetas(texto: string): string[] {
  return texto
    .split(',')
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40),
    )
    .filter(Boolean);
}

function FormularioFicha({
  idSocio,
  actual,
  alGuardar,
  alCancelar,
}: {
  idSocio: number;
  actual: FichaSalud | null;
  alGuardar: (version: number) => void;
  alCancelar?: () => void;
}) {
  const [f, setF] = useState({
    antecedentes: actual?.antecedentes ?? '',
    lesiones: actual?.lesiones ?? '',
    alergias: actual?.alergias ?? '',
    medicamentos: actual?.medicamentos ?? '',
    nivel_actividad: (actual?.nivel_actividad ?? '') as NivelActividad | '',
    objetivo: actual?.objetivo ?? '',
    restricciones: (actual?.restricciones_rutina ?? []).filter((r) => !(r in RESTRICCIONES)).map((r) => r.replace(/_/g, ' ')).join(', '),
  });
  const [estandar, setEstandar] = useState<string[]>((actual?.restricciones_rutina ?? []).filter((r) => r in RESTRICCIONES));
  const alternar = (r: string) => setEstandar((l) => (l.includes(r) ? l.filter((x) => x !== r) : [...l, r]));
  const [consiente, setConsiente] = useState(false);
  const [borrador, setBorrador] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErrores([]);
    const datos: EntradaFicha = {
      antecedentes: f.antecedentes.trim() || undefined,
      lesiones: f.lesiones.trim() || undefined,
      alergias: f.alergias.trim() || undefined,
      medicamentos: f.medicamentos.trim() || undefined,
      nivel_actividad: f.nivel_actividad || undefined,
      objetivo: f.objetivo.trim() || undefined,
      restricciones_rutina: [...new Set([...estandar, ...aEtiquetas(f.restricciones)])],
      borrador,
      ...(consiente && { acepta_tratamiento_datos_salud: true }),
    };
    try {
      const r = await fichaApi.guardar(idSocio, datos);
      alGuardar(r.version);
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  const area = (k: 'antecedentes' | 'lesiones' | 'alergias' | 'medicamentos', etiqueta: string) => (
    <Campo etiqueta={etiqueta}>
      {(p) => <textarea {...p} maxLength={2000} value={f[k]} onChange={(e) => set(k, e.target.value)} />}
    </Campo>
  );

  return (
    <form className="espaciado" onSubmit={guardar}>
      <Alerta mensajes={errores} />
      <div className="rejilla rejilla-2">
        {area('antecedentes', 'Antecedentes médicos')}
        {area('lesiones', 'Lesiones')}
        {area('alergias', 'Alergias')}
        {area('medicamentos', 'Medicamentos')}
        <Campo etiqueta="Nivel de actividad">
          {(p) => (
            <select {...p} value={f.nivel_actividad} onChange={(e) => set('nivel_actividad', e.target.value)}>
              <option value="">Sin especificar</option>
              {Object.entries(NIVELES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Objetivo">
          {(p) => <input {...p} maxLength={100} value={f.objetivo} onChange={(e) => set('objetivo', e.target.value)} />}
        </Campo>
      </div>
      <div className="campo">
        <span className="pequeno font-semibold">Restricciones para rutinas</span>
        <div className="chips" role="group" aria-label="Restricciones para rutinas">
          {Object.entries(RESTRICCIONES).map(([k, v]) => (
            <button type="button" key={k} className="chip" aria-pressed={estandar.includes(k)} onClick={() => alternar(k)}>{v}</button>
          ))}
        </div>
        <span className="ayuda">Al asignar rutinas se marcan los ejercicios contraindicados por estas restricciones.</span>
      </div>
      <Campo etiqueta="Otras restricciones (opcional)" ayuda="Separadas por coma. Solo se cruzan con ejercicios que tengan la misma etiqueta.">
        {(p) => <input {...p} value={f.restricciones} onChange={(e) => set('restricciones', e.target.value)} />}
      </Campo>
      {!actual && (
        <label className="casilla">
          <input type="checkbox" checked={consiente} onChange={(e) => setConsiente(e.target.checked)} />
          El socio otorga su consentimiento expreso para el tratamiento de sus datos de salud (requerido la primera vez).
        </label>
      )}
      <label className="casilla">
        <input type="checkbox" checked={borrador} onChange={(e) => setBorrador(e.target.checked)} />
        Guardar como borrador (pendiente de revisión)
      </label>
      <div className="fila justify-end">
        {alCancelar && <button type="button" className="btn" onClick={alCancelar}>Cancelar</button>}
        <button type="submit" className="btn btn-primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar ficha'}
        </button>
      </div>
    </form>
  );
}
