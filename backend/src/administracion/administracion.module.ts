import { Body, Controller, Get, HttpCode, Module, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import { AdministracionService } from './administracion.service.js';
import {
  ActualizarSedeDto,
  ActualizarUsuarioDto,
  AtenderArcoDto,
  CrearArcoDto,
  CrearSedeDto,
  CrearUsuarioDto,
  FiltroBitacoraDto,
} from './dto/administracion.dto.js';

/** CRM-RF-18: solo el administrador gestiona al personal. */
@Controller('usuarios')
@Roles('administrador')
export class UsuariosController {
  constructor(private readonly admin: AdministracionService) {}

  @Get()
  listar() {
    return this.admin.usuarios();
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto, @Ctx() ctx: ContextoPeticion) {
    return this.admin.crearUsuario(dto, ctx);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarUsuarioDto, @Ctx() ctx: ContextoPeticion) {
    return this.admin.actualizarUsuario(id, dto, ctx);
  }

  @Post(':id/desbloquear')
  @HttpCode(200)
  desbloquear(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.admin.desbloquear(id, ctx);
  }

  @Get(':id/sesiones')
  sesiones(@Param('id', ParseIntPipe) id: number) {
    return this.admin.sesiones(id);
  }

  @Post(':id/sesiones/cerrar')
  @HttpCode(200)
  cerrarTodas(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.admin.revocarSesiones(id, null, ctx);
  }

  @Post(':id/sesiones/:sesion/cerrar')
  @HttpCode(200)
  cerrarUna(
    @Param('id', ParseIntPipe) id: number,
    @Param('sesion', ParseIntPipe) sesion: number,
    @Ctx() ctx: ContextoPeticion,
  ) {
    return this.admin.revocarSesiones(id, sesion, ctx);
  }
}

/** CRM-RF-19: alta y edición de sucursales con horarios. `GET /sedes` (selector) sigue en auth. */
@Controller('sedes-admin')
@Roles('administrador')
export class SedesAdminController {
  constructor(private readonly admin: AdministracionService) {}

  @Get()
  listar(@Ctx() ctx: ContextoPeticion) {
    return this.admin.sedes(ctx);
  }

  @Post()
  crear(@Body() dto: CrearSedeDto, @Ctx() ctx: ContextoPeticion) {
    return this.admin.crearSede(dto, ctx);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarSedeDto, @Ctx() ctx: ContextoPeticion) {
    return this.admin.actualizarSede(id, dto, ctx);
  }
}

/** CRM-RF-20: consulta de solo lectura. */
@Controller('bitacora')
@Roles('administrador')
export class BitacoraController {
  constructor(private readonly admin: AdministracionService) {}

  @Get()
  consultar(@Query() filtros: FiltroBitacoraDto) {
    return this.admin.bitacora(filtros);
  }
}

/** CRM-RNF-02: solicitudes de acceso, rectificación, cancelación u oposición. */
@Controller()
export class ArcoController {
  constructor(private readonly admin: AdministracionService) {}

  @Get('solicitudes-arco')
  @Roles('recepcionista')
  listar(@Ctx() ctx: ContextoPeticion, @Query('estado') estado?: string) {
    return this.admin.solicitudesArco(ctx, estado);
  }

  @Post('socios/:id/solicitudes-arco')
  @Roles('recepcionista')
  crear(@Param('id', ParseIntPipe) id: number, @Body() dto: CrearArcoDto, @Ctx() ctx: ContextoPeticion) {
    return this.admin.crearArco(id, dto, ctx);
  }

  @Patch('solicitudes-arco/:id')
  @Roles('administrador')
  atender(@Param('id', ParseIntPipe) id: number, @Body() dto: AtenderArcoDto, @Ctx() ctx: ContextoPeticion) {
    return this.admin.atenderArco(id, dto, ctx);
  }

  /** Derecho de acceso: expediente completo descifrado. */
  @Get('socios/:id/datos-personales')
  @Roles('administrador')
  exportar(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.admin.exportarDatosSocio(id, ctx);
  }
}

@Module({
  controllers: [UsuariosController, SedesAdminController, BitacoraController, ArcoController],
  providers: [AdministracionService],
})
export class AdministracionModule {}
