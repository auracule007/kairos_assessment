import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StatusTransitionGuard } from '../common/guards/status-transition.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, NotificationsModule, AuthModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, StatusTransitionGuard],
})
export class ApplicationsModule {}
