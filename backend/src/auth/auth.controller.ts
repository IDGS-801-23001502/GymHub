import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Public } from '../common/auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { filtroSedes } from '../common/auth/sedes.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip ?? null);
  }

  @Get('me')
  perfil(@Ctx() ctx: ContextoPeticion) {
    return this.auth.perfil(ctx.usuario);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Ctx() ctx: ContextoPeticion) {
    return this.auth.logout(ctx.usuario);
  }
}

/** Sedes en las que el usuario puede operar (selectores del CRM). */
@Controller('sedes')
export class SedesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  listar(@Ctx() ctx: ContextoPeticion) {
    return this.prisma.sede.findMany({
      where: { activa: true, id_sede: filtroSedes(ctx.usuario) },
      select: { id_sede: true, nombre: true, direccion: true, telefono: true },
      orderBy: { nombre: 'asc' },
    });
  }
}
