import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdministracionModule } from './administracion/administracion.module.js';
import { AnaliticaModule } from './analitica/analitica.module.js';
import { AppController } from './app.controller.js';
import { AsistenciaModule } from './asistencia/asistencia.module.js';
import { NotificacionesModule } from './notificaciones/notificaciones.module.js';
import { RetencionModule } from './retencion/retencion.module.js';
import { ArchivosModule } from './archivos/archivos.module.js';
import { AppSocioModule } from './app-socio/app-socio.module.js';
import { AppService } from './app.service.js';
import { LoginModule } from './auth/auth.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { AuthModule } from './common/auth/auth.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { MailModule } from './common/mail/mail.module.js';
import { FichaSaludModule } from './ficha-salud/ficha-salud.module.js';
import { MembresiasModule } from './membresias/membresias.module.js';
import { MongoModule } from './mongo/mongo.module.js';
import { PagosModule } from './pagos/pagos.module.js';
import { PlanesModule } from './planes/planes.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RutinasModule } from './rutinas/rutinas.module.js';
import { SociosModule } from './socios/socios.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MongoModule,
    CryptoModule,
    MailModule,
    AuditModule,
    AuthModule,
    LoginModule,
    // Módulo: Socios y Membresías (CRM-RF-01 a CRM-RF-05)
    SociosModule,
    PlanesModule,
    MembresiasModule,
    PagosModule,
    FichaSaludModule,
    // Módulo: Rutinas y Entrenamiento (CRM-RF-06 a CRM-RF-10)
    RutinasModule,
    // Módulo: Asistencia (CRM-RF-11)
    AsistenciaModule,
    // Módulo: Retención y Comunicación (CRM-RF-12 a CRM-RF-15)
    NotificacionesModule,
    RetencionModule,
    // Módulo: Analítica y Reportes (CRM-RF-16, CRM-RF-17)
    AnaliticaModule,
    // Módulo: Usuarios, Sedes y Seguridad (CRM-RF-18 a CRM-RF-20, CRM-RNF-02)
    AdministracionModule,
    ArchivosModule,
    // App móvil del socio (APP-RF-01 a APP-RF-15)
    AppSocioModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
