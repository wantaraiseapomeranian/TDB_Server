import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DispenserService } from './machine.service'; // ✅ 수정됨
import { AccessTokenGuard } from '../auth/guard/bearer-token.guard';

@Controller('machine')
// @UseGuards(AccessTokenGuard) // 개발 중이면 주석처리해도 됨
export class MachineController {
  constructor(private readonly dispenserService: DispenserService) {}

  // 전체 사용자 목록 조회
  @Get('users')
  getAllUsers() {
    return this.dispenserService.findAllUsers();
  }

  // 전체 약/영양제 목록 조회
  @Get('medicine')
  getAllMedicine() {
    return this.dispenserService.findAllMedicine();
  }

  // 전체 복용 스케줄 조회
  @Get('schedule')
  getAllSchedules() {
    return this.dispenserService.findAllSchedule();
  }

  // 등록된 기기 목록 조회
  @Get('list')
  getAllMachines() {
    return this.dispenserService.findAllMachine();
  }

  // UID(RFID) 기반 사용자 또는 기기 확인
  @Get('verify/:uid')
  verifyUid(@Param('uid') uid: string) {
    return this.dispenserService.verifyUid(uid);
  }

  // UID 기반, 오늘의 스케줄 조회
  @Get('today/:uid')
  getTodaySchedule(@Param('uid') uid: string) {
    return this.dispenserService.getTodayScheduleByUid(uid);
  }

  // 기기 ID 기준, 약 잔여량 및 슬롯 정보 조회
  @Get('remain/:m_uid')
  getMedicineRemain(@Param('m_uid') m_uid: string) {
    return this.dispenserService.getMedicineRemainByMachine(m_uid);
  }

  // 기기 ID 기준, 연동된 사용자 목록 조회
  @Get('users-by-machine/:m_uid')
  getUsersByMachine(@Param('m_uid') m_uid: string) {
    return this.dispenserService.getUsersByMachineId(m_uid);
  }

  // 기기 ID 기준, 특정 날짜의 복용 스케줄 요약 조회
  @Get('schedule-by-date/:m_uid')
  getScheduleByDate(
    @Param('m_uid') m_uid: string,
    @Query('date') date: string,
  ) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    return this.dispenserService.getSchedulesByMachineAndDate(
      m_uid,
      targetDate,
    );
  }

  // connect 기준, 가족 기기 상태 조회 (대시보드용)
  @Get('family-status/:connect')
  async getFamilyMachineStatus(@Param('connect') connect: string) {
    try {
      const result = await this.dispenserService.getMachineStatusByConnect(connect);
      
      return {
        success: true,
        message: '가족 기기 상태를 조회했습니다.',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        data: null,
      };
    }
  }
}
