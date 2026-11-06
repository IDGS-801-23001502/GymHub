import { useState } from 'react';
import { analiticaApi, type Reportes } from '../api/crm';
import { useAuth } from '../auth/contexto';
import { BarrasVerticales, Kpi, MapaCalor, Ranking } from '../components/Graficas';
import { exportarCsv } from '../utils/csv';
import { IconoDescargar, IconoImprimir } from '../components/iconos';
import { Alerta, Cargando } from '../components/ui';
import { formatoMoneda, hoyISO, METODOS_PAGO, sumarDias } from '../utils/formato';
import { useCarga } from '../utils/useCarga';
import type { MetodoPago } from '../api/tipos';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

function exportar(r: Reportes) {
  exportarCsv(`reporte-gymhub-${r.desde}-a-${r.hasta}.csv`, [
    ['Mes', 'Visitas', 'Ingresos', 'Altas', 'Renovaciones', 'Vencimientos', 'Renovaron', 'Retención %', 'Sesiones planeadas', 'Sesiones cumplidas', 'Adherencia %'],
    ...r.por_mes.map((m) => [
      m.mes,
      m.visitas,
      m.ingresos,
      m.altas_membresia,
      m.renovaciones,
      m.vencimientos,
      m.renovaron,
      m.tasa_retencion,
      m.sesiones_planeadas,
      m.sesiones_cumplidas,
      m.adherencia,
    ]),
    [],
    ['Ingresos por plan'],
    ...r.ingresos_por_plan.map((x) => [x.nombre, x.total]),
    [],
    ['Ingresos por sede'],
    ...r.ingresos_por_sede.map((x) => [x.nombre, x.total]),
    [],
    ['Renovaciones por plan'],
    ...r.renovaciones_por_plan.map((x) => [x.nombre, x.total]),
    [],
    ['Horas pico (visitas)', ...Array.from({ length: 24 }, (_, h) => `${h}:00`)],
    ...r.horas_pico.map((fila, d) => [['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][d], ...fila]),
  ]);
}

/** Reportes del administrador (CRM-RF-17): Excel (CSV) y PDF (imprimir). */
export function ReportesPage() {
  const { usuario } = useAuth();
  const hoy = hoyISO();
  const [desde, setDesde] = useState(sumarDias(hoy, -179));
  const [hasta, setHasta] = useState(hoy);
  const [idSede, setIdSede] = useState<number | ''>('');
  const filtro = { desde, hasta, id_sede: idSede || undefined };
  const { datos: r, error, cargando } = useCarga(() => analiticaApi.reportes(filtro), JSON.stringify(filtro));

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Reportes</h1>
          <p>Horas pico, adherencia a rutinas, retención, renovaciones e ingresos.</p>
        </div>
        <div className="fila no-imprimir">
          <button className="btn" disabled={!r} onClick={() => r && exportar(r)}>
            <IconoDescargar /> Excel (CSV)
          </button>
          <button className="btn btn-primario" disabled={!r} onClick={() => window.print()}>
            <IconoImprimir /> PDF
          </button>
        </div>
      </div>

      <div className="filtros no-imprimir">
        <div className="campo">
          <label htmlFor="r-desde">Desde</label>
          <input id="r-desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="r-hasta">Hasta</label>
          <input id="r-hasta" type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} />
        </div>
        {(usuario?.sedes.length ?? 0) > 1 && (
          <div className="campo">
            <label htmlFor="r-sede">Sede</label>
            <select id="r-sede" value={idSede} onChange={(e) => setIdSede(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Todas</option>
              {usuario?.sedes.map((s) => (
                <option key={s.id_sede} value={s.id_sede}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <Alerta mensajes={error.detalles} />}
      {cargando && !r && <Cargando />}
      {r && (
        <>
          <div className="kpis">
            <Kpi etiqueta="Visitas" valor={r.resumen.visitas.toLocaleString('es-MX')} />
            <Kpi etiqueta="Ingresos" valor={formatoMoneda(r.resumen.ingresos)} />
            <Kpi etiqueta="Renovaciones" valor={r.resumen.renovaciones} />
            <Kpi etiqueta="Retención" valor={pct(r.resumen.tasa_retencion)} sub="Vencimientos que renovaron" tono="ok" />
            <Kpi etiqueta="Adherencia" valor={pct(r.resumen.adherencia)} sub="Sesiones cumplidas / planeadas" />
          </div>

          <div className="tarjeta">
            <div className="tarjeta-titulo">
              <h2>Horas pico</h2>
              <span className="muted pequeno">Visitas por día y hora</span>
            </div>
            <div className="tarjeta-cuerpo">
              <MapaCalor matriz={r.horas_pico} />
            </div>
          </div>

          <div className="rejilla rejilla-2">
            <div className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>Ingresos por mes</h2>
              </div>
              <div className="tarjeta-cuerpo">
                <BarrasVerticales
                  titulo="Ingresos por mes"
                  datos={r.por_mes.map((m) => ({ etiqueta: nombreMes(m.mes), valor: m.ingresos }))}
                  formato={formatoMoneda}
                />
              </div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>Visitas por mes</h2>
              </div>
              <div className="tarjeta-cuerpo">
                <BarrasVerticales
                  titulo="Visitas por mes"
                  datos={r.por_mes.map((m) => ({ etiqueta: nombreMes(m.mes), valor: m.visitas }))}
                  formato={(n) => `${n} visitas`}
                />
              </div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>Ingresos por plan</h2>
              </div>
              <div className="tarjeta-cuerpo">
                <Ranking datos={r.ingresos_por_plan} formato={formatoMoneda} />
              </div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>Ingresos por método</h2>
              </div>
              <div className="tarjeta-cuerpo">
                <Ranking datos={r.ingresos_por_metodo.map((x) => ({ ...x, nombre: METODOS_PAGO[x.nombre as MetodoPago] ?? x.nombre }))} formato={formatoMoneda} />
              </div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>Renovaciones por plan</h2>
              </div>
              <div className="tarjeta-cuerpo">
                <Ranking datos={r.renovaciones_por_plan} />
              </div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>Por sede</h2>
              </div>
              <div className="tarjeta-cuerpo espaciado">
                <span className="pequeno muted">Ingresos</span>
                <Ranking datos={r.ingresos_por_sede} formato={formatoMoneda} />
                <span className="pequeno muted">Renovaciones</span>
                <Ranking datos={r.renovaciones_por_sede} />
              </div>
            </div>
          </div>

          <div className="tarjeta">
            <div className="tarjeta-titulo">
              <h2>Detalle mensual</h2>
            </div>
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="num">Visitas</th>
                    <th className="num">Ingresos</th>
                    <th className="num">Altas</th>
                    <th className="num">Renovaciones</th>
                    <th className="num">Retención</th>
                    <th className="num">Adherencia</th>
                  </tr>
                </thead>
                <tbody>
                  {r.por_mes.map((m) => (
                    <tr key={m.mes}>
                      <td className="capitalize">{nombreMes(m.mes)}</td>
                      <td className="num">{m.visitas}</td>
                      <td className="num">{formatoMoneda(m.ingresos)}</td>
                      <td className="num">{m.altas_membresia}</td>
                      <td className="num">{m.renovaciones}</td>
                      <td className="num" title={`${m.renovaron} de ${m.vencimientos} vencimientos`}>
                        {pct(m.tasa_retencion)}
                      </td>
                      <td className="num" title={`${m.sesiones_cumplidas} de ${m.sesiones_planeadas} sesiones`}>
                        {pct(m.adherencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
