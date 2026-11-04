import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import {
  ActualizarPlanDto,
  CrearPlanDto,
  EstadoPlanDto,
  ListarPlanesDto,
} from './dto/plan.dto.js';
import { PlanesService } from './planes.service.js';

@Controller('planes')
export class PlanesController {
  constructor(private readonly planes: PlanesService) {}

  @Get()
  @Roles('recepcionista', 'entrenador')
  listar(@Query() q: ListarPlanesDto) {
    return this.planes.listar(q.incluir_inactivos);
  }

  @Get(':id')
  @Roles('recepcionista', 'entrenador')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.planes.obtener(id);
  }

  /** Solo administrador (el guard deja pasar siempre al administrador). */
  @Post()
  @Roles('administrador')
  crear(@Body() dto: CrearPlanDto, @Ctx() ctx: ContextoPeticion) {
    return this.planes.crear(dto, ctx);
  }

  @Patch(':id')
  @Roles('administrador')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarPlanDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.planes.actualizar(id, dto, ctx);
  }

  /** Activa o desactiva el plan (no se elimina para conservar el historial). */
  @Patch(':id/estado')
  @Roles('administrador')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EstadoPlanDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.planes.cambiarEstado(id, dto.activo, ctx);
  }
}
