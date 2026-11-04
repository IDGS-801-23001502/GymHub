import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import { aFecha, aISO, hoyISO } from '../common/utils/fechas.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ActualizarSocioDto,
  BajaSocioDto,
  BuscarSociosDto,
  CrearSocioDto,
} from './dto/socio.dto.js';
import { SociosService } from './socios.service.js';

@Controller('socios')
export class SociosController {
  constructor(private readonly socios: SociosService) {}

  @Post()
  @Roles('recepcionista')
  crear(@Body() dto: CrearSocioDto, @Ctx() ctx: ContextoPeticion) {
    return this.socios.crear(dto, ctx);
  }

  @Get()
  @Roles('recepcionista', 'entrenador')
  buscar(@Query() filtros: BuscarSociosDto, @Ctx() ctx: ContextoPeticion) {
    return this.socios.buscar(filtros, ctx.usuario);
  }

  @Get(':id')
  @Roles('recepcionista', 'entrenador')
  obtener(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.socios.obtener(id, ctx);
  }

  @Patch(':id')
  @Roles('recepcionista')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarSocioDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.socios.actualizar(id, dto, ctx);
  }

  @Post(':id/baja')
  @Roles('recepcionista')
  darDeBaja(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BajaSocioDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.socios.darDeBaja(id, dto, ctx);
  }

  @Post(':id/reactivar')
  @Roles('recepcionista')
  reactivar(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.socios.reactivar(id, ctx);
  }
}

/** Aviso de privacidad vigente, para mostrarlo en el alta (CRM-RNF-02). */
@Controller('avisos-privacidad')
export class AvisoPrivacidadController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('vigente')
  @Roles('recepcionista', 'entrenador')
  async vigente() {
    const aviso = await this.prisma.avisoPrivacidad.findFirst({
      where: { vigente_desde: { lte: aFecha(hoyISO()) } },
      orderBy: { vigente_desde: 'desc' },
    });
    if (!aviso) throw new NotFoundException('No hay aviso de privacidad vigente.');
    return { ...aviso, vigente_desde: aISO(aviso.vigente_desde) };
  }
}
