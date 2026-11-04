import { Module } from '@nestjs/common';
import { EjerciciosService } from './ejercicios.service.js';
import { PlantillasService } from './plantillas.service.js';
import { EjerciciosController, PlantillasController, RutinasController } from './rutinas.controller.js';
import { RutinasService } from './rutinas.service.js';

@Module({
  controllers: [EjerciciosController, PlantillasController, RutinasController],
  providers: [EjerciciosService, PlantillasService, RutinasService],
  exports: [RutinasService],
})
export class RutinasModule {}
