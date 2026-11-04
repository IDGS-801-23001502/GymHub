import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import { CancelarPagoDto, ListarPagosDto } from './dto/pago.dto.js';
import { PagosService } from './pagos.service.js';

@Controller('pagos')
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Get()
  @Roles('recepcionista')
  listar(@Query() filtros: ListarPagosDto, @Ctx() ctx: ContextoPeticion) {
    return this.pagos.listar(filtros, ctx.usuario);
  }

  @Get(':id')
  @Roles('recepcionista')
  obtener(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.pagos.obtener(id, ctx.usuario);
  }

  /** Comprobante imprimible en HTML. */
  @Get(':id/comprobante')
  @Roles('recepcionista')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
  comprobante(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.pagos.comprobante(id, ctx.usuario);
  }

  /** Cancelación con motivo; solo el administrador la autoriza. */
  @Post(':id/cancelar')
  @Roles('administrador')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarPagoDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.pagos.cancelar(id, dto, ctx);
  }
}
