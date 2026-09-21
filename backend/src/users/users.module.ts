import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';

/**
 * Users feature module (inventory §4). Services and the `users` model binding
 * are provided by AuthModule this session; only the controller lives here, so
 * later sessions can grow profile logic under the same roof.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
})
export class UsersModule {}
