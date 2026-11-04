import { useState } from 'react';
import { Link } from 'react-router-dom';
import { plantillasApi } from '../api/servicios';
import { NIVELES, OBJETIVOS, TIPOS_BLOQUE, type Plantilla } from '../api/tipos';
import { IconoMas } from '../components/iconos';
import { Alerta, Campo, Cargando, Modal } from '../components/ui';
import { mensajesError, useCarga } from '../utils/useCarga';

/** Plantillas de rutina por bloques (CRM-RF-07). */
export function PlantillasPage() {
  const [q, setQ] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [nivel, setNivel] = useState('');
  const [inactivas, setInactivas] = useState(false);
  const [duplicando, setDuplicando] = useState<Plantilla | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const { datos, error, cargando, recargar } = useCarga(
    () => plantillasApi.listar({ q: q.trim() || undefined, objetivo: objetivo || undefined, nivel: nivel || undefined, incluir_inactivas: inactivas }),
    `${q.trim()}|${objetivo}|${nivel}|${inactivas}`,
  );

  const alternar = async (p: Plantilla) => {
    setErrores([]);
    try {
      await plantillasApi.cambiarEstado(p.id, !p.activa);
      setMensaje(`Plantilla “${p.nombre}” ${p.activa ? 'desactivada' : 'activada'}.`);
      recargar();
    } catch (err) {
      setErrores(mensajesError(err));
    }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Plantillas de rutina</h1>
          <p>Rutinas por bloques listas para asignar. Desactivar una plantilla no cambia las rutinas ya asignadas.</p>
        </div>
        <Link to="/plantillas/nueva" className="btn btn-primario">
          <IconoMas /> Nueva plantilla
        </Link>
      </div>

      <div className="filtros">
        <div className="campo busqueda">
          <label htmlFor="q">Buscar</label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre de la plantilla" />
        </div>
        <div className="campo">
          <label htmlFor="objetivo">Objetivo</label>
          <select id="objetivo" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(OBJETIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="nivel">Nivel</label>
          <select id="nivel" value={nivel} onChange={(e) => setNivel(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(NIVELES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label className="casilla" style={{ alignSelf: 'center' }}>
          <input type="checkbox" checked={inactivas} onChange={(e) => setInactivas(e.target.checked)} />
          Mostrar desactivadas
        </label>
      </div>

      <div className="espaciado">
        {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
        <Alerta mensajes={errores} />
        {error && <Alerta mensajes={error.detalles} />}
        {cargando && !datos ? (
          <Cargando />
        ) : datos?.length === 0 ? (
          <div className="tarjeta vacio">No hay plantillas con esos filtros.</div>
        ) : (
          <div className="rejilla rejilla-3">
            {datos?.map((p) => (
              <article key={p.id} className="tarjeta tarjeta-cuerpo espaciado" style={{ opacity: p.activa ? 1 : 0.65 }}>
                <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h2>{p.nombre}</h2>
                  {!p.activa && <span className="badge badge-neutro">Desactivada</span>}
                </div>
                <div className="chips">
                  <span className="badge badge-info">{OBJETIVOS[p.objetivo] ?? p.objetivo}</span>
                  <span className="badge badge-neutro">{NIVELES[p.nivel]}</span>
                  {p.dias_semana && <span className="badge badge-neutro">{p.dias_semana} días/semana</span>}
                </div>
                <p className="muted pequeno">
                  {p.bloques.map((b) => TIPOS_BLOQUE[b.tipo] ?? b.tipo).join(' · ')} — {p.total_ejercicios} ejercicios
                </p>
                <div className="fila" style={{ marginTop: 'auto' }}>
                  <Link className="btn btn-sm" to={`/plantillas/${p.id}`}>Editar</Link>
                  <button className="btn btn-sm" onClick={() => setDuplicando(p)}>Duplicar</button>
                  <button className={`btn btn-sm${p.activa ? ' btn-peligro' : ''}`} onClick={() => alternar(p)}>
                    {p.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {duplicando && (
        <DuplicarModal
          plantilla={duplicando}
          alCerrar={() => setDuplicando(null)}
          alGuardar={(nueva) => {
            setDuplicando(null);
            setMensaje(`Se creó “${nueva.nombre}”.`);
            recargar();
          }}
        />
      )}
    </>
  );
}

function DuplicarModal({ plantilla, alCerrar, alGuardar }: { plantilla: Plantilla; alCerrar: () => void; alGuardar: (p: Plantilla) => void }) {
  const [nombre, setNombre] = useState(`${plantilla.nombre} (copia)`);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    setEnviando(true);
    setErrores([]);
    try {
      alGuardar(await plantillasApi.duplicar(plantilla.id, nombre.trim()));
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Duplicar ${plantilla.nombre}`}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={confirmar} disabled={enviando || nombre.trim().length < 2}>
            {enviando ? 'Duplicando…' : 'Duplicar'}
          </button>
        </>
      }
    >
      <Alerta mensajes={errores} />
      <Campo etiqueta="Nombre de la copia">
        {(p) => <input {...p} maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} />}
      </Campo>
    </Modal>
  );
}
