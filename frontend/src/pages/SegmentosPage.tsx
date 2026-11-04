import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { segmentosApi, type FiltrosSegmento, type Segmento, type SocioDeSegmento } from '../api/crm';
import { OBJETIVOS } from '../api/tipos';
import { useAuth } from '../auth/contexto';
import { IconoDescargar, IconoMas } from '../components/iconos';
import { Alerta, Campo, Cargando, Modal } from '../components/ui';
import { formatoFecha } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

const ESTADOS = {
  activa: 'Vigente',
  por_vencer: 'Por vencer',
  vencida: 'Vencida',
  congelada: 'Congelada',
  cancelada: 'Cancelada',
  sin_membresia: 'Sin membresía',
} as const;

function describir(f: FiltrosSegmento, sedes: { id_sede: number; nombre: string }[]): string {
  const partes: string[] = [];
  if (f.estados_membresia?.length) partes.push(f.estados_membresia.map((e) => ESTADOS[e as keyof typeof ESTADOS] ?? e).join(' o '));
  if (f.sedes?.length) partes.push(`sede ${f.sedes.map((id) => sedes.find((s) => s.id_sede === id)?.nombre ?? id).join('/')}`);
  if (f.objetivos?.length) partes.push(f.objetivos.map((o) => OBJETIVOS[o as keyof typeof OBJETIVOS] ?? o).join(' o '));
  if (f.visitas_min !== undefined || f.visitas_max !== undefined) partes.push(`${f.visitas_min ?? 0}–${f.visitas_max ?? '∞'} visitas/30 días`);
  if (f.antiguedad_min_dias !== undefined || f.antiguedad_max_dias !== undefined)
    partes.push(`antigüedad ${f.antiguedad_min_dias ?? 0}–${f.antiguedad_max_dias ?? '∞'} días`);
  if (f.edad_min !== undefined || f.edad_max !== undefined) partes.push(`${f.edad_min ?? 0}–${f.edad_max ?? '∞'} años`);
  if (f.incluir_bajas) partes.push('incluye bajas');
  return partes.join(' · ') || 'Todos los socios activos';
}

/** Segmentación de socios para campañas (CRM-RF-12). */
export function SegmentosPage() {
  const { usuario } = useAuth();
  const { datos, error, cargando, recargar } = useCarga(() => segmentosApi.listar(), 'segmentos');
  const [editando, setEditando] = useState<Segmento | 'nuevo' | null>(null);
  const [viendo, setViendo] = useState<Segmento | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  async function eliminar(s: Segmento) {
    if (!confirm(`¿Eliminar el segmento "${s.nombre}"?`)) return;
    try {
      await segmentosApi.eliminar(s.id_segmento);
      recargar();
    } catch (e) {
      setErrores(mensajesError(e));
    }
  }

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Segmentos</h1>
          <p>Grupos de socios por membresía, sede, objetivo, frecuencia de visitas, antigüedad o edad.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>
          <IconoMas /> Nuevo segmento
        </button>
      </div>
      {error && <Alerta mensajes={error.detalles} />}
      <Alerta mensajes={errores} />
      {cargando && !datos ? (
        <Cargando />
      ) : !datos?.length ? (
        <div className="tarjeta vacio">Aún no hay segmentos. Crea uno para enviar campañas dirigidas.</div>
      ) : (
        <div className="rejilla rejilla-2">
          {datos.map((s) => (
            <div key={s.id_segmento} className="tarjeta tarjeta-cuerpo espaciado" style={{ gap: 10 }}>
              <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3>{s.nombre}</h3>
                  {s.descripcion && <p className="muted pequeno">{s.descripcion}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{s.total}</div>
                  <div className="pequeno muted">socios</div>
                </div>
              </div>
              <p className="pequeno">{describir(s.filtros, usuario?.sedes ?? [])}</p>
              <p className="pequeno muted">
                Creado por {s.creado_por} · {s.campanas} campañas
              </p>
              <div className="fila" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-texto btn-peligro" onClick={() => void eliminar(s)} disabled={s.campanas > 0} title={s.campanas ? 'Tiene campañas' : undefined}>
                  Eliminar
                </button>
                <button className="btn btn-sm" onClick={() => void segmentosApi.exportar(s.id_segmento, s.nombre).catch((e) => setErrores(mensajesError(e)))}>
                  <IconoDescargar /> CSV
                </button>
                <button className="btn btn-sm" onClick={() => setEditando(s)}>
                  Editar
                </button>
                <button className="btn btn-sm btn-primario" onClick={() => setViendo(s)}>
                  Ver socios
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <EditorSegmento
          segmento={editando === 'nuevo' ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
      {viendo && <SociosSegmento segmento={viendo} alCerrar={() => setViendo(null)} />}
    </div>
  );
}

function TablaSocios({ socios }: { socios: SocioDeSegmento[] }) {
  if (!socios.length) return <div className="vacio">Ningún socio cumple los filtros.</div>;
  return (
    <div className="tabla-envoltura" style={{ maxHeight: 360 }}>
      <table>
        <thead>
          <tr>
            <th>Socio</th>
            <th>Sede</th>
            <th>Membresía</th>
            <th className="num">Visitas 30 d</th>
            <th className="num">Edad</th>
          </tr>
        </thead>
        <tbody>
          {socios.map((s) => (
            <tr key={s.id_socio}>
              <td>
                <Link to={`/socios/${s.id_socio}`}>{s.nombre}</Link>
                <div className="pequeno muted">
                  {s.folio} · alta {formatoFecha(s.fecha_alta)}
                </div>
              </td>
              <td>{s.sede}</td>
              <td>
                {ESTADOS[s.estado_membresia as keyof typeof ESTADOS] ?? s.estado_membresia}
                {s.vigente_hasta && <div className="pequeno muted">hasta {formatoFecha(s.vigente_hasta)}</div>}
              </td>
              <td className="num">{s.visitas_30}</td>
              <td className="num">{s.edad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SociosSegmento({ segmento, alCerrar }: { segmento: Segmento; alCerrar: () => void }) {
  const { datos, error } = useCarga(() => segmentosApi.socios(segmento.id_segmento), `seg-${segmento.id_segmento}`);
  return (
    <Modal titulo={segmento.nombre} alCerrar={alCerrar} ancho>
      {error && <Alerta mensajes={error.detalles} />}
      {!datos ? <Cargando /> : <TablaSocios socios={datos.socios} />}
    </Modal>
  );
}

const num = (v: string) => (v === '' ? undefined : Number(v));

function EditorSegmento({ segmento, alCerrar, alGuardar }: { segmento: Segmento | null; alCerrar: () => void; alGuardar: () => void }) {
  const { usuario } = useAuth();
  const [nombre, setNombre] = useState(segmento?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(segmento?.descripcion ?? '');
  const [f, setF] = useState<FiltrosSegmento>(segmento?.filtros ?? { estados_membresia: ['vencida'] });
  const [vista, setVista] = useState<{ total: number; socios: SocioDeSegmento[] } | null>(null);
  const [error, setError] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Vista previa en vivo
  useEffect(() => {
    let vigente = true;
    const t = window.setTimeout(() => {
      segmentosApi
        .previsualizar(f)
        .then((r) => vigente && (setVista(r), setError([])))
        .catch((e: unknown) => vigente && setError(mensajesError(e)));
    }, 350);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [f]);

  const alternar = <K extends 'estados_membresia' | 'objetivos' | 'sedes'>(clave: K, valor: NonNullable<FiltrosSegmento[K]>[number]) => {
    const actual = (f[clave] ?? []) as (typeof valor)[];
    const nuevo = actual.includes(valor) ? actual.filter((x) => x !== valor) : [...actual, valor];
    setF({ ...f, [clave]: nuevo.length ? nuevo : undefined });
  };

  async function guardar() {
    if (!nombre.trim()) return setError(['Ponle nombre al segmento.']);
    setGuardando(true);
    try {
      const datos = { nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, filtros: f };
      if (segmento) await segmentosApi.actualizar(segmento.id_segmento, datos);
      else await segmentosApi.crear(datos);
      alGuardar();
    } catch (e) {
      setError(mensajesError(e));
      setGuardando(false);
    }
  }

  const rango = (etiqueta: string, min: keyof FiltrosSegmento, max: keyof FiltrosSegmento, ayuda?: string) => (
    <div className="campo">
      <label>{etiqueta}</label>
      <div className="fila" style={{ flexWrap: 'nowrap' }}>
        <input type="number" min={0} placeholder="mín" aria-label={`${etiqueta} mínimo`} value={(f[min] as number | undefined) ?? ''} onChange={(e) => setF({ ...f, [min]: num(e.target.value) })} />
        <span className="muted">a</span>
        <input type="number" min={0} placeholder="máx" aria-label={`${etiqueta} máximo`} value={(f[max] as number | undefined) ?? ''} onChange={(e) => setF({ ...f, [max]: num(e.target.value) })} />
      </div>
      {ayuda && <span className="ayuda">{ayuda}</span>}
    </div>
  );

  return (
    <Modal
      titulo={segmento ? 'Editar segmento' : 'Nuevo segmento'}
      alCerrar={alCerrar}
      ancho
      pie={
        <>
          <span className="muted pequeno" style={{ marginRight: 'auto' }}>
            {vista ? `${vista.total} socios cumplen los filtros` : 'Calculando…'}
          </span>
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
      <div className="rejilla rejilla-2">
        <Campo etiqueta="Nombre">{(p) => <input {...p} maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} />}</Campo>
        <Campo etiqueta="Descripción (opcional)">{(p) => <input {...p} maxLength={255} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}</Campo>
      </div>
      <div className="campo">
        <label>Estado de la membresía</label>
        <div className="chips">
          {Object.entries(ESTADOS).map(([k, v]) => (
            <button key={k} type="button" className="chip" aria-pressed={!!f.estados_membresia?.includes(k)} onClick={() => alternar('estados_membresia', k)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      {(usuario?.sedes.length ?? 0) > 1 && (
        <div className="campo">
          <label>Sedes</label>
          <div className="chips">
            {usuario?.sedes.map((s) => (
              <button key={s.id_sede} type="button" className="chip" aria-pressed={!!f.sedes?.includes(s.id_sede)} onClick={() => alternar('sedes', s.id_sede)}>
                {s.nombre}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="campo">
        <label>Objetivo</label>
        <div className="chips">
          {Object.entries(OBJETIVOS).map(([k, v]) => (
            <button key={k} type="button" className="chip" aria-pressed={!!f.objetivos?.includes(k)} onClick={() => alternar('objetivos', k)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="rejilla rejilla-3">
        {rango('Visitas (últimos 30 días)', 'visitas_min', 'visitas_max')}
        {rango('Antigüedad (días)', 'antiguedad_min_dias', 'antiguedad_max_dias')}
        {rango('Edad (años)', 'edad_min', 'edad_max')}
      </div>
      <label className="casilla">
        <input type="checkbox" checked={!!f.incluir_bajas} onChange={(e) => setF({ ...f, incluir_bajas: e.target.checked || undefined })} />
        Incluir socios dados de baja
      </label>
      <h3>Vista previa</h3>
      {vista ? <TablaSocios socios={vista.socios} /> : <Cargando />}
      {vista && vista.total > vista.socios.length && <p className="pequeno muted">Mostrando {vista.socios.length} de {vista.total}.</p>}
    </Modal>
  );
}
