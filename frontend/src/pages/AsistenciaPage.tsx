import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { urlArchivo } from '../api/cliente';
import { asistenciaApi, type ResultadoEntrada, type SocioEncontrado } from '../api/crm';
import { useAuth } from '../auth/contexto';
import { Kpi } from '../components/Graficas';
import { IconoAsistencia, IconoCamara, IconoRiesgo } from '../components/iconos';
import { Alerta, Avatar, Cargando, EstadoMembresiaBadge } from '../components/ui';
import { formatoFecha, formatoFechaHora } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

/** BarcodeDetector existe en Chrome/Edge; en otros navegadores se usa el lector USB o la búsqueda. */
interface Detector {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opciones: { formats: string[] }) => Detector;
  }
}

const ES_CODIGO = /^(GYMHUB:)?GH\d{6,}$/i;
const CLAVE_SEDE = 'gymhub.sede-recepcion';

/** Registro de entradas en recepción (CRM-RF-11). */
export function AsistenciaPage() {
  const { usuario } = useAuth();
  const sedes = usuario?.sedes ?? [];
  const [idSede, setIdSede] = useState<number>(() => {
    try {
      const guardada = Number(localStorage.getItem(CLAVE_SEDE));
      if (sedes.some((s) => s.id_sede === guardada)) return guardada;
    } catch {
      /* sin almacenamiento */
    }
    return sedes[0]?.id_sede ?? 0;
  });
  const [texto, setTexto] = useState('');
  const [encontrados, setEncontrados] = useState<{ q: string; lista: SocioEncontrado[] }>({ q: '', lista: [] });
  const consulta = texto.trim();
  const buscable = consulta.length >= 2 && !ES_CODIGO.test(consulta);
  const resultados = buscable && encontrados.q === consulta ? encontrados.lista : null;
  const buscando = buscable && encontrados.q !== consulta;
  const [veredicto, setVeredicto] = useState<ResultadoEntrada | null>(null);
  const [error, setError] = useState<string[]>([]);
  const [registrando, setRegistrando] = useState(false);
  const [camara, setCamara] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const dia = useCarga(() => asistenciaApi.delDia({ id_sede: idSede || undefined }), `dia-${idSede}`);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_SEDE, String(idSede));
    } catch {
      /* sin almacenamiento */
    }
  }, [idSede]);

  // Búsqueda mientras se escribe (no para códigos: esos se registran con Enter)
  useEffect(() => {
    if (!buscable) return;
    let vigente = true;
    const t = window.setTimeout(() => {
      asistenciaApi
        .buscar(consulta)
        .then((lista) => vigente && setEncontrados({ q: consulta, lista }))
        .catch((e: unknown) => {
          if (!vigente) return;
          setError(mensajesError(e));
          setEncontrados({ q: consulta, lista: [] });
        });
    }, 250);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [consulta, buscable]);

  async function registrar(datos: { id_socio?: number; codigo?: string }) {
    if (!idSede) return setError(['Selecciona la sede de recepción.']);
    setRegistrando(true);
    setError([]);
    try {
      const r = await asistenciaApi.registrar({ id_sede: idSede, ...datos });
      setVeredicto(r);
      setTexto('');
      dia.recargar();
    } catch (e) {
      setVeredicto(null);
      setError(mensajesError(e));
    } finally {
      setRegistrando(false);
      entrada.current?.focus();
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const q = texto.trim();
    // El lector USB "teclea" el contenido del QR y un Enter
    if (ES_CODIGO.test(q)) void registrar({ codigo: q });
    else if (resultados?.length === 1) void registrar({ id_socio: resultados[0].id_socio });
  }

  const d = dia.datos;
  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Asistencia</h1>
          <p>Escanea la credencial del socio o búscalo por nombre, teléfono o folio.</p>
        </div>
        {sedes.length > 1 && (
          <div className="campo min-w-50">
            <label htmlFor="sede-recepcion">Sede de recepción</label>
            <select id="sede-recepcion" value={idSede} onChange={(e) => setIdSede(Number(e.target.value))}>
              {sedes.map((s) => (
                <option key={s.id_sede} value={s.id_sede}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="checkin">
        <div className="tarjeta">
          <div className="tarjeta-cuerpo espaciado">
            <form onSubmit={enviar} className="fila buscador-grande flex-nowrap">
              <label htmlFor="buscar-socio" className="solo-lectores">
                Buscar socio o escanear credencial
              </label>
              <input
                id="buscar-socio"
                ref={entrada}
                autoFocus
                autoComplete="off"
                placeholder="Nombre, teléfono, folio o escanea el QR…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                disabled={registrando}
              />
              {window.BarcodeDetector && (
                <button type="button" className="btn min-h-13.5" onClick={() => setCamara((c) => !c)} aria-pressed={camara}>
                  <IconoCamara /> Cámara
                </button>
              )}
            </form>
            {camara && <LectorCamara alLeer={(codigo) => void registrar({ codigo })} pausado={registrando} />}
            <Alerta mensajes={error} />
            {buscando && <Cargando texto="Buscando…" />}
            {resultados && !buscando && (
              <div className="espaciado gap-2">
                {resultados.length === 0 && <div className="vacio">No se encontró ningún socio.</div>}
                {resultados.map((s) => (
                  <button
                    key={s.id_socio}
                    className="resultado-socio"
                    onClick={() => void registrar({ id_socio: s.id_socio })}
                    disabled={registrando || s.estado !== 'activo'}
                  >
                    <Avatar nombre={s.nombre} foto={urlArchivo(s.foto_url)} />
                    <div>
                      <div className="font-semibold">{s.nombre}</div>
                      <div className="pequeno muted">
                        {s.folio} · {s.sede}
                        {s.ultima_visita && ` · última visita ${formatoFechaHora(s.ultima_visita)}`}
                      </div>
                    </div>
                    <div className="derecha">
                      {s.estado === 'activo' ? <EstadoMembresiaBadge estado={s.membresia?.estado} /> : <span className="badge badge-neutro">Baja</span>}
                      {s.membresia && <span className="pequeno muted">hasta {formatoFecha(s.membresia.vigente_hasta)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!resultados && !texto && (
              <p className="muted pequeno">
                Con un lector de códigos USB basta con escanear: el registro se hace solo. Si la membresía no está vigente se avisa, pero la
                entrada queda registrada.
              </p>
            )}
          </div>
        </div>

        <div className="espaciado">
          {veredicto ? (
            <div className={`veredicto ${veredicto.alerta}`} role="status" aria-live="polite">
              <div className="persona">
                <Avatar nombre={veredicto.socio.nombre} foto={urlArchivo(veredicto.socio.foto_url)} grande />
                <div>
                  <div className="titulo-veredicto">
                    {veredicto.alerta === 'ok' ? '✓ Acceso registrado' : veredicto.alerta === 'aviso' ? '! Registrado con aviso' : '✕ Membresía no vigente'}
                  </div>
                  <div className="font-semibold text-[1.05rem]">{veredicto.socio.nombre}</div>
                  <div className="muted pequeno">
                    {veredicto.socio.folio} · {formatoFechaHora(veredicto.fecha_hora)}
                  </div>
                </div>
              </div>
              <p>{veredicto.mensaje}</p>
              {veredicto.membresia && (
                <div className="fila">
                  <EstadoMembresiaBadge estado={veredicto.membresia.estado} />
                  <span className="pequeno">
                    {veredicto.membresia.plan.nombre} · vigente hasta {formatoFecha(veredicto.membresia.vigente_hasta)}
                  </span>
                </div>
              )}
              {veredicto.alerta !== 'ok' && (
                <Link className="btn btn-primario" to={`/socios/${veredicto.socio.id_socio}?accion=membresia`}>
                  Renovar membresía
                </Link>
              )}
            </div>
          ) : (
            <div className="tarjeta tarjeta-cuerpo vacio">
              <IconoAsistencia />
              <p>El resultado de cada registro aparecerá aquí.</p>
            </div>
          )}

          <div className="kpis grid-cols-3">
            <Kpi etiqueta="Entradas hoy" valor={d?.total ?? '—'} sub={d ? `${d.socios_unicos} socios distintos` : undefined} />
            <Kpi etiqueta="Por vencer" valor={d?.por_estado.por_vencer ?? '—'} tono="aviso" />
            <Kpi etiqueta="Vencidas" valor={d?.por_estado.vencida ?? '—'} tono="error" icono={<IconoRiesgo />} />
          </div>
        </div>
      </div>

      <div className="tarjeta">
        <div className="tarjeta-titulo">
          <h2>Entradas de hoy</h2>
          <button className="btn btn-sm" onClick={dia.recargar}>
            Actualizar
          </button>
        </div>
        {dia.error && <Alerta mensajes={dia.error.detalles} />}
        {dia.cargando && !d ? (
          <Cargando />
        ) : !d?.registros.length ? (
          <div className="vacio">Aún no hay entradas registradas hoy.</div>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Socio</th>
                  <th>Membresía</th>
                  <th>Método</th>
                  <th>Sede</th>
                  <th>Registró</th>
                </tr>
              </thead>
              <tbody>
                {d.registros.map((r) => (
                  <tr key={r.id_asistencia}>
                    <td className="mono">{new Date(r.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      <Link to={`/socios/${r.socio.id_socio}`}>{r.socio.nombre}</Link>
                      <div className="pequeno muted">{r.socio.folio}</div>
                    </td>
                    <td>
                      <span className={`badge ${r.estado_membresia === 'vigente' ? 'badge-ok' : r.estado_membresia === 'por_vencer' ? 'badge-aviso' : 'badge-error'}`}>
                        {r.estado_membresia === 'vigente' ? 'Vigente' : r.estado_membresia === 'por_vencer' ? 'Por vencer' : 'Vencida'}
                      </span>
                    </td>
                    <td>{r.metodo_registro === 'qr' ? 'QR' : 'Búsqueda'}</td>
                    <td>{r.sede}</td>
                    <td className="muted">{r.registrado_por}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lee el QR de la credencial con la cámara de la tableta o laptop. */
function LectorCamara({ alLeer, pausado }: { alLeer: (codigo: string) => void; pausado: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const ultimo = useRef<{ codigo: string; en: number } | null>(null);
  const callback = useRef(alLeer);
  const pausa = useRef(pausado);
  useEffect(() => {
    callback.current = alLeer;
    pausa.current = pausado;
  });

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let temporizador = 0;
    let activo = true;
    const detector = new window.BarcodeDetector!({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        if (!activo) return s.getTracks().forEach((t) => t.stop());
        flujo = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play();
        }
        const leer = async () => {
          if (!activo || !video.current) return;
          try {
            if (!pausa.current) {
              const [c] = await detector.detect(video.current);
              const valor = c?.rawValue.trim();
              // Evita registrar la misma credencial varias veces mientras sigue frente a la cámara
              if (valor && ES_CODIGO.test(valor) && !(ultimo.current?.codigo === valor && Date.now() - ultimo.current.en < 5000)) {
                ultimo.current = { codigo: valor, en: Date.now() };
                callback.current(valor);
              }
            }
          } catch {
            /* fotograma no legible */
          }
          temporizador = window.setTimeout(leer, 300);
        };
        void leer();
      })
      .catch(() => setError('No se pudo acceder a la cámara. Revisa los permisos del navegador.'));
    return () => {
      activo = false;
      window.clearTimeout(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return error ? <Alerta mensajes={[error]} /> : <video ref={video} className="camara" muted playsInline aria-label="Vista de la cámara para leer el QR" />;
}
