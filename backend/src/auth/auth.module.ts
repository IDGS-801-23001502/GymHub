import { Module } from '@nestjs/common';
import { AuthModule as AuthCommonModule } from '../common/auth/auth.module.js';
import { AuthController, SedesController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/** Login del personal y catálogo de sedes del usuario. */
@Module({
  imports: [AuthCommonModule],
  controllers: [AuthController, SedesController],
  providers: [AuthService],
})
export class LoginModule {}
