import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import type { ObjectId } from 'mongodb';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import {
  ActualizarEjercicioDto,
  CrearEjercicioDto,
  EstadoEjercicioDto,
  ListarEjerciciosDto,
} from './dto/ejercicio.dto.js';
import {
  ActualizarPlantillaDto,
  CrearPlantillaDto,
  DuplicarPlantillaDto,
  EstadoPlantillaDto,
  ListarPlantillasDto,
} from './dto/plantilla.dto.js';
import {
  AsignarRutinaDto,
  FinalizarRutinaDto,
  NuevaVersionDto,
  SeguimientoDto,
} from './dto/rutina.dto.js';
import { EjerciciosService } from './ejercicios.service.js';
import { PlantillasService } from './plantillas.service.js';
import { ParseObjectIdPipe } from './rutinas.constantes.js';
import { RutinasService } from './rutinas.service.js';

@Controller('ejercicios')
@Roles('entrenador')
export class EjerciciosController {
  constructor(private readonly ejercicios: EjerciciosService) {}

  @Get()
  listar(@Query() q: ListarEjerciciosDto) {
    return this.ejercicios.listar(q);
  }

  @Get('grupos')
  grupos() {
    return this.ejercicios.gruposMusculares();
  }

  @Get(':id')
  obtener(@Param('id', ParseObjectIdPipe) id: ObjectId) {
    return this.ejercicios.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearEjercicioDto, @Ctx() ctx: ContextoPeticion) {
    return this.ejercicios.crear(dto, ctx);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseObjectIdPipe) id: ObjectId, @Body() dto: ActualizarEjercicioDto) {
    return this.ejercicios.actualizar(id, dto);
  }

  @Patch(':id/estado')
  cambiarEstado(@Param('id', ParseObjectIdPipe) id: ObjectId, @Body() dto: EstadoEjercicioDto) {
    return this.ejercicios.cambiarEstado(id, dto.activo);
  }
}

@Controller('plantillas')
@Roles('entrenador')
export class PlantillasController {
  constructor(private readonly plantillas: PlantillasService) {}

  @Get()
  listar(@Query() q: ListarPlantillasDto) {
    return this.plantillas.listar(q);
  }

  @Get(':id')
  obtener(@Param('id', ParseObjectIdPipe) id: ObjectId) {
    return this.plantillas.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearPlantillaDto, @Ctx() ctx: ContextoPeticion) {
    return this.plantillas.crear(dto, ctx);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseObjectIdPipe) id: ObjectId, @Body() dto: ActualizarPlantillaDto) {
    return this.plantillas.actualizar(id, dto);
  }

  @Post(':id/duplicar')
  duplicar(
    @Param('id', ParseObjectIdPipe) id: ObjectId,
    @Body() dto: DuplicarPlantillaDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.plantillas.duplicar(id, dto.nombre, ctx);
  }

  @Patch(':id/estado')
  cambiarEstado(@Param('id', ParseObjectIdPipe) id: ObjectId, @Body() dto: EstadoPlantillaDto) {
    return this.plantillas.cambiarEstado(id, dto.activa);
  }
}

@Controller()
@Roles('entrenador')
export class RutinasController {
  constructor(private readonly rutinas: RutinasService) {}

  @Get('socios/:id/rutinas')
  deSocio(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.rutinas.deSocio(id, ctx.usuario);
  }

  @Get('socios/:id/rutinas/sugerencias')
  sugerencias(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.rutinas.sugerencias(id, ctx.usuario);
  }

  @Post('socios/:id/rutinas')
  asignar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarRutinaDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.rutinas.asignar(id, dto, ctx);
  }

  @Get('socios/:id/seguimiento')
  seguimiento(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: SeguimientoDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.rutinas.seguimiento(id, ctx.usuario, q.desde, q.hasta);
  }

  @Get('rutinas/:id/versiones')
  versiones(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.rutinas.versiones(id, ctx.usuario);
  }

  @Get('rutinas/:id/versiones/:numero')
  version(
    @Param('id', ParseIntPipe) id: number,
    @Param('numero', ParseIntPipe) numero: number,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.rutinas.version(id, numero, ctx.usuario);
  }

  @Post('rutinas/:id/versiones')
  nuevaVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NuevaVersionDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.rutinas.nuevaVersion(id, dto, ctx);
  }

  @Post('rutinas/:id/finalizar')
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarRutinaDto,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.rutinas.finalizar(id, dto, ctx);
  }
}
