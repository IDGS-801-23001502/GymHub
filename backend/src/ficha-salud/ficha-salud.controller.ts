import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import { GuardarFichaSaludDto } from './dto/ficha-salud.dto.js';
import { FichaSaludService } from './ficha-salud.service.js';

/**
 * Captura: administrador, entrenador y recepción (al dar de alta al socio).
 * Consulta completa: solo administrador y entrenador (CRM-RF-05).
 */
@Controller('socios/:id/ficha-salud')
export class FichaSaludController {
  constructor(private readonly fichas: FichaSaludService) {}

  @Post()
  @Roles('entrenador', 'recepcionista')
  guardar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarFichaSaludDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.fichas.guardar(id, dto, ctx);
  }

  @Get()
  @Roles('entrenador')
  actual(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.fichas.obtenerActual(id, ctx);
  }

  @Get('versiones')
  @Roles('entrenador')
  versiones(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.fichas.versiones(id, ctx);
  }

  @Get('versiones/:version')
  @Roles('entrenador')
  version(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.fichas.obtenerVersion(id, version, ctx);
  }
}
