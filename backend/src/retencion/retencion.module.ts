import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import { exigirSede } from '../common/auth/sedes.js';
import { idNumero } from '../common/utils/serializar.js';
import { MembresiasModule } from '../membresias/membresias.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CampanasService } from './campanas.service.js';
import { AccionRiesgoDto, CampanaDto, ConfigRiesgoDto, FiltrosSegmentoDto, InteraccionDto, SegmentoDto } from './dto/retencion.dto.js';
import { RiesgoService } from './riesgo.service.js';
import { SegmentosService } from './segmentos.service.js';

/** Línea de tiempo del socio (CRM-RF-15). */
@Injectable()
export class InteraccionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(idSocio: number, ctx: ContextoPeticion, tipo?: string) {
    const socio = await this.prisma.socio.findUnique({ where: { id_socio: idSocio }, select: { id_sede: true } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    exigirSede(ctx.usuario, socio.id_sede);
    const lista = await this.prisma.interaccionSocio.findMany({
      where: { id_socio: idSocio, ...(tipo && { tipo }) },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' },
      take: 300,
    });
    return lista.map((i) => ({
      id_interaccion: idNumero(i.id_interaccion),
      tipo: i.tipo,
      descripcion: i.descripcion,
      fecha: i.fecha,
      responsable: i.usuario?.nombre ?? 'Sistema',
    }));
  }

  async agregar(idSocio: number, dto: InteraccionDto, ctx: ContextoPeticion) {
    const socio = await this.prisma.socio.findUnique({ where: { id_socio: idSocio }, select: { id_sede: true } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    exigirSede(ctx.usuario, socio.id_sede);
    await this.audit.interaccion(ctx, idSocio, dto.tipo, dto.descripcion);
    return (await this.listar(idSocio, ctx))[0];
  }
}

@Controller('segmentos')
@Roles('administrador')
export class SegmentosController {
  constructor(private readonly segmentos: SegmentosService) {}

  @Get()
  listar(@Ctx() ctx: ContextoPeticion) {
    return this.segmentos.listar(ctx.usuario);
  }

  /** Vista previa sin guardar. */
  @Post('previsualizar')
  @HttpCode(200)
  async previsualizar(@Body() filtros: FiltrosSegmentoDto, @Ctx() ctx: ContextoPeticion) {
    const socios = await this.segmentos.evaluar(filtros, ctx.usuario);
    return { total: socios.length, socios: socios.slice(0, 200) };
  }

  @Post()
  crear(@Body() dto: SegmentoDto, @Ctx() ctx: ContextoPeticion) {
    return this.segmentos.guardar(dto, ctx);
  }

  @Put(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: SegmentoDto, @Ctx() ctx: ContextoPeticion) {
    return this.segmentos.guardar(dto, ctx, id);
  }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.segmentos.eliminar(id, ctx);
  }

  @Get(':id/socios')
  socios(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.segmentos.socios(id, ctx.usuario);
  }

  @Get(':id/exportar')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportar(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion, @Res({ passthrough: true }) res: Response) {
    const { nombre, csv } = await this.segmentos.exportar(id, ctx.usuario);
    const archivo = `segmento-${nombre.normalize('NFD').replace(/[^\w-]+/g, '_')}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
    return csv;
  }
}

@Controller('riesgo')
export class RiesgoController {
  constructor(private readonly riesgo: RiesgoService) {}

  @Get()
  @Roles('recepcionista')
  tablero(@Ctx() ctx: ContextoPeticion, @Query('estado') estado?: string, @Query('id_sede') idSede?: string) {
    return this.riesgo.tablero(ctx.usuario, estado || undefined, idSede ? Number(idSede) : undefined);
  }

  @Post(':id/acciones')
  @Roles('recepcionista')
  accion(@Param('id', ParseIntPipe) id: number, @Body() dto: AccionRiesgoDto, @Ctx() ctx: ContextoPeticion) {
    return this.riesgo.accion(id, dto, ctx);
  }

  @Get('config')
  @Roles('administrador')
  config() {
    return this.riesgo.configuraciones();
  }

  @Put('config')
  @Roles('administrador')
  guardarConfig(@Body() dto: ConfigRiesgoDto, @Ctx() ctx: ContextoPeticion) {
    return this.riesgo.guardarConfig(dto, ctx);
  }

  /** Ejecuta la evaluación al momento (además de la automática cada 6 horas). */
  @Post('evaluar')
  @Roles('administrador')
  @HttpCode(200)
  evaluar() {
    return this.riesgo.evaluar();
  }
}

@Controller('campanas')
@Roles('administrador')
export class CampanasController {
  constructor(private readonly campanas: CampanasService) {}

  @Get()
  listar() {
    return this.campanas.listar();
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.campanas.detalle(id);
  }

  @Post()
  crear(@Body() dto: CampanaDto, @Ctx() ctx: ContextoPeticion) {
    return this.campanas.crear(dto, ctx);
  }

  @Post(':id/enviar')
  @HttpCode(200)
  enviar(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.campanas.enviarAhora(id, ctx);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.campanas.cancelar(id, ctx);
  }

  @Post(':id/reintentar')
  @HttpCode(200)
  reintentar(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.campanas.reintentar(id, ctx);
  }
}

@Controller('socios/:id/interacciones')
@Roles('recepcionista', 'entrenador')
export class InteraccionesController {
  constructor(private readonly interacciones: InteraccionesService) {}

  @Get()
  listar(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion, @Query('tipo') tipo?: string) {
    return this.interacciones.listar(id, ctx, tipo || undefined);
  }

  @Post()
  agregar(@Param('id', ParseIntPipe) id: number, @Body() dto: InteraccionDto, @Ctx() ctx: ContextoPeticion) {
    return this.interacciones.agregar(id, dto, ctx);
  }
}

@Module({
  imports: [MembresiasModule],
  controllers: [SegmentosController, RiesgoController, CampanasController, InteraccionesController],
  providers: [SegmentosService, RiesgoService, CampanasService, InteraccionesService],
  exports: [RiesgoService, SegmentosService],
})
export class RetencionModule {}
