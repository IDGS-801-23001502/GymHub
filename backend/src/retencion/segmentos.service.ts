import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion, UsuarioAutenticado } from '../common/auth/auth.types.js';
import { aFecha, aISO, diferenciaDias, edad, hoyISO, sumarDias } from '../common/utils/fechas.js';
import { Prisma } from '../generated/prisma/client.js';
import { MembresiasService, seleccionResumen } from '../membresias/membresias.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FiltrosSegmentoDto, SegmentoDto } from './dto/retencion.dto.js';

export interface SocioSegmentable {
  id_sede: number;
  objetivo: string | null;
  estado: string;
  fecha_alta: string;
  fecha_nacimiento: string;
  estado_membresia: string;
  visitas_30: number;
}

/** Aplica los filtros de un segmento a un socio ya resumido (CRM-RF-12). */
export function cumpleFiltros(s: SocioSegmentable, f: FiltrosSegmentoDto, hoy: string): boolean {
  if (!f.incluir_bajas && s.estado !== 'activo') return false;
  if (f.sedes?.length && !f.sedes.includes(s.id_sede)) return false;
  if (f.objetivos?.length && !(s.objetivo && f.objetivos.includes(s.objetivo))) return false;
  if (f.estados_membresia?.length && !f.estados_membresia.includes(s.estado_membresia)) return false;
  if (f.visitas_min !== undefined && s.visitas_30 < f.visitas_min) return false;
  if (f.visitas_max !== undefined && s.visitas_30 > f.visitas_max) return false;
  const antiguedad = diferenciaDias(s.fecha_alta, hoy);
  if (f.antiguedad_min_dias !== undefined && antiguedad < f.antiguedad_min_dias) return false;
  if (f.antiguedad_max_dias !== undefined && antiguedad > f.antiguedad_max_dias) return false;
  const anios = edad(s.fecha_nacimiento, hoy);
  if (f.edad_min !== undefined && anios < f.edad_min) return false;
  if (f.edad_max !== undefined && anios > f.edad_max) return false;
  return true;
}

export interface SocioDeSegmento {
  id_socio: number;
  folio: string;
  nombre: string;
  sede: string;
  objetivo: string | null;
  edad: number;
  fecha_alta: string;
  estado_membresia: string;
  vigente_hasta: string | null;
  visitas_30: number;
}

@Injectable()
export class SegmentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membresias: MembresiasService,
    private readonly audit: AuditService,
  ) {}

  /** Socios que cumplen los filtros, limitados a las sedes del usuario (null = todas). */
  async evaluar(f: FiltrosSegmentoDto, usuario: UsuarioAutenticado | null): Promise<SocioDeSegmento[]> {
    this.validar(f);
    const hoy = hoyISO();
    const sedesPermitidas = usuario && !usuario.admin_general ? usuario.sedes : null;
    const sedes = f.sedes?.length
      ? f.sedes.filter((s) => !sedesPermitidas || sedesPermitidas.includes(s))
      : sedesPermitidas;

    // Lo que SQL Server puede filtrar directo; el resto se calcula en memoria
    const where: Prisma.SocioWhereInput = {
      ...(sedes && { id_sede: { in: sedes } }),
      ...(!f.incluir_bajas && { estado: 'activo' }),
      ...(f.objetivos?.length && { objetivo: { in: f.objetivos } }),
      ...((f.antiguedad_min_dias !== undefined || f.antiguedad_max_dias !== undefined) && {
        fecha_alta: {
          ...(f.antiguedad_min_dias !== undefined && { lte: aFecha(sumarDias(hoy, -f.antiguedad_min_dias)) }),
          ...(f.antiguedad_max_dias !== undefined && { gte: aFecha(sumarDias(hoy, -f.antiguedad_max_dias)) }),
        },
      }),
    };
    const socios = await this.prisma.socio.findMany({
      where,
      select: {
        id_socio: true,
        folio: true,
        nombre: true,
        id_sede: true,
        objetivo: true,
        estado: true,
        fecha_alta: true,
        fecha_nacimiento: true,
        sede: { select: { nombre: true } },
        membresias: { select: seleccionResumen },
      },
      orderBy: { nombre: 'asc' },
    });
    const visitas = await this.visitasUltimos30(socios.map((s) => s.id_socio));
    const diasAviso = await this.membresias.diasAvisoPorSede();

    return socios.flatMap((s) => {
      const m = this.membresias.resumen(s.membresias, hoy, diasAviso(s.id_sede));
      const datos: SocioSegmentable = {
        id_sede: s.id_sede,
        objetivo: s.objetivo,
        estado: s.estado,
        fecha_alta: aISO(s.fecha_alta),
        fecha_nacimiento: aISO(s.fecha_nacimiento),
        estado_membresia: m?.estado ?? 'sin_membresia',
        visitas_30: visitas.get(s.id_socio) ?? 0,
      };
      if (!cumpleFiltros(datos, f, hoy)) return [];
      return [
        {
          id_socio: s.id_socio,
          folio: s.folio,
          nombre: s.nombre,
          sede: s.sede.nombre,
          objetivo: s.objetivo,
          edad: edad(datos.fecha_nacimiento, hoy),
          fecha_alta: datos.fecha_alta,
          estado_membresia: datos.estado_membresia,
          vigente_hasta: m?.vigente_hasta ?? null,
          visitas_30: datos.visitas_30,
        },
      ];
    });
  }

  async visitasUltimos30(ids: number[]) {
    const mapa = new Map<number, number>();
    if (!ids.length) return mapa;
    const desde = aFecha(sumarDias(hoyISO(), -29));
    for (let i = 0; i < ids.length; i += 2000) {
      const filas = await this.prisma.asistencia.groupBy({
        by: ['id_socio'],
        where: { id_socio: { in: ids.slice(i, i + 2000) }, fecha_hora: { gte: desde } },
        _count: { _all: true },
      });
      for (const f of filas) mapa.set(f.id_socio, f._count._all);
    }
    return mapa;
  }

  async listar(usuario: UsuarioAutenticado) {
    const segmentos = await this.prisma.segmento.findMany({
      include: { usuario: { select: { nombre: true } }, _count: { select: { campanas: true } } },
      orderBy: { nombre: 'asc' },
    });
    return Promise.all(
      segmentos.map(async (s) => {
        const filtros = JSON.parse(s.filtros) as FiltrosSegmentoDto;
        return {
          id_segmento: s.id_segmento,
          nombre: s.nombre,
          descripcion: s.descripcion,
          filtros,
          creado_por: s.usuario.nombre,
          creado_en: s.creado_en,
          campanas: s._count.campanas,
          total: (await this.evaluar(filtros, usuario)).length,
        };
      }),
    );
  }

  async obtener(id: number) {
    const s = await this.prisma.segmento.findUnique({ where: { id_segmento: id } });
    if (!s) throw new NotFoundException('Segmento no encontrado.');
    return { ...s, filtros: JSON.parse(s.filtros) as FiltrosSegmentoDto };
  }

  async socios(id: number, usuario: UsuarioAutenticado | null) {
    const s = await this.obtener(id);
    return { segmento: { id_segmento: s.id_segmento, nombre: s.nombre }, socios: await this.evaluar(s.filtros, usuario) };
  }

  async guardar(dto: SegmentoDto, ctx: ContextoPeticion, id?: number) {
    this.validar(dto.filtros);
    try {
      const data = { nombre: dto.nombre, descripcion: dto.descripcion ?? null, filtros: JSON.stringify(dto.filtros) };
      const s = id
        ? await this.prisma.segmento.update({ where: { id_segmento: id }, data })
        : await this.prisma.segmento.create({ data: { ...data, creado_por: ctx.usuario.id_usuario } });
      await this.audit.registrar(ctx, { entidad: 'segmento', idEntidad: s.id_segmento, accion: id ? 'modificar' : 'crear', nuevo: dto });
      return { ...s, filtros: dto.filtros };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un segmento con ese nombre.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Segmento no encontrado.');
      }
      throw error;
    }
  }

  async eliminar(id: number, ctx: ContextoPeticion) {
    const enUso = await this.prisma.campana.count({ where: { id_segmento: id } });
    if (enUso) throw new ConflictException('El segmento tiene campañas; no se puede eliminar.');
    await this.prisma.segmento.delete({ where: { id_segmento: id } }).catch(() => {
      throw new NotFoundException('Segmento no encontrado.');
    });
    await this.audit.registrar(ctx, { entidad: 'segmento', idEntidad: id, accion: 'eliminar' });
    return { ok: true };
  }

  /** CSV para Excel (BOM UTF-8 y separador coma). Sin datos de contacto: se consultan en el expediente. */
  async exportar(id: number, usuario: UsuarioAutenticado) {
    const { segmento, socios } = await this.socios(id, usuario);
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [
      ['Folio', 'Nombre', 'Sede', 'Objetivo', 'Edad', 'Alta', 'Membresía', 'Vigente hasta', 'Visitas 30 días'],
      ...socios.map((s) => [s.folio, s.nombre, s.sede, s.objetivo, s.edad, s.fecha_alta, s.estado_membresia, s.vigente_hasta, s.visitas_30]),
    ];
    return { nombre: segmento.nombre, csv: '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n') };
  }

  private validar(f: FiltrosSegmentoDto) {
    const rango = (a?: number, b?: number, nombre?: string) => {
      if (a !== undefined && b !== undefined && a > b) throw new BadRequestException(`El rango de ${nombre} está invertido.`);
    };
    rango(f.visitas_min, f.visitas_max, 'visitas');
    rango(f.antiguedad_min_dias, f.antiguedad_max_dias, 'antigüedad');
    rango(f.edad_min, f.edad_max, 'edad');
  }
}
