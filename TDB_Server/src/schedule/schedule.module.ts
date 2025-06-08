// src/schedule/schedule.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from './entities/schedule.entity';
import { DoseHistory } from '../dose-history/dose-history.entity';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { Medicine } from '../medicine/entities/medicine.entity';
import { User } from '../users/entities/users.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from 'src/auth/guard/bearer-token.guard';
import { Machine } from 'src/machine/entities/machine.entity';
import { DoseHistoryModule } from '../dose-history/dose-history.module';
import { ValidationModule } from '../validation/validation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, DoseHistory, Medicine, User, Machine]),
    AuthModule,
    UsersModule,
    DoseHistoryModule,
    ValidationModule,
  ],
  providers: [ScheduleService, AccessTokenGuard],
  controllers: [ScheduleController],
  exports: [ScheduleService],
})
export class ScheduleModule {}
