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

// 🔥 임시로 인증 가드 비활성화 (개발/테스트용)
// @UseGuards(AccessTokenGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  /**
   * 1. 약 복용 스케줄 저장
   */
  @Post('medicine/:medicineId')
  async saveMedicineSchedule(
    @Param('medicineId') medicineId: string,
    @Body() body: {
      memberId: string;
      schedule: any;
      totalQuantity?: string;
      doseCount?: string;
      requestUserId?: string;
    },
  ) {
    console.log('Controller에서 받은 body 전체:', JSON.stringify(body, null, 2));
    console.log('medicineId:', medicineId);
    console.log('requestUserId:', body.requestUserId);
    return this.scheduleService.saveSchedule(
      medicineId,
      body.memberId,
      body.schedule,
      body.totalQuantity,
      body.doseCount,
      body.requestUserId,
    );
  }

  /**
   * 2. 약 스케줄 조회
   */
  @Get('medicine/:medicineId')
  async getMedicineSchedule(
    @Param('medicineId') medicineId: string,
    @Query('memberId') memberId: string,
  ) {
    console.log(`[Controller] 스케줄 조회 요청: medicineId=${medicineId}, memberId=${memberId}`);
    
    const schedules = await this.scheduleService.getSchedule(medicineId, memberId);
    
    console.log(`[Controller] 조회된 스케줄 개수: ${schedules.length}`);
    if (schedules.length > 0) {
      console.log(`[Controller] 첫 번째 스케줄 정보:`, {
        user_id: schedules[0].user_id,
        dose: schedules[0].dose,
        day_of_week: schedules[0].day_of_week,
        time_of_day: schedules[0].time_of_day,
        machine_total: (schedules[0] as any)?.machine?.total,
        machine_slot: (schedules[0] as any)?.machine?.slot
      });
    }
    
    // 🔥 프론트엔드가 기대하는 형태로 변환
    const schedule = {
      mon: { morning: false, afternoon: false, evening: false },
      tue: { morning: false, afternoon: false, evening: false },
      wed: { morning: false, afternoon: false, evening: false },
      thu: { morning: false, afternoon: false, evening: false },
      fri: { morning: false, afternoon: false, evening: false },
      sat: { morning: false, afternoon: false, evening: false },
      sun: { morning: false, afternoon: false, evening: false }
    };
    
    // 조회된 스케줄 배열을 객체로 변환
    schedules.forEach((item: any) => {
      if (item.day_of_week && item.time_of_day) {
        schedule[item.day_of_week][item.time_of_day] = true;
      }
    });
    
    console.log(`[Controller] 변환된 스케줄 데이터:`, JSON.stringify(schedule, null, 2));
    
    // 🔥 doseCount 결정 과정 상세 로그 추가
    const firstScheduleDose = schedules[0]?.dose;
    const doseCountString = schedules[0]?.dose?.toString() || '';
    
    console.log(`[Controller] 🔍 doseCount 결정 과정:`);
    console.log(`[Controller]   - schedules.length: ${schedules.length}`);
    console.log(`[Controller]   - schedules[0]?.dose (원본): ${firstScheduleDose} (타입: ${typeof firstScheduleDose})`);
    console.log(`[Controller]   - schedules[0]?.dose?.toString(): "${doseCountString}"`);
    console.log(`[Controller]   - 요청된 memberId: ${memberId}`);
    console.log(`[Controller]   - 첫 번째 스케줄의 user_id: ${schedules[0]?.user_id}`);
    
    // 🔥 모든 스케줄의 복용량이 동일한지 확인
    const allDoses = schedules.map(s => s.dose);
    const uniqueDoses = [...new Set(allDoses)];
    console.log(`[Controller]   - 모든 스케줄의 복용량: [${allDoses.join(', ')}]`);
    console.log(`[Controller]   - 고유 복용량: [${uniqueDoses.join(', ')}]`);
    
    if (uniqueDoses.length > 1) {
      console.log(`[Controller] ⚠️ 경고: 스케줄별로 복용량이 다름!`);
    } else {
      console.log(`[Controller] ✅ 모든 스케줄의 복용량이 동일: ${uniqueDoses[0]}`);
    }
    
    const responseData = {
      data: {
        schedules: schedules, // 원본 배열도 포함
        schedule: schedule,   // 변환된 객체
        totalQuantity: (schedules[0] as any)?.machine?.total?.toString() || '',
        doseCount: doseCountString,  // 🔥 이미 계산된 값 사용
        slot: (schedules[0] as any)?.machine?.slot || 1
      }
    };
    
    console.log(`[Controller] 응답 데이터:`, {
      totalQuantity: responseData.data.totalQuantity,
      doseCount: responseData.data.doseCount,
      slot: responseData.data.slot,
      scheduleCount: schedules.length
    });
    
    return responseData;
  }

  /**
   * 3. 복용 완료 처리
   */
  @Post('completion')
  async completeDose() {
    return this.scheduleService.completeDose();
  }

  /**
   * 4. 오늘 날짜 기준 전체 가족 스케줄 조회
   */
  @Get('today')
  async getTodaySchedule(@Query('connect') connect: string) {
    return this.scheduleService.getTodaySchedule(connect);
  }

  /**
   * 5. 가족별 복용 요약 조회
   */
  @Get('family-summary')
  async getFamilyMedicineSummary(@Query('connect') connect: string) {
    return this.scheduleService.getFamilySummary(connect);
  }

  /**
   * 6. 영양제 스케줄 저장
   */
  @Post('supplement/:supplementId')
  async saveSupplementSchedule(
    @Param('supplementId') supplementId: string,
    @Body() body: {
      memberId: string;
      schedule: any;
      totalQuantity?: string;
      doseCount?: string;
    },
  ) {
    return this.scheduleService.saveSchedule(
      supplementId,
      body.memberId,
      body.schedule,
      body.totalQuantity,
      body.doseCount,
    );
  }

  /**
   * 7. 영양제 스케줄 조회
   */
  @Get('supplement/:supplementId')
  async getSupplementSchedule(
    @Param('supplementId') supplementId: string,
    @Query('memberId') memberId: string,
  ) {
    return this.scheduleService.getSchedule(supplementId, memberId);
  }
}
