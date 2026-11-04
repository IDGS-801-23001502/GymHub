import { Module } from '@nestjs/common';
import { AuthModule } from '../common/auth/auth.module.js';
import { FichaSaludModule } from '../ficha-salud/ficha-salud.module.js';
import { MembresiasModule } from '../membresias/membresias.module.js';
import { RutinasModule } from '../rutinas/rutinas.module.js';
import { SociosModule } from '../socios/socios.module.js';
import { AppAuthService } from './app-auth.service.js';
import { AppAuthController, AppSocioController } from './app-socio.controller.js';
import { AppSocioService } from './app-socio.service.js';

/** API de la app móvil del socio (APP-RF-01 a APP-RF-15). */
@Module({
  imports: [AuthModule, SociosModule, MembresiasModule, RutinasModule, FichaSaludModule],
  controllers: [AppAuthController, AppSocioController],
  providers: [AppAuthService, AppSocioService],
})
export class AppSocioModule {}
