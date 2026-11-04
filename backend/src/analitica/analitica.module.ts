import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches } from 'class-validator';
import { sesionesPlaneadas } from '../app-socio/app-socio.service.js';
import type { ContextoPeticion, UsuarioAutenticado } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import { exigirSede, filtroSedes } from '../common/auth/sedes.js';
import { aFecha, aISO, diferenciaDias, hoyISO, sumarDias } from '../common/utils/fechas.js';
import { aNumero } from '../common/utils/serializar.js';
import { MembresiasModule } from '../membresias/membresias.module.js';
import { MembresiasService, seleccionResumen } from '../membresias/membresias.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 366;

export class FiltroAnaliticaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_sede?: number;

  @IsOptional()
  @Matches(FECHA, { message: 'desde debe ser YYYY-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe ser YYYY-MM-DD' })
  hasta?: string;
}

const zona = () => process.env.APP_TIMEZONE ?? 'America/Mexico_City';

/** Día de la semana (1 = lunes) y hora en la zona del gimnasio. */
export function diaYHora(fecha: Date, tz = zona()): { dia: number; hora: number } {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(fecha);
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    dia: dias[partes.find((p) => p.type === 'weekday')!.value],
    hora: Number(partes.find((p) => p.type === 'hour')!.value),
  };
}

/** Fecha local (YYYY-MM-DD) de un instante. */
export function diaLocal(fecha: Date, tz = zona()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(fecha);
}

/** Meses YYYY-MM entre dos fechas, inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [a, m] = desde.slice(0, 7).split('-').map(Number);
  const fin = hasta.slice(0, 7);
  while (`${a}-${String(m).padStart(2, '0')}` <= fin) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return meses;
}

function finDeMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return aISO(new Date(Date.UTC(a, m, 0)));
}

/** Panel de indicadores y reportes (CRM-RF-16, CRM-RF-17). */
@Injectable()
export class AnaliticaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membresias: MembresiasService,
  ) {}

  private periodo(f: FiltroAnaliticaDto, porDefectoDias: number) {
    const hasta = f.hasta ?? hoyISO();
    const desde = f.desde ?? sumarDias(hasta, -porDefectoDias + 1);
    if (desde > hasta) throw new BadRequestException('"desde" debe ser anterior a "hasta".');
    if (diferenciaDias(desde, hasta) > MAX_DIAS) throw new BadRequestException('El periodo máximo es de 12 meses.');
    return { desde, hasta, rango: { gte: aFecha(desde), lt: aFecha(sumarDias(hasta, 1)) } };
  }

  private sedes(usuario: UsuarioAutenticado, idSede?: number) {
    if (idSede) {
      exigirSede(usuario, idSede);
      return { in: [idSede] };
    }
    return filtroSedes(usuario);
  }

  async panel(f: FiltroAnaliticaDto, usuario: UsuarioAutenticado) {
    const hoy = hoyISO();
    const { desde, hasta, rango } = this.periodo({ ...f, desde: f.desde ?? `${hoy.slice(0, 7)}-01` }, 30);
    const sedes = this.sedes(usuario, f.id_sede);

    const [socios, altas, bajas, riesgo, asistencias, pagos, listaSedes] = await Promise.all([
      this.prisma.socio.findMany({
        where: { estado: 'activo', id_sede: sedes },
        select: { id_socio: true, id_sede: true, membresias: { select: seleccionResumen } },
      }),
      this.prisma.socio.count({ where: { id_sede: sedes, fecha_alta: rango } }),
      this.prisma.socio.count({ where: { id_sede: sedes, fecha_baja: rango } }),
      this.prisma.riesgoDesercion.groupBy({
        by: ['motivo'],
        where: { estado: { in: ['abierto', 'atendido'] }, socio: { id_sede: sedes } },
        _count: { _all: true },
      }),
      this.prisma.asistencia.findMany({
        where: { id_sede: sedes, fecha_hora: { gte: aFecha(sumarDias(desde, -1)), lt: aFecha(sumarDias(hasta, 2)) } },
        select: { fecha_hora: true, id_sede: true },
      }),
      this.prisma.pago.findMany({
        where: { id_sede: sedes, estado: 'registrado', fecha_pago: rango },
        select: { monto: true, id_sede: true },
      }),
      this.prisma.sede.findMany({ where: { id_sede: sedes, activa: true }, select: { id_sede: true, nombre: true } }),
    ]);

    const diasAviso = await this.membresias.diasAvisoPorSede();
    const estados = socios.map((s) => ({
      id_sede: s.id_sede,
      estado: this.membresias.resumen(s.membresias, hoy, diasAviso(s.id_sede))?.estado ?? 'sin_membresia',
    }));
    const activos = (idSede?: number) =>
      estados.filter((e) => (idSede === undefined || e.id_sede === idSede) && (e.estado === 'activa' || e.estado === 'por_vencer')).length;

    const visitasPorDia = new Map<string, number>();
    for (const a of asistencias) {
      const d = diaLocal(a.fecha_hora);
      if (d >= desde && d <= hasta) visitasPorDia.set(d, (visitasPorDia.get(d) ?? 0) + 1);
    }
    const serie: { fecha: string; visitas: number }[] = [];
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) serie.push({ fecha: d, visitas: visitasPorDia.get(d) ?? 0 });

    const asistenciaHoy = asistencias.filter((a) => diaLocal(a.fecha_hora) === hoy);
    return {
      desde,
      hasta,
      indicadores: {
        socios_activos: activos(),
        altas,
        bajas,
        por_vencer: estados.filter((e) => e.estado === 'por_vencer').length,
        vencidas: estados.filter((e) => e.estado === 'vencida').length,
        en_riesgo: riesgo.reduce((t, r) => t + r._count._all, 0),
        riesgo_por_motivo: Object.fromEntries(riesgo.map((r) => [r.motivo, r._count._all])),
        asistencia_hoy: asistenciaHoy.length,
        ingresos: Math.round(pagos.reduce((t, p) => t + aNumero(p.monto), 0) * 100) / 100,
      },
      asistencia_diaria: serie,
      // CRM-RF-19: el administrador general compara sedes
      por_sede: listaSedes.map((s) => ({
        id_sede: s.id_sede,
        nombre: s.nombre,
        socios_activos: activos(s.id_sede),
        asistencia_hoy: asistenciaHoy.filter((a) => a.id_sede === s.id_sede).length,
        visitas_periodo: asistencias.filter((a) => a.id_sede === s.id_sede && diaLocal(a.fecha_hora) >= desde && diaLocal(a.fecha_hora) <= hasta).length,
        ingresos: Math.round(pagos.filter((p) => p.id_sede === s.id_sede).reduce((t, p) => t + aNumero(p.monto), 0) * 100) / 100,
      })),
    };
  }

  async reportes(f: FiltroAnaliticaDto, usuario: UsuarioAutenticado) {
    const { desde, hasta, rango } = this.periodo(f, 180);
    const sedes = this.sedes(usuario, f.id_sede);
    const meses = mesesEntre(desde, hasta);

    const [asistencias, pagos, nuevas, vencidas, rutinas, sesiones, planes, listaSedes] = await Promise.all([
      this.prisma.asistencia.findMany({ where: { id_sede: sedes, fecha_hora: rango }, select: { fecha_hora: true } }),
      this.prisma.pago.findMany({
        where: { id_sede: sedes, estado: 'registrado', fecha_pago: rango },
        select: { monto: true, metodo: true, fecha_pago: true, id_plan: true, id_sede: true },
      }),
      this.prisma.membresia.findMany({
        where: { creada_en: rango, estado: { not: 'cancelada' }, socio: { id_sede: sedes } },
        select: { es_renovacion: true, creada_en: true, id_plan: true, socio: { select: { id_sede: true } } },
      }),
      this.prisma.membresia.findMany({
        where: { fecha_vencimiento: { gte: aFecha(desde), lte: aFecha(hasta) }, estado: { not: 'cancelada' }, socio: { id_sede: sedes } },
        select: { id_membresia: true, id_socio: true, fecha_vencimiento: true },
      }),
      this.prisma.rutinaAsignada.findMany({
        where: {
          socio: { id_sede: sedes },
          fecha_inicio: { lte: aFecha(hasta) },
          OR: [{ fecha_fin: null }, { fecha_fin: { gte: aFecha(desde) } }],
        },
        select: { id_socio: true, fecha_inicio: true, fecha_fin: true, sesiones_planeadas_semana: true },
      }),
      this.prisma.sesionEntrenamiento.findMany({
        where: { completada: true, fecha_inicio: rango, socio: { id_sede: sedes } },
        select: { fecha_inicio: true },
      }),
      this.prisma.planMembresia.findMany({ select: { id_plan: true, nombre: true } }),
      this.prisma.sede.findMany({ where: { id_sede: sedes }, select: { id_sede: true, nombre: true } }),
    ]);

    // Horas pico: matriz día (1-7) × hora (0-23)
    const horas = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const a of asistencias) {
      const { dia, hora } = diaYHora(a.fecha_hora);
      horas[dia - 1][hora]++;
    }

    // Retención: de las membresías que vencieron cada mes, cuántas tuvieron una siguiente
    const siguientes = vencidas.length
      ? await this.prisma.membresia.findMany({
          where: { id_socio: { in: [...new Set(vencidas.map((v) => v.id_socio))] }, estado: { not: 'cancelada' } },
          select: { id_membresia: true, id_socio: true, fecha_inicio: true, id_membresia_anterior: true },
        })
      : [];
    /** Renovó si hay una membresía encadenada a esta o que inicia en los 30 días siguientes al vencimiento. */
    const renovo = (v: (typeof vencidas)[number]) => {
      const vence = aISO(v.fecha_vencimiento);
      return siguientes.some(
        (s) =>
          s.id_socio === v.id_socio &&
          s.id_membresia !== v.id_membresia &&
          (s.id_membresia_anterior === v.id_membresia ||
            (aISO(s.fecha_inicio) > sumarDias(vence, -30) && aISO(s.fecha_inicio) <= sumarDias(vence, 30))),
      );
    };
    const nombrePlan = (id: number) => planes.find((p) => p.id_plan === id)?.nombre ?? `Plan ${id}`;
    const nombreSede = (id: number) => listaSedes.find((s) => s.id_sede === id)?.nombre ?? `Sede ${id}`;
    const agrupar = <T>(lista: T[], llave: (x: T) => string, valor: (x: T) => number = () => 1) => {
      const m = new Map<string, number>();
      for (const x of lista) m.set(llave(x), (m.get(llave(x)) ?? 0) + valor(x));
      return [...m].map(([nombre, total]) => ({ nombre, total: Math.round(total * 100) / 100 })).sort((a, b) => b.total - a.total);
    };

    const porMes = meses.map((mes) => {
      const ini = mes < desde.slice(0, 7) ? desde : `${mes}-01` < desde ? desde : `${mes}-01`;
      const fin = finDeMes(mes) > hasta ? hasta : finDeMes(mes);
      const delMes = <T>(lista: T[], fecha: (x: T) => Date) => lista.filter((x) => diaLocal(fecha(x)).startsWith(mes));
      const vencieron = vencidas.filter((v) => aISO(v.fecha_vencimiento).startsWith(mes));
      const renovaron = vencieron.filter(renovo).length;
      const planeadas = sesionesPlaneadas(rutinas, ini, fin);
      const cumplidas = delMes(sesiones, (s) => s.fecha_inicio).length;
      return {
        mes,
        visitas: delMes(asistencias, (a) => a.fecha_hora).length,
        ingresos: Math.round(delMes(pagos, (p) => p.fecha_pago).reduce((t, p) => t + aNumero(p.monto), 0) * 100) / 100,
        altas_membresia: delMes(nuevas, (n) => n.creada_en).filter((n) => !n.es_renovacion).length,
        renovaciones: delMes(nuevas, (n) => n.creada_en).filter((n) => n.es_renovacion).length,
        vencimientos: vencieron.length,
        renovaron,
        tasa_retencion: vencieron.length ? Math.round((renovaron / vencieron.length) * 100) : null,
        sesiones_planeadas: planeadas,
        sesiones_cumplidas: cumplidas,
        adherencia: planeadas ? Math.min(100, Math.round((cumplidas / planeadas) * 100)) : null,
      };
    });

    const renovaciones = nuevas.filter((n) => n.es_renovacion);
    const totalVencidas = vencidas.length;
    const totalRenovaron = vencidas.filter(renovo).length;
    const planeadasTotal = porMes.reduce((t, m) => t + m.sesiones_planeadas, 0);
    return {
      desde,
      hasta,
      resumen: {
        visitas: asistencias.length,
        ingresos: Math.round(pagos.reduce((t, p) => t + aNumero(p.monto), 0) * 100) / 100,
        renovaciones: renovaciones.length,
        tasa_retencion: totalVencidas ? Math.round((totalRenovaron / totalVencidas) * 100) : null,
        adherencia: planeadasTotal ? Math.min(100, Math.round((sesiones.length / planeadasTotal) * 100)) : null,
      },
      por_mes: porMes,
      horas_pico: horas,
      renovaciones_por_plan: agrupar(renovaciones, (n) => nombrePlan(n.id_plan)),
      renovaciones_por_sede: agrupar(renovaciones, (n) => nombreSede(n.socio.id_sede)),
      ingresos_por_plan: agrupar(pagos, (p) => nombrePlan(p.id_plan), (p) => aNumero(p.monto)),
      ingresos_por_sede: agrupar(pagos, (p) => nombreSede(p.id_sede), (p) => aNumero(p.monto)),
      ingresos_por_metodo: agrupar(pagos, (p) => p.metodo, (p) => aNumero(p.monto)),
    };
  }
}

@Controller('analitica')
@Roles('administrador')
export class AnaliticaController {
  constructor(private readonly analitica: AnaliticaService) {}

  @Get('panel')
  panel(@Query() f: FiltroAnaliticaDto, @Ctx() ctx: ContextoPeticion) {
    return this.analitica.panel(f, ctx.usuario);
  }

  @Get('reportes')
  reportes(@Query() f: FiltroAnaliticaDto, @Ctx() ctx: ContextoPeticion) {
    return this.analitica.reportes(f, ctx.usuario);
  }
}

@Module({
  imports: [MembresiasModule],
  controllers: [AnaliticaController],
  providers: [AnaliticaService],
})
export class AnaliticaModule {}
