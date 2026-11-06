import { useState } from 'react';
import { ApiError } from '../../api/cliente';
import { aBloquesEntrada, ejerciciosApi, plantillasApi, rutinasApi } from '../../api/servicios';
import {
  NIVELES,
  OBJETIVOS,
  RESTRICCIONES,
  type Bloque,
  type Conflicto,
  type Ejercicio,
  type RutinasSocio,
  type SocioDetalle as Socio,
  type Sugerencia,
} from '../../api/tipos';
import { useAuth } from '../../auth/contexto';
import { EditorBloques, VistaBloques } from '../../components/Bloques';
import { validarBloques } from '../../utils/bloques';
import { Alerta, Campo, Cargando, Modal } from '../../components/ui';
import { formatoFecha, formatoFechaHora, hoyISO, sumarDias } from '../../utils/formato';
import { mensajesError, useCarga } from '../../utils/useCarga';

const ESTADOS = {
  vigente: { texto: 'Vigente', clase: 'badge-ok' },
  reemplazada: { texto: 'Reemplazada', clase: 'badge-neutro' },
  finalizada: { texto: 'Finalizada', clase: 'badge-neutro' },
} as const;

/** Conflictos que devuelve la API en un 409 al asignar o ajustar. */
function conflictosDe(err: unknown): Conflicto[] {
  if (!(err instanceof ApiError) || err.estado !== 409) return [];
  const c = (err.cuerpo as { conflictos?: Conflicto[] } | undefined)?.conflictos;
  return Array.isArray(c) ? c : [];
}

/** Rutina del socio: vigente, historial, versiones y seguimiento (CRM-RF-08 a CRM-RF-10). */
export function RutinaTab({ socio }: { socio: Socio }) {
  const { puede } = useAuth();
  const esEntrenador = puede('entrenador');
  const [vista, setVista] = useState<'rutina' | 'seguimiento'>('rutina');

  return (
    <div className="espaciado">
      <div className="chips" role="group" aria-label="Sección">
        <button className="chip" aria-pressed={vista === 'rutina'} onClick={() => setVista('rutina')}>Rutina</button>
        <button className="chip" aria-pressed={vista === 'seguimiento'} onClick={() => setVista('seguimiento')}>Seguimiento</button>
      </div>
      {vista === 'rutina' ? <Rutina socio={socio} editable={esEntrenador} /> : <SeguimientoVista idSocio={socio.id_socio} />}
    </div>
  );
}

function Rutina({ socio, editable }: { socio: Socio; editable: boolean }) {
  const { datos, error, cargando, recargar } = useCarga(() => rutinasApi.deSocio(socio.id_socio), `rutinas-${socio.id_socio}`);
  const [modal, setModal] = useState<'asignar' | 'ajustar' | 'finalizar' | { versiones: number } | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <Alerta mensajes={error.detalles} />;
  const { vigente, historial } = datos as RutinasSocio;
  const listo = (texto: string) => {
    setModal(null);
    setMensaje(texto);
    recargar();
  };

  return (
    <>
      {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
      <div className="tarjeta tarjeta-cuerpo espaciado">
        <div className="fila justify-between">
          <h2>Rutina vigente</h2>
          {editable && socio.estado === 'activo' && (
            <div className="fila">
              {vigente && <button className="btn" onClick={() => setModal('ajustar')}>Ajustar rutina</button>}
              {vigente && <button className="btn btn-peligro" onClick={() => setModal('finalizar')}>Finalizar</button>}
              <button className="btn btn-primario" onClick={() => setModal('asignar')}>
                {vigente ? 'Asignar otra rutina' : 'Asignar rutina'}
              </button>
            </div>
          )}
        </div>
        {!vigente ? (
          <p className="muted">El socio no tiene una rutina vigente.</p>
        ) : (
          <>
            <dl className="rejilla rejilla-3">
              <div className="dato"><dt>Plantilla base</dt><dd>{vigente.plantilla.nombre ?? '—'}</dd></div>
              <div className="dato"><dt>Sesiones por semana</dt><dd>{vigente.sesiones_planeadas_semana}</dd></div>
              <div className="dato"><dt>Desde</dt><dd>{formatoFecha(vigente.fecha_inicio)}</dd></div>
              <div className="dato"><dt>Entrenador</dt><dd>{vigente.entrenador.nombre}</dd></div>
              <div className="dato">
                <dt>Versión</dt>
                <dd>
                  {vigente.version_actual.numero_version}{' '}
                  {vigente.total_versiones > 1 && (
                    <button className="btn btn-sm btn-texto" onClick={() => setModal({ versiones: vigente.id_rutina })}>
                      ver historial
                    </button>
                  )}
                </dd>
              </div>
              <div className="dato"><dt>Último cambio</dt><dd>{vigente.version_actual.motivo ?? '—'}</dd></div>
            </dl>
            <VistaBloques bloques={vigente.bloques} />
          </>
        )}
      </div>

      {historial.filter((r) => r.estado !== 'vigente').length > 0 && (
        <div className="tarjeta">
          <div className="tarjeta-cuerpo"><h2>Rutinas anteriores</h2></div>
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr><th>Plantilla</th><th>Periodo</th><th>Entrenador</th><th>Estado</th><th className="num">Versiones</th></tr>
              </thead>
              <tbody>
                {historial.filter((r) => r.estado !== 'vigente').map((r) => (
                  <tr key={r.id_rutina}>
                    <td>{r.plantilla.nombre ?? '—'}</td>
                    <td>{formatoFecha(r.fecha_inicio)} – {formatoFecha(r.fecha_fin)}</td>
                    <td>{r.entrenador.nombre}</td>
                    <td><span className={`badge ${ESTADOS[r.estado].clase}`}>{ESTADOS[r.estado].texto}</span></td>
                    <td className="num">
                      <button className="btn btn-sm" onClick={() => setModal({ versiones: r.id_rutina })}>{r.total_versiones}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal === 'asignar' && (
        <AsignarModal socio={socio} reemplaza={!!vigente} alCerrar={() => setModal(null)} alGuardar={() => listo('Rutina asignada.')} />
      )}
      {modal === 'ajustar' && vigente && (
        <AjustarModal
          idSocio={socio.id_socio}
          idRutina={vigente.id_rutina}
          bloques={vigente.bloques}
          alCerrar={() => setModal(null)}
          alGuardar={(n) => listo(`Se guardó la versión ${n} de la rutina.`)}
        />
      )}
      {modal === 'finalizar' && vigente && (
        <FinalizarModal idRutina={vigente.id_rutina} alCerrar={() => setModal(null)} alGuardar={() => listo('Rutina finalizada.')} />
      )}
      {modal && typeof modal === 'object' && <VersionesModal idRutina={modal.versiones} alCerrar={() => setModal(null)} />}
    </>
  );
}

function ListaConflictos({ conflictos }: { conflictos: Conflicto[] }) {
  return (
    <ul>
      {conflictos.map((c) => (
        <li key={c.id_ejercicio}>
          <strong>{c.ejercicio}</strong>: {c.restricciones.map((r) => RESTRICCIONES[r] ?? r).join(', ')}
        </li>
      ))}
    </ul>
  );
}

/** Asistente de asignación: plantilla sugerida → ajustes → confirmación. */
function AsignarModal({ socio, reemplaza, alCerrar, alGuardar }: { socio: Socio; reemplaza: boolean; alCerrar: () => void; alGuardar: () => void }) {
  const sugerencias = useCarga(() => rutinasApi.sugerencias(socio.id_socio), `sug-${socio.id_socio}`);
  const catalogo = useCarga(() => ejerciciosApi.listar({ incluir_inactivos: true }), 'catalogo');
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [elegida, setElegida] = useState<Sugerencia | null>(null);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [modificada, setModificada] = useState(false);
  const [sesiones, setSesiones] = useState('3');
  const [inicio, setInicio] = useState(hoyISO());
  const [motivo, setMotivo] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [conflictos, setConflictos] = useState<Conflicto[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const restricciones = sugerencias.datos?.restricciones ?? [];

  const elegir = async (s: Sugerencia) => {
    setErrores([]);
    try {
      const p = await plantillasApi.obtener(s.id);
      setElegida(s);
      setBloques(p.bloques);
      setModificada(false);
      setSesiones(String(p.dias_semana ?? 3));
      setPaso(2);
    } catch (err) {
      setErrores(mensajesError(err));
    }
  };

  const asignar = async () => {
    if (!elegida) return;
    const locales = validarBloques(bloques);
    setErrores(locales);
    if (locales.length) return;
    setEnviando(true);
    try {
      await rutinasApi.asignar(socio.id_socio, {
        id_plantilla: elegida.id,
        sesiones_planeadas_semana: Number(sesiones),
        fecha_inicio: inicio,
        ...(modificada && { bloques: aBloquesEntrada(bloques) }),
        ...(motivo.trim() && { motivo: motivo.trim() }),
        ...(confirmar && { confirmar_conflictos: true }),
      });
      alGuardar();
    } catch (err) {
      setConflictos(conflictosDe(err));
      setErrores(mensajesError(err));
      setEnviando(false);
    }
  };

  const cambiarBloques = (b: Bloque[]) => {
    setBloques(b);
    setModificada(true);
    setConflictos([]);
  };

  const pie =
    paso === 1 ? (
      <button className="btn" onClick={alCerrar}>Cancelar</button>
    ) : paso === 2 ? (
      <>
        <button className="btn" onClick={() => setPaso(1)}>Atrás</button>
        <button className="btn btn-primario" onClick={() => { const e = validarBloques(bloques); setErrores(e); if (!e.length) setPaso(3); }}>
          Continuar
        </button>
      </>
    ) : (
      <>
        <button className="btn" onClick={() => setPaso(2)}>Atrás</button>
        <button className="btn btn-primario" onClick={asignar} disabled={enviando || !inicio || (conflictos.length > 0 && !confirmar)}>
          {enviando ? 'Asignando…' : 'Asignar rutina'}
        </button>
      </>
    );

  return (
    <Modal titulo={`Asignar rutina · paso ${paso} de 3`} alCerrar={alCerrar} ancho pie={pie}>
      <div className="espaciado">
        <Alerta mensajes={errores} />
        {paso === 1 && (
          <>
            {sugerencias.error && <Alerta mensajes={sugerencias.error.detalles} />}
            {sugerencias.cargando && !sugerencias.datos ? (
              <Cargando />
            ) : (
              <>
                <p className="muted pequeno">
                  Objetivo del socio: <strong>{sugerencias.datos?.objetivo_socio ? OBJETIVOS[sugerencias.datos.objetivo_socio] : 'sin definir'}</strong>
                  {' · '}Restricciones:{' '}
                  <strong>{restricciones.length ? restricciones.map((r) => RESTRICCIONES[r] ?? r).join(', ') : 'ninguna'}</strong>
                </p>
                {sugerencias.datos?.plantillas.length === 0 && <p className="vacio">No hay plantillas activas.</p>}
                <div className="espaciado">
                  {sugerencias.datos?.plantillas.map((s) => (
                    <button key={s.id} type="button" className="bloque text-left cursor-pointer [font:inherit] text-inherit" onClick={() => elegir(s)}>
                      <div className="fila justify-between">
                        <strong>{s.nombre}</strong>
                        <div className="chips">
                          {s.coincide_objetivo && <span className="badge badge-info">Coincide con su objetivo</span>}
                          {s.compatible ? <span className="badge badge-ok">Compatible</span> : <span className="badge badge-error">{s.conflictos.length} contraindicado(s)</span>}
                        </div>
                      </div>
                      <span className="muted pequeno">
                        {OBJETIVOS[s.objetivo] ?? s.objetivo} · {NIVELES[s.nivel]} · {s.total_ejercicios} ejercicios
                        {s.dias_semana ? ` · ${s.dias_semana} días/semana` : ''}
                      </span>
                      {!s.compatible && <span className="pequeno">Revisar: {s.conflictos.map((c) => c.ejercicio).join(', ')}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {paso === 2 && (
          <>
            <p className="muted pequeno">
              Plantilla <strong>{elegida?.nombre}</strong>. Puedes ajustar los ejercicios para este socio; la plantilla original no cambia.
            </p>
            {catalogo.datos ? (
              <EditorBloques bloques={bloques} alCambiar={cambiarBloques} catalogo={catalogo.datos as Ejercicio[]} restricciones={restricciones} />
            ) : (
              <Cargando />
            )}
          </>
        )}

        {paso === 3 && (
          <>
            {reemplaza && <Alerta tipo="aviso">La rutina vigente quedará como reemplazada y se conservará en el historial.</Alerta>}
            <div className="rejilla rejilla-2">
              <Campo etiqueta="Sesiones planeadas por semana">
                {(p) => <input {...p} type="number" min={1} max={7} value={sesiones} onChange={(e) => setSesiones(e.target.value)} />}
              </Campo>
              <Campo etiqueta="Fecha de inicio">
                {(p) => <input {...p} type="date" min={hoyISO()} value={inicio} onChange={(e) => setInicio(e.target.value)} />}
              </Campo>
            </div>
            <Campo etiqueta="Nota (opcional)">
              {(p) => <input {...p} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={modificada ? 'Ej. sin saltos por lesión de tobillo' : ''} />}
            </Campo>
            <p className="pequeno">
              {elegida?.nombre} · {bloques.length} bloques · {bloques.reduce((n, b) => n + b.ejercicios.length, 0)} ejercicios
              {modificada ? ' · ajustada para el socio' : ''}
            </p>
            {conflictos.length > 0 && (
              <Alerta tipo="aviso">
                <div>
                  Estos ejercicios están contraindicados por la ficha de salud:
                  <ListaConflictos conflictos={conflictos} />
                  <label className="casilla">
                    <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} />
                    Revisé los ejercicios y quiero asignarlos de todos modos
                  </label>
                </div>
              </Alerta>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function AjustarModal({ idSocio, idRutina, bloques: iniciales, alCerrar, alGuardar }: { idSocio: number; idRutina: number; bloques: Bloque[]; alCerrar: () => void; alGuardar: (n: number) => void }) {
  const catalogo = useCarga(() => ejerciciosApi.listar({ incluir_inactivos: true }), 'catalogo');
  const sugerencias = useCarga(() => rutinasApi.sugerencias(idSocio), `sug-${idSocio}`);
  const [bloques, setBloques] = useState(iniciales);
  const [motivo, setMotivo] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [conflictos, setConflictos] = useState<Conflicto[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    const locales = [...(motivo.trim() ? [] : ['Indica el motivo del ajuste.']), ...validarBloques(bloques)];
    setErrores(locales);
    if (locales.length) return;
    setEnviando(true);
    try {
      const r = await rutinasApi.nuevaVersion(idRutina, {
        bloques: aBloquesEntrada(bloques),
        motivo: motivo.trim(),
        ...(confirmar && { confirmar_conflictos: true }),
      });
      alGuardar(r.numero_version);
    } catch (err) {
      setConflictos(conflictosDe(err));
      setErrores(mensajesError(err));
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo="Ajustar rutina"
      alCerrar={alCerrar}
      ancho
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={guardar} disabled={enviando || (conflictos.length > 0 && !confirmar)}>
            {enviando ? 'Guardando…' : 'Guardar nueva versión'}
          </button>
        </>
      }
    >
      <div className="espaciado">
        <p className="muted pequeno">Se crea una versión nueva; la anterior queda en el historial sin cambios.</p>
        <Alerta mensajes={errores} />
        <Campo etiqueta="Motivo del ajuste">
          {(p) => <input {...p} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. aumentar volumen de piernas" />}
        </Campo>
        {conflictos.length > 0 && (
          <Alerta tipo="aviso">
            <div>
              Ejercicios contraindicados por la ficha de salud:
              <ListaConflictos conflictos={conflictos} />
              <label className="casilla">
                <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} />
                Revisé los ejercicios y quiero guardarlos de todos modos
              </label>
            </div>
          </Alerta>
        )}
        {catalogo.datos ? (
          <EditorBloques
            bloques={bloques}
            alCambiar={(b) => { setBloques(b); setConflictos([]); }}
            catalogo={catalogo.datos}
            restricciones={sugerencias.datos?.restricciones ?? []}
          />
        ) : (
          <Cargando />
        )}
      </div>
    </Modal>
  );
}

function FinalizarModal({ idRutina, alCerrar, alGuardar }: { idRutina: number; alCerrar: () => void; alGuardar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      await rutinasApi.finalizar(idRutina, motivo.trim() || undefined);
      alGuardar();
    } catch (err) {
      setErrores(mensajesError(err));
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo="Finalizar rutina"
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-peligro" onClick={confirmar} disabled={enviando}>{enviando ? 'Finalizando…' : 'Finalizar'}</button>
        </>
      }
    >
      <Alerta mensajes={errores} />
      <p>El socio se quedará sin rutina vigente en la app hasta que se le asigne otra.</p>
      <Campo etiqueta="Motivo (opcional)">
        {(p) => <input {...p} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
      </Campo>
    </Modal>
  );
}

/** Historial de versiones con comparación lado a lado. */
function VersionesModal({ idRutina, alCerrar }: { idRutina: number; alCerrar: () => void }) {
  const versiones = useCarga(() => rutinasApi.versiones(idRutina), `versiones-${idRutina}`);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const lista = versiones.datos ?? [];
  const derecha = b ?? lista[0]?.numero_version ?? null;
  const izquierda = a ?? lista[1]?.numero_version ?? null;

  return (
    <Modal titulo="Versiones de la rutina" alCerrar={alCerrar} ancho pie={<button className="btn" onClick={alCerrar}>Cerrar</button>}>
      {versiones.error && <Alerta mensajes={versiones.error.detalles} />}
      {versiones.cargando && !versiones.datos ? (
        <Cargando />
      ) : (
        <div className="espaciado">
          <div className="tabla-envoltura">
            <table>
              <thead><tr><th className="num">Versión</th><th>Fecha</th><th>Autor</th><th>Motivo</th></tr></thead>
              <tbody>
                {lista.map((v) => (
                  <tr key={v.numero_version}>
                    <td className="num">{v.numero_version}</td>
                    <td>{formatoFechaHora(v.fecha)}</td>
                    <td>{v.autor.nombre}</td>
                    <td>{v.motivo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lista.length > 1 && izquierda !== null && derecha !== null && (
            <>
              <div className="fila">
                <span className="pequeno">Comparar</span>
                <select aria-label="Versión izquierda" value={izquierda} onChange={(e) => setA(Number(e.target.value))} className="w-auto">
                  {lista.map((v) => <option key={v.numero_version} value={v.numero_version}>Versión {v.numero_version}</option>)}
                </select>
                <span className="pequeno">con</span>
                <select aria-label="Versión derecha" value={derecha} onChange={(e) => setB(Number(e.target.value))} className="w-auto">
                  {lista.map((v) => <option key={v.numero_version} value={v.numero_version}>Versión {v.numero_version}</option>)}
                </select>
              </div>
              <Comparacion idRutina={idRutina} izquierda={izquierda} derecha={derecha} />
            </>
          )}
          {lista.length === 1 && <ContenidoVersion idRutina={idRutina} numero={lista[0]!.numero_version} />}
        </div>
      )}
    </Modal>
  );
}

function ContenidoVersion({ idRutina, numero, otros }: { idRutina: number; numero: number; otros?: Set<string> }) {
  const { datos, error } = useCarga(() => rutinasApi.version(idRutina, numero), `version-${idRutina}-${numero}`);
  if (error) return <Alerta mensajes={error.detalles} />;
  if (!datos) return <Cargando />;
  if (!otros) return <VistaBloques bloques={datos.bloques} />;
  return (
    <div className="espaciado">
      {datos.bloques.map((bl, i) => (
        <section key={i} className="bloque">
          <strong className="pequeno">{i + 1}. {bl.tipo}</strong>
          <ul className="pequeno m-0 list-disc pl-4.5">
            {bl.ejercicios.map((e, j) => {
              const firma = `${e.id_ejercicio}|${e.series}|${e.repeticiones}|${e.descanso_seg}`;
              return (
                <li key={j} className={otros.has(firma) ? '' : 'diff-nuevo'}>
                  {e.nombre} — {e.series}×{e.repeticiones}{e.descanso_seg ? `, ${e.descanso_seg} s` : ''}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Comparacion({ idRutina, izquierda, derecha }: { idRutina: number; izquierda: number; derecha: number }) {
  const ver = (n: number) => rutinasApi.version(idRutina, n);
  const { datos } = useCarga(() => Promise.all([ver(izquierda), ver(derecha)]), `cmp-${idRutina}-${izquierda}-${derecha}`);
  if (!datos) return <Cargando />;
  const firmas = (bs: Bloque[]) => new Set(bs.flatMap((b) => b.ejercicios.map((e) => `${e.id_ejercicio}|${e.series}|${e.repeticiones}|${e.descanso_seg}`)));
  return (
    <>
      <p className="muted pequeno">Resaltado: ejercicios nuevos o con series, repeticiones o descanso distintos respecto a la otra versión.</p>
      <div className="comparacion">
        <div><h3>Versión {izquierda}</h3><ContenidoVersion idRutina={idRutina} numero={izquierda} otros={firmas(datos[1].bloques)} /></div>
        <div><h3>Versión {derecha}</h3><ContenidoVersion idRutina={idRutina} numero={derecha} otros={firmas(datos[0].bloques)} /></div>
      </div>
    </>
  );
}

/** Sesiones registradas desde la app y adherencia (CRM-RF-10). */
function SeguimientoVista({ idSocio }: { idSocio: number }) {
  const [hasta, setHasta] = useState(hoyISO());
  const [desde, setDesde] = useState(sumarDias(hoyISO(), -29));
  const { datos, error, cargando } = useCarga(() => rutinasApi.seguimiento(idSocio, desde, hasta), `seg-${idSocio}-${desde}-${hasta}`);
  const r = datos?.resumen;

  return (
    <div className="espaciado">
      <div className="filtros">
        <div className="campo">
          <label htmlFor="seg-desde">Desde</label>
          <input id="seg-desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="seg-hasta">Hasta</label>
          <input id="seg-hasta" type="date" value={hasta} min={desde} max={hoyISO()} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="chips self-end">
          {[7, 30, 90].map((d) => (
            <button key={d} className="chip" onClick={() => { setHasta(hoyISO()); setDesde(sumarDias(hoyISO(), -(d - 1))); }}>
              {d} días
            </button>
          ))}
        </div>
      </div>
      {error && <Alerta mensajes={error.detalles} />}
      {cargando && !datos ? (
        <Cargando />
      ) : r ? (
        <>
          <div className="rejilla rejilla-3">
            <div className="tarjeta tarjeta-cuerpo indicador">
              <span className="muted pequeno">Adherencia</span>
              <span className="valor">{r.adherencia === null ? '—' : `${r.adherencia}%`}</span>
              {r.adherencia !== null && <div className="barra" aria-hidden><span style={{ width: `${r.adherencia}%` }} /></div>}
              <span className="muted pequeno">{r.sesiones_cumplidas} de {r.sesiones_planeadas} sesiones planeadas</span>
            </div>
            <div className="tarjeta tarjeta-cuerpo indicador">
              <span className="muted pequeno">Tiempo entrenado</span>
              <span className="valor">{Math.round(r.minutos_totales / 6) / 10} h</span>
              <span className="muted pequeno">{r.calorias_totales} kcal</span>
            </div>
            <div className="tarjeta tarjeta-cuerpo indicador">
              <span className="muted pequeno">Frecuencia cardiaca promedio</span>
              <span className="valor">{r.fc_promedio ?? '—'}{r.fc_promedio ? ' lpm' : ''}</span>
              <span className="muted pequeno">Datos del reloj o pulsera, si los hay</span>
            </div>
          </div>
          <div className="tarjeta">
            {datos.sesiones.length === 0 ? (
              <div className="vacio">Sin sesiones registradas en el periodo.</div>
            ) : (
              <div className="tabla-envoltura">
                <table>
                  <thead>
                    <tr><th>Fecha</th><th className="num">Duración</th><th>Estado</th><th className="num">FC prom./máx.</th><th className="num">kcal</th><th>Ejercicios</th></tr>
                  </thead>
                  <tbody className={cargando ? 'opacity-60' : undefined}>
                    {datos.sesiones.map((s) => (
                      <tr key={s.id_sesion}>
                        <td>{formatoFechaHora(s.fecha_inicio)}{s.numero_version ? <div className="muted pequeno">versión {s.numero_version}</div> : null}</td>
                        <td className="num">{s.duracion_min ? `${s.duracion_min} min` : '—'}</td>
                        <td>{s.completada ? <span className="badge badge-ok">Completada</span> : <span className="badge badge-aviso">Incompleta</span>}</td>
                        <td className="num">{s.fc_promedio ?? '—'} / {s.fc_maxima ?? '—'}</td>
                        <td className="num">{s.calorias ?? '—'}</td>
                        <td className="pequeno">{s.detalle?.ejercicios?.map((e) => e.nombre).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
