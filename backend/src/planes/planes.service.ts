import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { aNumero } from '../common/utils/serializar.js';
import { Prisma, type PlanMembresia } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DURACION_POR_TIPO,
  type ActualizarPlanDto,
  type CrearPlanDto,
} from './dto/plan.dto.js';

/** Catálogo de planes (CRM-RF-02). No se borran, se desactivan para conservar el historial. */
@Injectable()
export class PlanesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(incluirInactivos = false) {
    const planes = await this.prisma.planMembresia.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      orderBy: [{ activo: 'desc' }, { duracion_dias: 'asc' }, { nombre: 'asc' }],
    });
    return planes.map(mapearPlan);
  }

  async obtener(idPlan: number) {
    return mapearPlan(await this.buscar(idPlan));
  }

  async crear(dto: CrearPlanDto, ctx: ContextoPeticion) {
    await this.verificarNombre(dto.nombre);
    const plan = await this.prisma.planMembresia.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        duracion_dias: dto.duracion_dias ?? DURACION_POR_TIPO[dto.tipo],
        precio: new Prisma.Decimal(dto.precio.toFixed(2)),
        beneficios: dto.beneficios ?? null,
      },
    });
    const resultado = mapearPlan(plan);
    await this.audit.registrar(ctx, {
      entidad: 'plan_membresia',
      idEntidad: plan.id_plan,
      accion: 'crear',
      nuevo: resultado,
    });
    return resultado;
  }

  async actualizar(idPlan: number, dto: ActualizarPlanDto, ctx: ContextoPeticion) {
    const actual = await this.buscar(idPlan);
    if (dto.nombre !== undefined && dto.nombre !== actual.nombre) {
      await this.verificarNombre(dto.nombre, idPlan);
    }
    const plan = await this.prisma.planMembresia.update({
      where: { id_plan: idPlan },
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        duracion_dias: dto.duracion_dias,
        precio: dto.precio === undefined ? undefined : new Prisma.Decimal(dto.precio.toFixed(2)),
        beneficios: dto.beneficios,
      },
    });
    const resultado = mapearPlan(plan);
    await this.audit.registrar(ctx, {
      entidad: 'plan_membresia',
      idEntidad: idPlan,
      accion: 'modificar',
      anterior: mapearPlan(actual),
      nuevo: resultado,
    });
    return resultado;
  }

  async cambiarEstado(idPlan: number, activo: boolean, ctx: ContextoPeticion) {
    const actual = await this.buscar(idPlan);
    if (actual.activo === activo) return mapearPlan(actual);
    const plan = await this.prisma.planMembresia.update({
      where: { id_plan: idPlan },
      data: { activo },
    });
    await this.audit.registrar(ctx, {
      entidad: 'plan_membresia',
      idEntidad: idPlan,
      accion: 'modificar',
      anterior: { activo: actual.activo },
      nuevo: { activo },
    });
    return mapearPlan(plan);
  }

  private async buscar(idPlan: number): Promise<PlanMembresia> {
    const plan = await this.prisma.planMembresia.findUnique({ where: { id_plan: idPlan } });
    if (!plan) throw new NotFoundException('Plan no encontrado.');
    return plan;
  }

  private async verificarNombre(nombre: string, excluirId?: number) {
    const existe = await this.prisma.planMembresia.findFirst({
      where: {
        nombre,
        ...(excluirId !== undefined && { NOT: { id_plan: excluirId } }),
      },
    });
    if (existe) throw new ConflictException(`Ya existe un plan llamado "${nombre}".`);
  }
}

export function mapearPlan(p: PlanMembresia) {
  return {
    id_plan: p.id_plan,
    nombre: p.nombre,
    tipo: p.tipo,
    duracion_dias: p.duracion_dias,
    precio: aNumero(p.precio),
    beneficios: p.beneficios,
    activo: p.activo,
    creado_en: p.creado_en,
  };
}
