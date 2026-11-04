import { Body, Controller, Get, HttpCode, Ip, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import type { ContextoSocio } from '../common/auth/auth.types.js';
import { Public, SocioCtx, SoloSocio } from '../common/auth/decorators.js';
import { GuardarFichaSaludDto } from '../ficha-salud/dto/ficha-salud.dto.js';
import { ActualizarPerfilAppDto } from '../socios/dto/socio.dto.js';
import { AppAuthService } from './app-auth.service.js';
import { AppSocioService } from './app-socio.service.js';
import {
  ActivarCuentaDto,
  ConsentimientoDto,
  DispositivoDto,
  LoginAppDto,
  LogoutDto,
  PeriodoDto,
  PreferenciasDto,
  RecuperarDto,
  RefreshDto,
  RegistrarSesionDto,
  RestablecerDto,
  SincronizarSaludDto,
} from './dto/app.dto.js';

/** Acceso del socio a la app (APP-RF-01, APP-RF-03). */
@Controller('app/auth')
export class AppAuthController {
  constructor(private readonly auth: AppAuthService) {}

  @Public()
  @Post('activar')
  activar(@Body() dto: ActivarCuentaDto, @Ip() ip: string) {
    return this.auth.activar(dto, ip);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginAppDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refrescar(@Body() dto: RefreshDto) {
    return this.auth.refrescar(dto.refresh_token);
  }

  @Public()
  @Post('recuperar')
  @HttpCode(200)
  recuperar(@Body() dto: RecuperarDto) {
    return this.auth.recuperar(dto.correo);
  }

  @Public()
  @Post('restablecer')
  @HttpCode(200)
  restablecer(@Body() dto: RestablecerDto, @Ip() ip: string) {
    return this.auth.restablecer(dto, ip);
  }

  @SoloSocio()
  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: LogoutDto, @SocioCtx() ctx: ContextoSocio) {
    return this.auth.cerrarSesion(dto, ctx);
  }
}

@Controller('app')
@SoloSocio()
export class AppSocioController {
  constructor(private readonly app: AppSocioService) {}

  @Get('perfil')
  perfil(@SocioCtx() ctx: ContextoSocio) {
    return this.app.perfil(ctx);
  }

  @Patch('perfil')
  actualizarPerfil(@Body() dto: ActualizarPerfilAppDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.actualizarPerfil(dto, ctx);
  }

  @Get('membresia')
  membresia(@SocioCtx() ctx: ContextoSocio) {
    return this.app.membresia(ctx);
  }

  @Get('credencial')
  credencial(@SocioCtx() ctx: ContextoSocio) {
    return this.app.credencial(ctx);
  }

  @Get('rutina')
  rutina(@SocioCtx() ctx: ContextoSocio) {
    return this.app.rutina(ctx);
  }

  @Get('sesiones')
  sesiones(@Query() q: PeriodoDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.historial(ctx, q.desde, q.hasta);
  }

  @Post('sesiones')
  registrarSesion(@Body() dto: RegistrarSesionDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.registrarSesion(dto, ctx);
  }

  @Get('progreso')
  progreso(@Query() q: PeriodoDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.progreso(ctx, q.desde, q.hasta);
  }

  @Get('ficha-salud')
  fichaSalud(@SocioCtx() ctx: ContextoSocio) {
    return this.app.fichaSalud(ctx);
  }

  @Post('ficha-salud')
  guardarFichaSalud(@Body() dto: GuardarFichaSaludDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.guardarFichaSalud(dto, ctx);
  }

  @Get('consentimientos')
  consentimientos(@SocioCtx() ctx: ContextoSocio) {
    return this.app.consentimientos(ctx);
  }

  @Post('consentimientos')
  cambiarConsentimiento(@Body() dto: ConsentimientoDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.cambiarConsentimiento(dto, ctx);
  }

  @Post('salud/sincronizar')
  sincronizarSalud(@Body() dto: SincronizarSaludDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.sincronizarSalud(dto, ctx);
  }

  @Get('salud/estado')
  estadoSalud(@SocioCtx() ctx: ContextoSocio) {
    return this.app.estadoSalud(ctx);
  }

  @Post('dispositivos')
  registrarDispositivo(@Body() dto: DispositivoDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.registrarDispositivo(dto.fcm_token, ctx);
  }

  @Get('notificaciones')
  notificaciones(@SocioCtx() ctx: ContextoSocio) {
    return this.app.notificaciones(ctx);
  }

  @Patch('notificaciones/:id/entregada')
  marcarEntregada(@Param('id', ParseIntPipe) id: number, @SocioCtx() ctx: ContextoSocio) {
    return this.app.marcarEntregada(id, ctx);
  }

  @Patch('notificaciones/:id/leida')
  marcarLeida(@Param('id', ParseIntPipe) id: number, @SocioCtx() ctx: ContextoSocio) {
    return this.app.marcarLeida(id, ctx);
  }

  @Get('notificaciones/preferencias')
  preferencias(@SocioCtx() ctx: ContextoSocio) {
    return this.app.preferencias(ctx);
  }

  @Put('notificaciones/preferencias')
  guardarPreferencias(@Body() dto: PreferenciasDto, @SocioCtx() ctx: ContextoSocio) {
    return this.app.guardarPreferencias(dto, ctx);
  }
}
