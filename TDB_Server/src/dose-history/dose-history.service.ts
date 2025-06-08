import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DoseHistory, DoseStatus } from './dose-history.entity';
import { Schedule } from '../schedule/entities/schedule.entity';
import { User } from '../users/entities/users.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DoseHistoryService {
  constructor(
    @InjectRepository(DoseHistory)
    private readonly doseHistoryRepository: Repository<DoseHistory>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // 복용 완료 처리
  async completeDose(
    user_id: string,
    medi_id: string,
    time_of_day: 'morning' | 'afternoon' | 'evening',
    actual_dose: number,
    notes?: string,
  ): Promise<DoseHistory> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // 기존 기록이 있는지 확인
      let doseHistory = await this.doseHistoryRepository.findOne({
        where: {
          user_id,
          medi_id,
          time_of_day,
          dose_date: today,
        },
      });

      if (doseHistory) {
        // 기존 기록 업데이트
        doseHistory.actual_dose = actual_dose;
        doseHistory.status = actual_dose === 0 ? DoseStatus.MISSED : DoseStatus.COMPLETED;
        doseHistory.completed_at = new Date();
        if (notes) doseHistory.notes = notes;
      } else {
        // 🔥 실제 사용자의 connect 값 조회
        const user = await this.userRepository.findOne({
          where: { user_id },
          select: ['connect']
        });
        
        if (!user || !user.connect) {
          throw new Error('사용자 정보를 찾을 수 없습니다.');
        }
        
        // 새 기록 생성
        doseHistory = new DoseHistory();
        doseHistory.history_id = uuidv4();
        doseHistory.connect = user.connect; // 🔥 실제 connect 값 사용
        doseHistory.user_id = user_id;
        doseHistory.medi_id = medi_id;
        doseHistory.time_of_day = time_of_day;
        doseHistory.dose_date = today;
        doseHistory.scheduled_dose = actual_dose; // 임시로 같은 값 사용
        doseHistory.actual_dose = actual_dose;
        doseHistory.status = actual_dose === 0 ? DoseStatus.MISSED : DoseStatus.COMPLETED;
        doseHistory.completed_at = new Date();
        if (notes) doseHistory.notes = notes;
      }

      return await this.doseHistoryRepository.save(doseHistory);
    } catch (error) {
      console.error('복용 완료 처리 오류:', error);
      throw new Error('복용 기록 저장에 실패했습니다.');
    }
  }

  // 복용 기록 조회
  async getDoseHistory(
    user_id: string,
    medi_id?: string,
    start_date?: string,
    end_date?: string,
  ): Promise<DoseHistory[]> {
    try {
      const queryBuilder = this.doseHistoryRepository.createQueryBuilder('dh')
        .where('dh.user_id = :user_id', { user_id });

      if (medi_id) {
        queryBuilder.andWhere('dh.medi_id = :medi_id', { medi_id });
      }

      if (start_date && end_date) {
        queryBuilder.andWhere('dh.dose_date BETWEEN :start_date AND :end_date', {
          start_date,
          end_date,
        });
      }

      return await queryBuilder
        .orderBy('dh.dose_date', 'DESC')
        .addOrderBy('dh.time_of_day', 'ASC')
        .getMany();
    } catch (error) {
      console.error('복용 기록 조회 오류:', error);
      return [];
    }
  }

  // 주간 복용 통계
  async getWeeklyStats(user_id: string, start_date: string) {
    try {
      const endDate = new Date(start_date);
      endDate.setDate(endDate.getDate() + 6);
      const end_date = endDate.toISOString().split('T')[0];

      // 해당 주의 복용 기록 조회
      const doseHistories = await this.doseHistoryRepository
        .createQueryBuilder('dh')
        .where('dh.user_id = :user_id', { user_id })
        .andWhere('dh.dose_date BETWEEN :start_date AND :end_date', {
          start_date,
          end_date,
        })
        .getMany();

      const total_completed = doseHistories.filter(h => h.status === DoseStatus.COMPLETED).length;
      const missed_doses = doseHistories.filter(h => h.status === DoseStatus.MISSED).length;
      const total_scheduled = doseHistories.length;
      const completion_rate = total_scheduled > 0 ? 
        Math.round((total_completed / total_scheduled) * 100) : 0;

      return {
        total_scheduled,
        total_completed,
        completion_rate,
        missed_doses,
        daily_stats: [], // 간단한 버전에서는 빈 배열   
      };
    } catch (error) {
      console.error('주간 통계 조회 오류:', error);
      return {
        total_scheduled: 0,
        total_completed: 0,
        completion_rate: 0,
        missed_doses: 0,
        daily_stats: [],
      };
    }
  }

  // 오늘의 복용 진행률
  async getTodayProgress(user_id: string) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const todayHistories = await this.doseHistoryRepository
        .createQueryBuilder('dh')
        .where('dh.user_id = :user_id', { user_id })
        .andWhere('dh.dose_date = :today', { today })
        .getMany();

      const scheduled = todayHistories.length;
      const completed = todayHistories.filter(h => h.status === DoseStatus.COMPLETED).length;
      const missed = todayHistories.filter(h => h.status === DoseStatus.MISSED).length;
      const completion_rate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;

      return {
        scheduled,
        completed,
        missed,
        completion_rate,
      };
    } catch (error) {
      console.error('오늘 진행률 조회 오류:', error);
      return {
        scheduled: 0,
        completed: 0,
        missed: 0,
        completion_rate: 0,
      };
    }
  }

  // 가족 전체 복용 통계
  async getFamilyStats(connect: string) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // 간단한 버전: 해당 connect의 모든 기록 조회
      const histories = await this.doseHistoryRepository
        .createQueryBuilder('dh')
        .where('dh.connect = :connect', { connect })
        .andWhere('dh.dose_date = :today', { today })
        .getMany();

      const total_completed = histories.filter(h => h.status === DoseStatus.COMPLETED).length;
      const total_scheduled = histories.length;
      const completion_rate = total_scheduled > 0 ? 
        Math.round((total_completed / total_scheduled) * 100) : 0;

      return {
        total_scheduled,
        total_completed,
        completion_rate,
        member_count: 0, // 간단한 버전
      };
    } catch (error) {
      console.error('가족 통계 조회 오류:', error);
      return {
        total_scheduled: 0,
        total_completed: 0,
        completion_rate: 0,
        member_count: 0,
      };
    }
  }

  // 🔥 더 상세한 가족 통계 (시간대별, 멤버별 분석)
  async getDetailedFamilyStats(connect: string) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentHour = new Date().getHours();

      // 가족 구성원 정보 조회
      const familyMembers = await this.userRepository
        .createQueryBuilder('u')
        .where('u.connect = :connect', { connect })
        .select(['u.user_id', 'u.name', 'u.role'])
        .getMany();

      // 오늘의 모든 복용 기록 조회
      const todayHistories = await this.doseHistoryRepository
        .createQueryBuilder('dh')
        .where('dh.connect = :connect', { connect })
        .andWhere('dh.dose_date = :today', { today })
        .getMany();

      // 예정된 모든 스케줄 조회 (Schedule 테이블에서)
      const scheduledDoses = await this.scheduleRepository
        .createQueryBuilder('s')
        .innerJoin('s.user', 'u')
        .where('u.connect = :connect', { connect })
        .select(['s.user_id', 's.medi_id', 's.time_of_day', 's.dose'])
        .getMany();

      // 시간대별 분석
      const timeSlots = {
        morning: { start: 6, end: 11, label: '아침' },
        afternoon: { start: 12, end: 17, label: '점심' },
        evening: { start: 18, end: 23, label: '저녁' }
      };

      // 각 시간대별 상세 통계
      const timeBasedStats = Object.entries(timeSlots).map(([timeOfDay, timeInfo]) => {
        const scheduledForTime = scheduledDoses.filter(s => s.time_of_day === timeOfDay);
        const completedForTime = todayHistories.filter(h => 
          h.time_of_day === timeOfDay && h.status === DoseStatus.COMPLETED
        );
        const missedForTime = todayHistories.filter(h => 
          h.time_of_day === timeOfDay && h.status === DoseStatus.MISSED
        );

        // 현재 시간 기준으로 "남은 복용"과 "놓친 복용" 구분
        const isPastTime = currentHour > timeInfo.end;
        const remainingForTime = scheduledForTime.length - completedForTime.length - missedForTime.length;
        
        return {
          timeOfDay,
          label: timeInfo.label,
          scheduled: scheduledForTime.length,
          completed: completedForTime.length,
          missed: isPastTime ? remainingForTime + missedForTime.length : missedForTime.length,
          remaining: isPastTime ? 0 : remainingForTime,
          completionRate: scheduledForTime.length > 0 ? 
            Math.round((completedForTime.length / scheduledForTime.length) * 100) : 0
        };
      });

      // 멤버별 상세 통계
      const memberStats = familyMembers.map(member => {
        const memberScheduled = scheduledDoses.filter(s => s.user_id === member.user_id);
        const memberCompleted = todayHistories.filter(h => 
          h.user_id === member.user_id && h.status === DoseStatus.COMPLETED
        );
        const memberMissed = todayHistories.filter(h => 
          h.user_id === member.user_id && h.status === DoseStatus.MISSED
        );

        const totalScheduled = memberScheduled.length;
        const totalCompleted = memberCompleted.length;
        const totalMissed = memberMissed.length;
        const remaining = totalScheduled - totalCompleted - totalMissed;

        return {
          user_id: member.user_id,
          name: member.name,
          role: member.role,
          scheduled: totalScheduled,
          completed: totalCompleted,
          missed: totalMissed,
          remaining: remaining > 0 ? remaining : 0,
          completionRate: totalScheduled > 0 ? 
            Math.round((totalCompleted / totalScheduled) * 100) : 0
        };
      });

      // 전체 요약
      const totalScheduled = scheduledDoses.length;
      const totalCompleted = todayHistories.filter(h => h.status === DoseStatus.COMPLETED).length;
      const totalMissed = todayHistories.filter(h => h.status === DoseStatus.MISSED).length;
      const totalRemaining = totalScheduled - totalCompleted - totalMissed;

      return {
        summary: {
          total_scheduled: totalScheduled,
          total_completed: totalCompleted,
          total_missed: totalMissed,
          total_remaining: totalRemaining > 0 ? totalRemaining : 0,
          completion_rate: totalScheduled > 0 ? 
            Math.round((totalCompleted / totalScheduled) * 100) : 0,
          member_count: familyMembers.length
        },
        timeBasedStats,
        memberStats,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('상세 가족 통계 조회 오류:', error);
      return {
        summary: {
          total_scheduled: 0,
          total_completed: 0,
          total_missed: 0,
          total_remaining: 0,
          completion_rate: 0,
          member_count: 0
        },
        timeBasedStats: [],
        memberStats: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // 🔥 새로 추가: 오늘의 시간대별 복용 완료 상태 조회
  async getTodayCompletionStatus(user_id: string, medi_id?: string, date?: string) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const queryBuilder = this.doseHistoryRepository
        .createQueryBuilder('dh')
        .where('dh.user_id = :user_id', { user_id })
        .andWhere('dh.dose_date = :date', { date: targetDate });

      if (medi_id) {
        queryBuilder.andWhere('dh.medi_id = :medi_id', { medi_id });
      }

      const histories = await queryBuilder.getMany();

      if (medi_id) {
        // 특정 약물의 시간대별 완료 상태
        const status = {
          morning: histories.some(h => h.time_of_day === 'morning' && h.status === DoseStatus.COMPLETED),
          afternoon: histories.some(h => h.time_of_day === 'afternoon' && h.status === DoseStatus.COMPLETED),
          evening: histories.some(h => h.time_of_day === 'evening' && h.status === DoseStatus.COMPLETED)
        };
        
        return {
          medi_id,
          date: targetDate,
          completion_status: status
        };
      } else {
        // 모든 약물의 시간대별 완료 상태 (약물별로 그룹화)
        const statusByMedicine: Record<string, any> = {};
        
        histories.forEach(history => {
          if (!statusByMedicine[history.medi_id]) {
            statusByMedicine[history.medi_id] = {
              medi_id: history.medi_id,
              morning: false,
              afternoon: false,
              evening: false
            };
          }
          
          if (history.status === DoseStatus.COMPLETED) {
            statusByMedicine[history.medi_id][history.time_of_day] = true;
          }
        });
        
        return Object.values(statusByMedicine);
      }
    } catch (error) {
      console.error('오늘 복용 완료 상태 조회 오류:', error);
      return medi_id ? { 
        medi_id, 
        date: date || new Date().toISOString().split('T')[0],
        completion_status: { morning: false, afternoon: false, evening: false }
      } : [];
    }
  }
} 