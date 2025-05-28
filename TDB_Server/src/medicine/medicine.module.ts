// src/medicine/medicine.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicineController } from './medicine.controller';
import { MedicineService } from './medicine.service';
import { Medicine } from './entities/medicine.entity';
import { Schedule } from 'src/schedule/entities/schedule.entity';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';     
import { UsersModule } from '../users/users.module';   

@Module({
  imports: [TypeOrmModule.forFeature([Medicine, Schedule]),
  ConfigModule, 
  AuthModule,
  UsersModule,
],
  controllers: [MedicineController],
  providers: [MedicineService],
})
export class MedicineModule {}
