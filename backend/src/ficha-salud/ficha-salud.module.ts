import { Module } from '@nestjs/common';
import { FichaSaludController } from './ficha-salud.controller.js';
import { FichaSaludService } from './ficha-salud.service.js';

@Module({
  controllers: [FichaSaludController],
  providers: [FichaSaludService],
  exports: [FichaSaludService],
})
export class FichaSaludModule {}
