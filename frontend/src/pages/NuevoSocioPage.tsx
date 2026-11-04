import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sociosApi } from '../api/servicios';
import { OBJETIVOS, type Objetivo, type SocioDetalle, type SocioEntrada } from '../api/tipos';
import { useAuth } from '../auth/contexto';
import { Alerta, Campo, Cargando } from '../components/ui';
import { formatoFecha, hoyISO } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

const PASOS = ['Datos personales', 'Contacto', 'Emergencia', 'Privacidad', 'Confirmar'] as const;
const TELEFONO = /^\+?[\d\s()-]{10,20}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Formulario = Omit<SocioEntrada, 'id_sede' | 'objetivo'> & { id_sede: string; objetivo: Objetivo | '' };
type Errores = Partial<Record<string, string>>;

function validarPaso(paso: number, f: Formulario, aceptaAviso: boolean): Errores {
  const e: Errores = {};
  if (paso === 0) {
    if (!f.nombre.trim()) e.nombre = 'El nombre es obligatorio.';
    if (!f.fecha_nacimiento) e.fecha_nacimiento = 'La fecha de nacimiento es obligatoria.';
    else if (f.fecha_nacimiento >= hoyISO()) e.fecha_nacimiento = 'Debe ser anterior a hoy.';
    if (!f.id_sede) e.id_sede = 'Selecciona la sede.';
    if (f.foto_url && !/^https?:\/\//.test(f.foto_url)) e.foto_url = 'Debe ser una URL (https://…).';
  }
  if (paso === 1) {
    if (!TELEFONO.test(f.telefono.trim())) e.telefono = 'Teléfono de 10 dígitos (puede incluir +52).';
    if (!CORREO.test(f.correo.trim())) e.correo = 'Correo no válido.';
  }
  if (paso === 2) {
    if (!f.contacto_emergencia.nombre.trim()) e.ce_nombre = 'Obligatorio.';
    if (!f.contacto_emergencia.parentesco.trim()) e.ce_parentesco = 'Obligatorio.';
    if (!TELEFONO.test(f.contacto_emergencia.telefono.trim())) e.ce_telefono = 'Teléfono no válido.';
  }
  if (paso === 3 && !aceptaAviso) e.aviso = 'El socio debe aceptar el aviso de privacidad para continuar.';
  return e;
}

/** Alta de socio en 5 pasos (CRM-RF-01, CRM-RNF-02, CRM-RNF-08). */
export function NuevoSocioPage() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const sedes = usuario?.sedes ?? [];
  const [paso, setPaso] = useState(0);
  const [aceptaAviso, setAceptaAviso] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [erroresApi, setErroresApi] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [creado, setCreado] = useState<SocioDetalle | null>(null);
  const [f, setF] = useState<Formulario>({
    nombre: '',
    fecha_nacimiento: '',
    telefono: '',
    correo: '',
    contacto_emergencia: { nombre: '', parentesco: '', telefono: '' },
    foto_url: '',
    objetivo: '',
    id_sede: sedes.length === 1 ? String(sedes[0]!.id_sede) : '',
  });
  const aviso = useCarga(() => sociosApi.avisoVigente(), 'aviso');

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((p) => ({ ...p, [k]: v }));
  const setCe = (k: keyof Formulario['contacto_emergencia'], v: string) =>
    setF((p) => ({ ...p, contacto_emergencia: { ...p.contacto_emergencia, [k]: v } }));

  const siguiente = (e: FormEvent) => {
    e.preventDefault();
    const errs = validarPaso(paso, f, aceptaAviso);
    setErrores(errs);
    if (Object.keys(errs).length) return;
    if (paso < PASOS.length - 1) setPaso(paso + 1);
    else void registrar();
  };

  const registrar = async () => {
    setEnviando(true);
    setErroresApi([]);
    try {
      const socio = await sociosApi.crear({
        nombre: f.nombre.trim(),
        fecha_nacimiento: f.fecha_nacimiento,
        telefono: f.telefono.trim(),
        correo: f.correo.trim(),
        contacto_emergencia: f.contacto_emergencia,
        foto_url: f.foto_url?.trim() || undefined,
        objetivo: f.objetivo || undefined,
        id_sede: Number(f.id_sede),
        acepta_aviso_privacidad: true,
      });
      setCreado(socio);
    } catch (err) {
      const msgs = mensajesError(err);
      setErroresApi(msgs);
      // Duplicado de correo o teléfono: regresar al paso de contacto
      if (msgs.some((m) => /correo|teléfono/i.test(m))) setPaso(1);
    } finally {
      setEnviando(false);
    }
  };

  if (creado) {
    return (
      <div className="tarjeta tarjeta-cuerpo espaciado" style={{ maxWidth: 620 }}>
        <Alerta tipo="ok">Socio registrado correctamente.</Alerta>
        <div>
          <h1>{creado.nombre}</h1>
          <p className="muted">
            Folio <strong className="mono">{creado.folio}</strong>. Con este folio y su correo el socio puede
            activar la app móvil.
          </p>
        </div>
        <div className="fila">
          <button
            className="btn btn-primario"
            onClick={() => navigate(`/socios/${creado.id_socio}?accion=membresia`)}
          >
            Asignar membresía y cobrar
          </button>
          <button className="btn" onClick={() => navigate(`/socios/${creado.id_socio}?pestana=salud`)}>
            Capturar ficha de salud
          </button>
          <Link className="btn btn-texto" to={`/socios/${creado.id_socio}`}>
            Ver expediente
          </Link>
        </div>
      </div>
    );
  }

  const nombreSede = sedes.find((s) => String(s.id_sede) === f.id_sede)?.nombre;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Nuevo socio</h1>
          <p>
            Paso {paso + 1} de {PASOS.length}: {PASOS[paso]}
          </p>
        </div>
        <Link to="/socios" className="btn">
          Cancelar
        </Link>
      </div>

      <ol className="pasos" aria-label="Progreso">
        {PASOS.map((p, i) => (
          <li key={p} className={`paso ${i === paso ? 'actual' : i < paso ? 'hecho' : ''}`} aria-current={i === paso ? 'step' : undefined}>
            <span className="n">{i < paso ? '✓' : i + 1}</span>
            {p}
          </li>
        ))}
      </ol>

      <form className="tarjeta tarjeta-cuerpo espaciado" onSubmit={siguiente} noValidate style={{ maxWidth: 760 }}>
        <Alerta mensajes={erroresApi} />

        {paso === 0 && (
          <div className="rejilla rejilla-2">
            <Campo etiqueta="Nombre completo" error={errores.nombre} className="">
              {(p) => <input {...p} value={f.nombre} maxLength={120} onChange={(e) => set('nombre', e.target.value)} autoComplete="off" />}
            </Campo>
            <Campo etiqueta="Fecha de nacimiento" error={errores.fecha_nacimiento}>
              {(p) => (
                <input {...p} type="date" max={hoyISO()} value={f.fecha_nacimiento} onChange={(e) => set('fecha_nacimiento', e.target.value)} />
              )}
            </Campo>
            <Campo etiqueta="Sede" error={errores.id_sede}>
              {(p) => (
                <select {...p} value={f.id_sede} onChange={(e) => set('id_sede', e.target.value)}>
                  <option value="">Selecciona…</option>
                  {sedes.map((s) => (
                    <option key={s.id_sede} value={s.id_sede}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo etiqueta="Objetivo (opcional)">
              {(p) => (
                <select {...p} value={f.objetivo} onChange={(e) => set('objetivo', e.target.value as Objetivo | '')}>
                  <option value="">Sin especificar</option>
                  {Object.entries(OBJETIVOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo etiqueta="URL de fotografía (opcional)" error={errores.foto_url}>
              {(p) => <input {...p} type="url" value={f.foto_url} onChange={(e) => set('foto_url', e.target.value)} placeholder="https://…" />}
            </Campo>
          </div>
        )}

        {paso === 1 && (
          <div className="rejilla rejilla-2">
            <Campo etiqueta="Teléfono" error={errores.telefono} ayuda="Se guarda cifrado.">
              {(p) => <input {...p} type="tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="55 1234 5678" />}
            </Campo>
            <Campo etiqueta="Correo" error={errores.correo} ayuda="Lo usará para activar la app móvil.">
              {(p) => <input {...p} type="email" value={f.correo} onChange={(e) => set('correo', e.target.value)} />}
            </Campo>
          </div>
        )}

        {paso === 2 && (
          <div className="rejilla rejilla-3">
            <Campo etiqueta="Nombre del contacto" error={errores.ce_nombre}>
              {(p) => <input {...p} value={f.contacto_emergencia.nombre} onChange={(e) => setCe('nombre', e.target.value)} />}
            </Campo>
            <Campo etiqueta="Parentesco" error={errores.ce_parentesco}>
              {(p) => <input {...p} value={f.contacto_emergencia.parentesco} onChange={(e) => setCe('parentesco', e.target.value)} placeholder="Madre, pareja…" />}
            </Campo>
            <Campo etiqueta="Teléfono" error={errores.ce_telefono}>
              {(p) => <input {...p} type="tel" value={f.contacto_emergencia.telefono} onChange={(e) => setCe('telefono', e.target.value)} />}
            </Campo>
          </div>
        )}

        {paso === 3 &&
          (aviso.cargando ? (
            <Cargando texto="Cargando aviso de privacidad…" />
          ) : aviso.error ? (
            <Alerta mensajes={aviso.error.detalles} />
          ) : (
            aviso.datos && (
              <>
                <div>
                  <h2>Aviso de privacidad v{aviso.datos.version}</h2>
                  <p className="muted pequeno">Vigente desde {formatoFecha(aviso.datos.vigente_desde)}. Muéstralo al socio antes de continuar.</p>
                </div>
                <div className="aviso-texto" tabIndex={0}>
                  {aviso.datos.contenido}
                </div>
                <label className="casilla">
                  <input type="checkbox" checked={aceptaAviso} onChange={(e) => setAceptaAviso(e.target.checked)} />
                  El socio leyó y acepta el aviso de privacidad (versión {aviso.datos.version}).
                </label>
                {errores.aviso && <span className="error-campo pequeno">{errores.aviso}</span>}
              </>
            )
          ))}

        {paso === 4 && (
          <dl className="datos">
            <div className="dato"><dt>Nombre</dt><dd>{f.nombre}</dd></div>
            <div className="dato"><dt>Nacimiento</dt><dd>{formatoFecha(f.fecha_nacimiento)}</dd></div>
            <div className="dato"><dt>Sede</dt><dd>{nombreSede}</dd></div>
            <div className="dato"><dt>Objetivo</dt><dd>{f.objetivo ? OBJETIVOS[f.objetivo] : '—'}</dd></div>
            <div className="dato"><dt>Teléfono</dt><dd>{f.telefono}</dd></div>
            <div className="dato"><dt>Correo</dt><dd>{f.correo}</dd></div>
            <div className="dato">
              <dt>Emergencia</dt>
              <dd>
                {f.contacto_emergencia.nombre} ({f.contacto_emergencia.parentesco}) · {f.contacto_emergencia.telefono}
              </dd>
            </div>
            <div className="dato"><dt>Aviso de privacidad</dt><dd>Aceptado (v{aviso.datos?.version})</dd></div>
          </dl>
        )}

        <div className="fila" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn" disabled={paso === 0 || enviando} onClick={() => setPaso(paso - 1)}>
            Atrás
          </button>
          <button type="submit" className="btn btn-primario" disabled={enviando || (paso === 3 && !aviso.datos)}>
            {paso < PASOS.length - 1 ? 'Siguiente' : enviando ? 'Registrando…' : 'Registrar socio'}
          </button>
        </div>
      </form>
    </>
  );
}
