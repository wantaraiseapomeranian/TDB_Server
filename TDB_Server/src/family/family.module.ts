// src/family/family.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { User } from '../users/entities/users.entity';
import { AuthModule } from '../auth/auth.module';     
import { UsersModule } from '../users/users.module'; 
import { AccessTokenGuard } from 'src/auth/guard/bearer-token.guard';
@Module({
  imports: [TypeOrmModule.forFeature([User]),
  AuthModule,
  UsersModule,
  ],
  controllers: [FamilyController],
  providers: [FamilyService, AccessTokenGuard],
})
export class FamilyModule {}
