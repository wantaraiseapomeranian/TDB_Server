// src/supplement/supplement.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Medicine } from '../medicine/entities/medicine.entity';
import { Machine } from '../machine/entities/machine.entity';
import { User } from '../users/entities/users.entity';
import { SupplementController } from './supplement.controller';
import { SupplementService } from './supplement.service';
import { AuthModule } from 'src/auth/auth.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Medicine, Machine, User]), AuthModule, UsersModule],
  controllers: [SupplementController],
  providers: [SupplementService],
  exports: [SupplementService],
})
export class SupplementModule {}
