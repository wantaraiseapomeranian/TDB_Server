// src/schedule/schedule.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schedule } from './entities/schedule.entity';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { Medicine } from '../medicine/entities/medicine.entity';
import { User } from '../users/entities/users.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from 'src/auth/guard/bearer-token.guard';
import { Machine } from 'src/machine/entities/machine.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, Medicine, User, Machine]),
    AuthModule,
    UsersModule,
  ],
  providers: [ScheduleService, AccessTokenGuard],
  controllers: [ScheduleController],
  exports: [ScheduleService],
})
export class ScheduleModule {}
