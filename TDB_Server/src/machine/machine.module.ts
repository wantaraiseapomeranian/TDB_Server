// src/machine/machine.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispenserService } from './machine.service';
import { MachineController } from './machine.controller';
import { User } from '../users/entities/users.entity';
import { Schedule } from '../schedule/entities/schedule.entity';
import { Medicine } from '../medicine/entities/medicine.entity';
import { Machine } from './entities/machine.entity';
import { AuthModule } from 'src/auth/auth.module'; 
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Schedule, Medicine, Machine]),
    AuthModule,
    UsersModule,
  ],
  controllers: [MachineController],
  providers: [DispenserService],
})
export class MachineModule {}
