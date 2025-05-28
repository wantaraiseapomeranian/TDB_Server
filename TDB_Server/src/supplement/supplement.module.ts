// src/supplement/supplement.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Medicine } from '../medicine/entities/medicine.entity';
import { SupplementController } from './supplement.controller';
import { SupplementService } from './supplement.service';

@Module({
  imports: [TypeOrmModule.forFeature([Medicine])],
  controllers: [SupplementController],
  providers: [SupplementService],
})
export class SupplementModule {}
