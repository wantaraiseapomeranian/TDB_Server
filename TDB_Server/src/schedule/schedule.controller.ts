import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { AccessTokenGuard } from '../auth/guard/bearer-token.guard';

@Controller()
@UseGuards(AccessTokenGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // 1. 약 복용 스케줄 저장
  @Post('medicine/schedule/:medicineId')
  async saveSchedule(
    @Param('medicineId') medicineId: string,
    @Body('memberId') memberId: string,
    @Body('schedule') schedule: any,
    @Body('totalQuantity') totalQuantity?: string,
    @Body('doseCount') doseCount?: string,
  ) {
    return this.scheduleService.saveSchedule(
      medicineId,
      memberId,
      schedule,
      totalQuantity,
      doseCount,
    );
  }

  // 2. 스케줄 조회
  @Get('medicine/schedule/:medicineId')
  async getSchedule(
    @Param('medicineId') medicineId: string,
    @Query('memberId') memberId: string,
  ) {
    return this.scheduleService.getSchedule(medicineId, memberId);
  }

  // 3. 복용 완료 처리
  @Post('dashboard/completion')
  async completeDose(
    @Body('medicineId') medicineId: string,
    @Body('time') time: 'morning' | 'lunch' | 'dinner',
  ) {
    return this.scheduleService.completeDose(medicineId, time);
  }

  // 4. 오늘 스케줄 조회
  @Get('dashboard/today')
  async getTodaySchedule() {
    return this.scheduleService.getTodaySchedule();
  }

  // 5. 가족별 복용 요약 조회
  @Get('dashboard/family-summary')
  async getFamilyMedicineSummary() {
    return this.scheduleService.getFamilySummary();
  }

  // 6. 영양제 스케줄 저장 (추가)
  @Post('supplement/schedule/:supplementId')
  async saveSupplementSchedule(
    @Param('supplementId') supplementId: string,
    @Body('memberId') memberId: string,
    @Body('schedule') schedule: any,
    @Body('totalQuantity') totalQuantity?: string,
    @Body('doseCount') doseCount?: string,
  ) {
    return this.scheduleService.saveSchedule(
      supplementId,
      memberId,
      schedule,
      totalQuantity,
      doseCount,
    );
  }

  // 7. 영양제 스케줄 조회 (추가)
  @Get('supplement/schedule/:supplementId')
  async getSupplementSchedule(
    @Param('supplementId') supplementId: string,
    @Query('memberId') memberId: string,
  ) {
    return this.scheduleService.getSchedule(supplementId, memberId);
  }
}
