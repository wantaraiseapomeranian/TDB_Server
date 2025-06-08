import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoseHistoryController } from './dose-history.controller';
import { DoseHistoryService } from './dose-history.service';
import { DoseHistory } from './dose-history.entity';
import { Schedule } from '../schedule/entities/schedule.entity';
import { User } from '../users/entities/users.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DoseHistory, Schedule, User])
  ],
  controllers: [DoseHistoryController],
  providers: [DoseHistoryService],
  exports: [DoseHistoryService],
})
export class DoseHistoryModule {} 