import { Module } from '@nestjs/common';
import { MembresiasModule } from '../membresias/membresias.module.js';
import { AvisoPrivacidadController, SociosController } from './socios.controller.js';
import { SociosService } from './socios.service.js';

@Module({
  imports: [MembresiasModule],
  controllers: [SociosController, AvisoPrivacidadController],
  providers: [SociosService],
  exports: [SociosService],
})
export class SociosModule {}
