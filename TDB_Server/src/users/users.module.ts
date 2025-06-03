// src/users/users.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/users.entity';
import { Machine } from '../machine/entities/machine.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Machine])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService], // AuthModule에서 사용할 수 있도록 export
})
export class UsersModule {}
