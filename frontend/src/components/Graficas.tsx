import { useState, type ReactNode } from 'react';

export function Kpi({
  etiqueta,
  valor,
  sub,
  icono,
  tono,
}: {
  etiqueta: string;
  valor: ReactNode;
  sub?: ReactNode;
  icono?: ReactNode;
  tono?: 'ok' | 'aviso' | 'error';
}) {
  return (
    <div className={`kpi${tono ? ` ${tono}` : ''}`}>
      {icono && <div className="kpi-icono">{icono}</div>}
      <span className="etiqueta">{etiqueta}</span>
      <span className="valor">{valor}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

/** Barras verticales de una sola serie con tooltip al pasar el cursor o enfocar. */
export function BarrasVerticales({
  datos,
  formato = (n) => String(n),
  titulo,
  alto = 180,
}: {
  datos: { etiqueta: string; valor: number; detalle?: string }[];
  formato?: (n: number) => string;
  titulo: string;
  alto?: number;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const max = Math.max(1, ...datos.map((d) => d.valor));
  if (!datos.length) return <div className="vacio">Sin datos en el periodo.</div>;
  const d = activo !== null ? datos[activo] : null;
  return (
    <div className="grafica" onMouseLeave={() => setActivo(null)}>
      <div className="grafica-barras" style={{ height: alto }} role="img" aria-label={titulo}>
        {datos.map((x, i) => (
          <div
            key={x.etiqueta}
            className="col"
            tabIndex={0}
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onBlur={() => setActivo(null)}
            aria-label={`${x.etiqueta}: ${formato(x.valor)}`}
          >
            <span style={{ height: `${(x.valor / max) * 100}%`, minHeight: x.valor ? 2 : 0 }} />
          </div>
        ))}
      </div>
      {d && activo !== null && (
        <div className="tooltip" style={{ left: `${((activo + 0.5) / datos.length) * 100}%`, top: 8 + alto * (1 - d.valor / max) }}>
          <div className="muted">{d.etiqueta}</div>
          <b>{formato(d.valor)}</b>
          {d.detalle && <div className="muted">{d.detalle}</div>}
        </div>
      )}
      <div className="grafica-ejes" aria-hidden="true">
        <span>{datos[0].etiqueta}</span>
        {datos.length > 2 && <span>{datos[Math.floor(datos.length / 2)].etiqueta}</span>}
        <span>{datos[datos.length - 1].etiqueta}</span>
      </div>
    </div>
  );
}

/** Ranking con barras horizontales: el valor siempre se muestra como texto. */
export function Ranking({ datos, formato = (n) => String(n) }: { datos: { nombre: string; total: number }[]; formato?: (n: number) => string }) {
  if (!datos.length) return <div className="vacio">Sin datos en el periodo.</div>;
  const max = Math.max(1, ...datos.map((d) => d.total));
  return (
    <div className="ranking">
      {datos.map((d) => (
        <div key={d.nombre} className="ranking-fila" title={`${d.nombre}: ${formato(d.total)}`}>
          <span className="nombre">{d.nombre}</span>
          <div className="barra">
            <span style={{ width: `${(d.total / max) * 100}%` }} />
          </div>
          <span className="valor">{formato(d.total)}</span>
        </div>
      ))}
    </div>
  );
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** Rampa secuencial de un solo tono (morado), de tenue a intenso sobre el fondo oscuro. */
const RAMPA = ['#1d1d2c', '#2f1d4a', '#46206e', '#5f2493', '#7a28bb', '#9a4be6', '#c08cff'];

/** Mapa de calor día × hora (horas pico). */
export function MapaCalor({ matriz }: { matriz: number[][] }) {
  const [activo, setActivo] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...matriz.flat());
  const color = (v: number) => (v === 0 ? RAMPA[0] : RAMPA[Math.min(RAMPA.length - 1, 1 + Math.floor((v / max) * (RAMPA.length - 1.001)))]);
  // Solo se muestran las horas con actividad en algún día (más el margen de una hora)
  const conDatos = matriz[0].map((_, h) => matriz.some((fila) => fila[h] > 0));
  let primera = conDatos.indexOf(true);
  let ultima = conDatos.lastIndexOf(true);
  if (primera === -1) {
    primera = 6;
    ultima = 22;
  }
  const horas = Array.from({ length: ultima - primera + 1 }, (_, i) => primera + i);
  return (
    <div>
      <div className="tabla-envoltura relative" onMouseLeave={() => setActivo(null)}>
        <div className="calor" style={{ gridTemplateColumns: `38px repeat(${horas.length}, minmax(14px, 1fr))` }} role="img" aria-label="Visitas por día de la semana y hora">
          <span />
          {horas.map((h) => (
            <span key={h} className="hora">
              {h % 2 === 0 ? h : ''}
            </span>
          ))}
          {matriz.map((fila, d) => (
            <div key={DIAS[d]} className="contents">
              <span className="eje">{DIAS[d]}</span>
              {horas.map((h) => (
                <span
                  key={h}
                  className={`celda ${activo?.d === d && activo.h === h ? 'outline-2 outline-white' : ''}`}
                  style={{ background: color(fila[h]) }}
                  onMouseEnter={() => setActivo({ d, h })}
                  title={`${DIAS[d]} ${h}:00–${h + 1}:00 · ${fila[h]} visitas`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="fila justify-between mt-2.5">
        <span className="pequeno muted">
          {activo ? `${DIAS[activo.d]} de ${activo.h}:00 a ${activo.h + 1}:00 → ${matriz[activo.d][activo.h]} visitas` : 'Pasa el cursor por una celda para ver el detalle.'}
        </span>
        <span className="leyenda-calor">
          Menos
          {RAMPA.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
          Más
        </span>
      </div>
    </div>
  );
}
