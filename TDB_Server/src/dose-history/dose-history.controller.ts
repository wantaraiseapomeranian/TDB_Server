import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { DoseHistoryService } from './dose-history.service';

interface CompleteDoseDto {
  user_id: string;
  medi_id: string;
  time_of_day: 'morning' | 'afternoon' | 'evening';
  actual_dose: number;
  notes?: string;
}

@Controller('dose-history')
export class DoseHistoryController {
  constructor(private readonly doseHistoryService: DoseHistoryService) {}

  @Post('complete')
  async completeDose(@Body() completeDoseDto: CompleteDoseDto) {
    const { user_id, medi_id, time_of_day, actual_dose, notes } = completeDoseDto;
    
    try {
      const result = await this.doseHistoryService.completeDose(
        user_id,
        medi_id,
        time_of_day,
        actual_dose,
        notes,
      );
      
      return {
        success: true,
        message: '복용 기록이 저장되었습니다.',
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

  @Get('history/:user_id')
  async getDoseHistory(
    @Param('user_id') user_id: string,
    @Query('medi_id') medi_id?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
  ) {
    try {
      const result = await this.doseHistoryService.getDoseHistory(
        user_id,
        medi_id,
        start_date,
        end_date,
      );
      
      return {
        success: true,
        message: '복용 기록을 조회했습니다.',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        data: [],
      };
    }
  }

  @Get('weekly-stats/:user_id')
  async getWeeklyStats(
    @Param('user_id') user_id: string,
    @Query('start_date') start_date: string,
  ) {
    try {
      const result = await this.doseHistoryService.getWeeklyStats(user_id, start_date);
      
      return {
        success: true,
        message: '주간 통계를 조회했습니다.',
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

  @Get('today-progress/:user_id')
  async getTodayProgress(@Param('user_id') user_id: string) {
    try {
      const result = await this.doseHistoryService.getTodayProgress(user_id);
      
      return {
        success: true,
        message: '오늘의 복용 진행률을 조회했습니다.',
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

  @Get('family-stats/:connect')
  async getFamilyStats(@Param('connect') connect: string) {
    try {
      const result = await this.doseHistoryService.getFamilyStats(connect);
      
      return {
        success: true,
        message: '가족 복용 통계를 조회했습니다.',
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

  @Get('family-detailed-stats/:connect')
  async getDetailedFamilyStats(@Param('connect') connect: string) {
    try {
      const result = await this.doseHistoryService.getDetailedFamilyStats(connect);
      
      return {
        success: true,
        message: '상세 가족 복용 통계를 조회했습니다.',
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

  // 🔥 새로 추가: 오늘의 복용 완료 상태 조회 (시간대별)
  @Get('today-status')
  async getTodayCompletionStatus(
    @Query('user_id') userId: string,
    @Query('medi_id') mediId?: string,
    @Query('date') date?: string
  ) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      const result = await this.doseHistoryService.getTodayCompletionStatus(userId, mediId, targetDate);
      return { 
        success: true, 
        message: '오늘의 복용 완료 상태를 조회했습니다.',
        data: result 
      };
    } catch (error) {
      return { 
        success: false, 
        message: error.message,
        data: null 
      };
    }
  }
} 