import { Global, Module } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service.js';

/** Global: campañas, riesgo y rutinas generan notificaciones. */
@Global()
@Module({
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
