// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/users.entity';
import { MedicineModule } from './medicine/medicine.module';
import { ScheduleModule } from './schedule/schedule.module';
import { FamilyModule } from './family/family.module';
import { Schedule } from './schedule/entities/schedule.entity';
import { Medicine } from './medicine/entities/medicine.entity';
import { SupplementModule } from './supplement/supplement.module';
import { MachineModule } from './machine/machine.module';
import { Machine } from './machine/entities/machine.entity';
import { DoseHistoryModule } from './dose-history/dose-history.module';
import { DoseHistory } from './dose-history/dose-history.entity';

@Module({
  imports: [
    // .env 파일을 전역 설정
    ConfigModule.forRoot({ isGlobal: true }),

    // TypeORM 설정
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        entities: [User, Schedule, Medicine, Machine, DoseHistory], // 또는 __dirname + '/../**/*.entity{.ts,.js}'
        synchronize: false, // 개발 중엔 true (운영 시 false 권장)
        charset: 'utf8mb4',
      }),
    }),

    // 기타 모듈
    AuthModule,
    UsersModule,
    MedicineModule,
    ScheduleModule,
    FamilyModule,
    SupplementModule,
    MachineModule,
    DoseHistoryModule,
  ],
})
export class AppModule {}
