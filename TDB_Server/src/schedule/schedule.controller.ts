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
import { AgeValidationService } from '../validation/age-validation.service';

// 🔥 임시로 인증 가드 비활성화 (개발/테스트용)
// @UseGuards(AccessTokenGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly ageValidationService: AgeValidationService,
  ) {}

  /**
   * 🔥 새로 추가: 클라이언트용 즉시 연령 검증
   */
  @Get('validate-age/:userId')
  async validateUserAge(@Param('userId') userId: string) {
    console.log(`🔍 [Controller] 클라이언트 연령 검증: userId=${userId}`);
    
    try {
      // Users 테이블에서 나이 정보 조회
      const user = await this.scheduleService['userRepo'].findOne({
        where: { user_id: userId },
        select: ['user_id', 'age', 'name']
      });
      
      if (!user) {
        return {
          success: false,
          error: 'USER_NOT_FOUND',
          message: '사용자를 찾을 수 없습니다.'
        };
      }
      
      if (!user.age) {
        return {
          success: true,
          data: {
            hasAge: false,
            message: '나이 정보가 없습니다.',
            validation: {
              isChild: false,
              requiresParentalSupervision: false,
              contraindicatedAge: false,
              dosageMultiplier: 1
            }
          }
        };
      }
      
      // 기본 연령 검증
      const validation = this.ageValidationService.getBasicAgeValidation(user.age);
      
      return {
        success: true,
        data: {
          hasAge: true,
          age: user.age,
          userName: user.name,
          validation
        }
      };
      
    } catch (error) {
      console.error('🚨 [Controller] 연령 검증 오류:', error);
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: '연령 검증 중 오류가 발생했습니다.'
      };
    }
  }

  /**
   * 🔥 새로 추가: 현재 시간 기준 복용량 조회
   */
  @Get('current-dose/:medicineId/:userId')
  async getCurrentDose(
    @Param('medicineId') medicineId: string,
    @Param('userId') userId: string,
  ) {
    console.log(`🔍 [Controller] 현재 시간 복용량 조회: medicineId=${medicineId}, userId=${userId}`);
    
    const result = await this.scheduleService.getCurrentDose(medicineId, userId);
    
    console.log(`🔍 [Controller] 현재 복용량 조회 결과:`, result);
    
    return {
      success: true,
      data: result
    };
  }

  /**
   * 🔥 새로 추가: 하루 전체 복용 스케줄 조회
   */
  @Get('daily/:medicineId/:userId')
  async getDailySchedule(
    @Param('medicineId') medicineId: string,
    @Param('userId') userId: string,
    @Query('date') date?: string,
  ) {
    console.log(`🔍 [Controller] 하루 스케줄 조회: medicineId=${medicineId}, userId=${userId}, date=${date}`);
    
    const result = await this.scheduleService.getDailySchedule(medicineId, userId, date);
    
    console.log(`🔍 [Controller] 하루 스케줄 조회 결과:`, result);
    
    return {
      success: true,
      data: result
    };
  }

  /**
   * 🔥 V3: 매트릭스 뷰 스케줄 저장 (요일×시간별 개별 복용량 지원)
   */
  @Post(':medicineId/:memberId')
  async saveMedicineScheduleV3(
    @Param('medicineId') medicineId: string,
    @Param('memberId') memberId: string,
    @Body() body: {
      schedule_items: Array<{
        day_of_week: string;
        time_of_day: string;
        dose_count: number;
        enabled: boolean;
      }>;
      total_quantity?: string;
      version: string;
      matrix_enabled: boolean;
      request_user_id?: string;  // 🔥 요청자 정보 추가
    },
  ) {
    console.log(`🔥 [V3 Controller] 매트릭스 스케줄 저장: ${medicineId}/${memberId}`);
    console.log(`🔥 [V3 Controller] Body:`, JSON.stringify(body, null, 2));
    
    if (body.version === 'v3' && body.matrix_enabled) {
      return this.scheduleService.saveMatrixSchedule(
        medicineId,
        memberId,
        body.schedule_items,
        body.total_quantity || '1',
        body.request_user_id  // 🔥 요청자 정보 전달
      );
    } else {
      throw new Error('V3 매트릭스 형식이 아닙니다.');
    }
  }

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
      morningDose?: number;
      afternoonDose?: number;
      eveningDose?: number;
    },
  ) {
    console.log('Controller에서 받은 body 전체:', JSON.stringify(body, null, 2));
    console.log('medicineId:', medicineId);
    console.log('requestUserId:', body.requestUserId);
    
    // 🔥 시간대별 복용량 처리
    console.log(`[Controller] 🔍 받은 시간대별 복용량:`, {
      morningDose: body.morningDose,
      afternoonDose: body.afternoonDose,
      eveningDose: body.eveningDose,
      doseCount: body.doseCount
    });
    
    return this.scheduleService.saveScheduleWithTimeDoses(
      medicineId,
      body.memberId,
      body.schedule,
      body.totalQuantity,
      body.doseCount,
      body.requestUserId,
      {
        morningDose: body.morningDose,
        afternoonDose: body.afternoonDose,
        eveningDose: body.eveningDose
      }
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
    
    // 🔥 빈 배열인 경우 기본값으로 응답
    if (schedules.length === 0) {
      console.log(`[Controller] 스케줄이 없어서 기본값 반환`);
      
      const defaultSchedule = {
        mon: { morning: false, afternoon: false, evening: false },
        tue: { morning: false, afternoon: false, evening: false },
        wed: { morning: false, afternoon: false, evening: false },
        thu: { morning: false, afternoon: false, evening: false },
        fri: { morning: false, afternoon: false, evening: false },
        sat: { morning: false, afternoon: false, evening: false },
        sun: { morning: false, afternoon: false, evening: false }
      };
      
      return {
        data: {
          schedules: [], // 빈 배열
          schedule: defaultSchedule, // 기본 스케줄
          totalQuantity: '',
          morningDose: 0,
          afternoonDose: 0,
          eveningDose: 0,
          doseCount: '0',
          slot: 1
        }
      };
    }
    
    // 🔥 스케줄이 있는 경우 기존 로직 수행
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
    
    // 🔥 시간대별 복용량 추출
    const timeDoses = {
      morningDose: 0,
      afternoonDose: 0,
      eveningDose: 0
    };
    
    // 조회된 스케줄 배열을 객체로 변환하고 시간대별 복용량 수집
    schedules.forEach((item: any) => {
      if (item.day_of_week && item.time_of_day) {
        schedule[item.day_of_week][item.time_of_day] = true;
        
        // 🔥 시간대별 복용량 설정 (첫 번째로 발견한 값 사용)
        if (item.time_of_day === 'morning' && timeDoses.morningDose === 0) {
          timeDoses.morningDose = item.dose || 0;
        } else if (item.time_of_day === 'afternoon' && timeDoses.afternoonDose === 0) {
          timeDoses.afternoonDose = item.dose || 0;
        } else if (item.time_of_day === 'evening' && timeDoses.eveningDose === 0) {
          timeDoses.eveningDose = item.dose || 0;
        }
      }
    });
    
    console.log(`[Controller] 변환된 스케줄 데이터:`, JSON.stringify(schedule, null, 2));
    
    // 🔥 시간대별 복용량 로그
    console.log(`[Controller] 🔍 시간대별 복용량:`);
    console.log(`[Controller]   - 아침: ${timeDoses.morningDose}정`);
    console.log(`[Controller]   - 점심: ${timeDoses.afternoonDose}정`);
    console.log(`[Controller]   - 저녁: ${timeDoses.eveningDose}정`);
    
    // 🔥 모든 스케줄의 복용량이 동일한지 확인
    const allDoses = schedules.map(s => s.dose);
    const uniqueDoses = [...new Set(allDoses)];
    console.log(`[Controller]   - 모든 스케줄의 복용량: [${allDoses.join(', ')}]`);
    console.log(`[Controller]   - 고유 복용량: [${uniqueDoses.join(', ')}]`);
    
    if (uniqueDoses.length > 1) {
      console.log(`[Controller] ⚠️ 시간대별로 복용량이 다름 - 시간대별 반환`);
    } else {
      console.log(`[Controller] ✅ 모든 스케줄의 복용량이 동일: ${uniqueDoses[0]}`);
    }
    
    const responseData = {
      data: {
        schedules: schedules, // 원본 배열도 포함
        schedule: schedule,   // 변환된 객체
        totalQuantity: (schedules[0] as any)?.machine?.total?.toString() || '',
        // 🔥 시간대별 복용량 개별 반환
        morningDose: timeDoses.morningDose,
        afternoonDose: timeDoses.afternoonDose,
        eveningDose: timeDoses.eveningDose,
        // 🔥 하위 호환성을 위해 doseCount도 유지 (가장 많이 사용되는 복용량)
        doseCount: Math.max(timeDoses.morningDose, timeDoses.afternoonDose, timeDoses.eveningDose).toString(),
        slot: (schedules[0] as any)?.machine?.slot || 1
      }
    };
    
    console.log(`[Controller] 응답 데이터:`, {
      totalQuantity: responseData.data.totalQuantity,
      morningDose: responseData.data.morningDose,
      afternoonDose: responseData.data.afternoonDose,
      eveningDose: responseData.data.eveningDose,
      doseCount: responseData.data.doseCount,
      slot: responseData.data.slot,
      scheduleCount: schedules.length
    });
    
    return responseData;
  }

  /**
   * 3. 복용 완료 처리 (실제 DB 저장)
   */
  @Post('completion')
  async completeDose(
    @Body() body: {
      medicineId: string;
      userId: string;
      timeOfDay: 'morning' | 'afternoon' | 'evening';
      actualDose?: number;
      notes?: string;
    }
  ) {
    console.log(`🔥 [Controller] 복용 완료 요청:`, body);
    
    const result = await this.scheduleService.completeDose(
      body.medicineId,
      body.userId,
      body.timeOfDay,
      body.actualDose,
      body.notes
    );
    
    return {
      success: result.success,
      message: result.message
    };
  }

  /**
   * 🔥 새로 추가: 복용 기록 조회
   */
  @Get('dose-history/:medicineId/:userId')
  async getDoseHistory(
    @Param('medicineId') medicineId: string,
    @Param('userId') userId: string,
    @Query('date') date?: string,
  ) {
    console.log(`🔍 [Controller] 복용 기록 조회: medicineId=${medicineId}, userId=${userId}, date=${date}`);
    
    const result = await this.scheduleService.getDoseHistory(medicineId, userId, date);
    
    return {
      success: true,
      data: result
    };
  }

  /**
   * 🔥 새로 추가: 주간 통계 조회
   */
  @Get('weekly-stats/:userId')
  async getWeeklyStats(
    @Param('userId') userId: string,
    @Query('medicineId') medicineId?: string,
  ) {
    console.log(`🔍 [Controller] 주간 통계 조회: userId=${userId}, medicineId=${medicineId}`);
    
    const result = await this.scheduleService.getWeeklyStats(userId, medicineId);
    
    return {
      success: true,
      data: result
    };
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
