// src/medicine/medicine.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicineController } from './medicine.controller';
import { MedicineService } from './medicine.service';
import { Medicine } from './entities/medicine.entity';
import { Machine } from '../machine/entities/machine.entity';
import { User } from '../users/entities/users.entity';
import { Schedule } from 'src/schedule/entities/schedule.entity';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from 'src/auth/guard/bearer-token.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Medicine, Machine, User, Schedule]),
    ConfigModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [MedicineController],
  providers: [MedicineService, AccessTokenGuard],
  exports: [MedicineService],
})
export class MedicineModule {}
