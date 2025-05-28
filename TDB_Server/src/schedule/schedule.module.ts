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

@Module({
  imports: [TypeOrmModule.forFeature([Schedule, Medicine, User]),
  AuthModule,
  UsersModule,
  ],
  providers: [ScheduleService],
  controllers: [ScheduleController],
})
export class ScheduleModule {}
