import { useState } from 'react';
import { RESTRICCIONES, TIPOS_BLOQUE, type Bloque, type Ejercicio, type TipoBloque } from '../api/tipos';

const etiqueta = (r: string) => RESTRICCIONES[r] ?? r.replace(/_/g, ' ');

function mover<T>(lista: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  return copia;
}

/** Solo lectura: bloques con sus ejercicios, series, repeticiones y descanso. */
export function VistaBloques({ bloques }: { bloques: Bloque[] }) {
  if (bloques.length === 0) return <p className="muted">Sin ejercicios.</p>;
  return (
    <div className="espaciado">
      {bloques.map((b, i) => (
        <section key={i} className="bloque">
          <h3 className="bloque-titulo">
            <span className="bloque-n">{i + 1}</span> {TIPOS_BLOQUE[b.tipo] ?? b.tipo}
          </h3>
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Ejercicio</th>
                  <th className="num">Series</th>
                  <th>Repeticiones</th>
                  <th className="num">Descanso</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {b.ejercicios.map((e, j) => (
                  <tr key={j}>
                    <td>{e.nombre}</td>
                    <td className="num">{e.series}</td>
                    <td>{e.repeticiones}</td>
                    <td className="num">{e.descanso_seg ? `${e.descanso_seg} s` : '—'}</td>
                    <td className="muted pequeno">{e.notas ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Marca los ejercicios contraindicados para el socio o desactivados en el catálogo. */
export function EditorBloques({
  bloques,
  alCambiar,
  catalogo,
  restricciones = [],
}: {
  bloques: Bloque[];
  alCambiar: (b: Bloque[]) => void;
  catalogo: Ejercicio[];
  restricciones?: string[];
}) {
  const [tipoNuevo, setTipoNuevo] = useState<TipoBloque>('fuerza');
  const porId = new Map(catalogo.map((e) => [e.id, e]));
  const activos = catalogo.filter((e) => e.activo);
  const grupos = [...new Set(activos.map((e) => e.grupo_muscular))].sort();

  const actualizarBloque = (i: number, cambio: Partial<Bloque>) =>
    alCambiar(bloques.map((b, k) => (k === i ? { ...b, ...cambio } : b)));

  const actualizarEjercicio = (i: number, j: number, cambio: Partial<Bloque['ejercicios'][number]>) =>
    actualizarBloque(i, {
      ejercicios: bloques[i]!.ejercicios.map((e, k) => (k === j ? { ...e, ...cambio } : e)),
    });

  const agregarEjercicio = (i: number, id: string) => {
    const ej = porId.get(id);
    if (!ej) return;
    const enCardio = bloques[i]!.tipo === 'cardio' || bloques[i]!.tipo === 'estiramiento';
    actualizarBloque(i, {
      ejercicios: [
        ...bloques[i]!.ejercicios,
        {
          id_ejercicio: ej.id,
          nombre: ej.nombre,
          series: enCardio ? 1 : 3,
          repeticiones: enCardio ? '30 s' : '10-12',
          descanso_seg: enCardio ? 0 : 60,
          notas: null,
        },
      ],
    });
  };

  return (
    <div className="espaciado">
      {bloques.map((b, i) => (
        <section key={i} className="bloque">
          <div className="bloque-titulo fila" style={{ justifyContent: 'space-between' }}>
            <div className="fila">
              <span className="bloque-n">{i + 1}</span>
              <select
                aria-label={`Tipo del bloque ${i + 1}`}
                value={b.tipo}
                onChange={(e) => actualizarBloque(i, { tipo: e.target.value as TipoBloque })}
                style={{ width: 'auto' }}
              >
                {Object.entries(TIPOS_BLOQUE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="fila">
              <button type="button" className="btn btn-sm" onClick={() => alCambiar(mover(bloques, i, -1))} disabled={i === 0} aria-label="Subir bloque">↑</button>
              <button type="button" className="btn btn-sm" onClick={() => alCambiar(mover(bloques, i, 1))} disabled={i === bloques.length - 1} aria-label="Bajar bloque">↓</button>
              <button type="button" className="btn btn-sm btn-peligro" onClick={() => alCambiar(bloques.filter((_, k) => k !== i))}>Quitar bloque</button>
            </div>
          </div>

          {b.ejercicios.length === 0 && <p className="muted pequeno">Agrega al menos un ejercicio.</p>}
          {b.ejercicios.map((e, j) => {
            const cat = porId.get(e.id_ejercicio);
            const choques = (cat?.contraindicaciones ?? e.contraindicaciones ?? []).filter((c) => restricciones.includes(c));
            const inactivo = cat ? !cat.activo : e.activo === false;
            return (
              <div key={`${e.id_ejercicio}-${j}`} className="fila-ejercicio">
                <div className="fe-nombre">
                  <strong>{e.nombre}</strong>
                  {choques.length > 0 && <span className="badge badge-error">Contraindicado: {choques.map(etiqueta).join(', ')}</span>}
                  {inactivo && <span className="badge badge-aviso">Desactivado en el catálogo</span>}
                </div>
                <label className="fe-campo">
                  <span>Series</span>
                  <input type="number" min={1} max={20} value={e.series} onChange={(ev) => actualizarEjercicio(i, j, { series: Number(ev.target.value) })} />
                </label>
                <label className="fe-campo">
                  <span>Repeticiones</span>
                  <input maxLength={20} value={e.repeticiones} onChange={(ev) => actualizarEjercicio(i, j, { repeticiones: ev.target.value })} />
                </label>
                <label className="fe-campo">
                  <span>Descanso (s)</span>
                  <input type="number" min={0} max={600} step={5} value={e.descanso_seg} onChange={(ev) => actualizarEjercicio(i, j, { descanso_seg: Number(ev.target.value) })} />
                </label>
                <label className="fe-campo fe-notas">
                  <span>Notas</span>
                  <input maxLength={500} value={e.notas ?? ''} onChange={(ev) => actualizarEjercicio(i, j, { notas: ev.target.value })} />
                </label>
                <div className="fila fe-acciones">
                  <button type="button" className="btn btn-sm" onClick={() => actualizarBloque(i, { ejercicios: mover(b.ejercicios, j, -1) })} disabled={j === 0} aria-label="Subir ejercicio">↑</button>
                  <button type="button" className="btn btn-sm" onClick={() => actualizarBloque(i, { ejercicios: mover(b.ejercicios, j, 1) })} disabled={j === b.ejercicios.length - 1} aria-label="Bajar ejercicio">↓</button>
                  <button type="button" className="btn btn-sm btn-peligro" onClick={() => actualizarBloque(i, { ejercicios: b.ejercicios.filter((_, k) => k !== j) })} aria-label="Quitar ejercicio">✕</button>
                </div>
              </div>
            );
          })}

          <select
            aria-label={`Agregar ejercicio al bloque ${i + 1}`}
            value=""
            onChange={(ev) => agregarEjercicio(i, ev.target.value)}
          >
            <option value="">+ Agregar ejercicio…</option>
            {grupos.map((g) => (
              <optgroup key={g} label={g.replace(/_/g, ' ')}>
                {activos
                  .filter((e) => e.grupo_muscular === g)
                  .map((e) => {
                    const choca = e.contraindicaciones.some((c) => restricciones.includes(c));
                    return (
                      <option key={e.id} value={e.id}>
                        {e.nombre}{choca ? ' ⚠ contraindicado' : ''}
                      </option>
                    );
                  })}
              </optgroup>
            ))}
          </select>
        </section>
      ))}

      <div className="fila">
        <select aria-label="Tipo de bloque nuevo" value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as TipoBloque)} style={{ width: 'auto' }}>
          {Object.entries(TIPOS_BLOQUE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn" onClick={() => alCambiar([...bloques, { tipo: tipoNuevo, ejercicios: [] }])}>
          + Agregar bloque
        </button>
      </div>
    </div>
  );
}
