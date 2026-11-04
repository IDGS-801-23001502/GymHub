import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import { AsignarMembresiaDto, CongelarMembresiaDto } from './dto/membresia.dto.js';
import { MembresiasService } from './membresias.service.js';

@Controller()
export class MembresiasController {
  constructor(private readonly membresias: MembresiasService) {}

  /** Historial de planes del socio con estado calculado y pagos. */
  @Get('socios/:id/membresias')
  @Roles('recepcionista', 'entrenador')
  historial(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.membresias.historial(id, ctx.usuario);
  }

  /** Asigna o renueva (acumulando vigencia) y registra el pago en la misma transacción. */
  @Post('socios/:id/membresias')
  @Roles('recepcionista')
  asignar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarMembresiaDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.membresias.asignar(id, dto, ctx);
  }

  @Post('congelamientos/:id/terminar')
  @Roles('recepcionista')
  @HttpCode(200)
  terminarCongelamiento(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.membresias.terminarCongelamiento(id, ctx);
  }

  @Post('membresias/:id/congelamientos')
  @Roles('recepcionista')
  congelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CongelarMembresiaDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.membresias.congelar(id, dto, ctx);
  }
}
