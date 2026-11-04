import { Module } from '@nestjs/common';
import { MembresiasController } from './membresias.controller.js';
import { MembresiasService } from './membresias.service.js';

@Module({
  controllers: [MembresiasController],
  providers: [MembresiasService],
  exports: [MembresiasService],
})
export class MembresiasModule {}
