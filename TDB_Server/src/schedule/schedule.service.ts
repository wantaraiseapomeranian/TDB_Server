import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Schedule } from './entities/schedule.entity';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/users.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ✅ 1. 스케줄 저장
  async saveSchedule(
    medicineId: string,
    memberId: string,
    scheduleObj: any,
    totalQuantity?: string,
    doseCount?: string,
  ) {
    const schedule_id = `${medicineId}_${memberId}`;

    const days: string[] = [];
    const times: Set<string> = new Set();

    for (const [day, timeObj] of Object.entries(scheduleObj)) {
      days.push(day);
      if (typeof timeObj === 'object' && timeObj !== null) {
        Object.entries(timeObj).forEach(([time, val]) => {
          if (val) times.add(time);
        });
      }
    }

    const existing = await this.scheduleRepo.findOne({ where: { schedule_id } });

    const schedule = this.scheduleRepo.create({
      schedule_id,
      user_id: memberId,
      medi_id: medicineId,
      day_of_week: days,
      time_of_day: [...times],
      dose: doseCount ? Number(doseCount) : 1,
    });

    if (existing) {
      await this.scheduleRepo.update(schedule_id, schedule);
      return { success: true, updated: true };
    }

    await this.scheduleRepo.save(schedule);
    return { success: true, created: true };
  }

  // ✅ 2. 스케줄 조회
  async getSchedule(medicineId: string, memberId: string) {
    const schedule_id = `${medicineId}_${memberId}`;
    const schedule = await this.scheduleRepo.findOne({ where: { schedule_id } });

    if (!schedule) {
      throw new NotFoundException('스케줄을 찾을 수 없습니다.');
    }

    return schedule;
  }

  // ✅ 3. 복용 완료 처리 (기록은 추후 확장 가능)
  async completeDose(medicineId: string, time: string) {
    return {
      success: true,
      completedAt: new Date(),
      medicineId,
      time,
      completedBy: '임시 사용자',
    };
  }

  // ✅ 4. 오늘 스케줄 조회
  async getTodaySchedule() {
    const today = new Date();
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const day = dayMap[today.getDay()];

    const schedules = await this.scheduleRepo
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.user', 'user')
      .leftJoinAndSelect('schedule.medicine', 'medicine')
      .where(`FIND_IN_SET(:day, schedule.day_of_week)`, { day })
      .getMany();

    return {
      date: today.toISOString().split('T')[0],
      schedules: schedules.map((s) => ({
        medicineId: s.medi_id,
        medicineName: s.medicine?.name,
        memberName: s.user?.name,
        time: s.time_of_day,
        dosage: s.dose.toString(),
        isCompleted: false,
        type: s.medicine?.type ?? 'medicine',
      })),
    };
  }

  // ✅ 5. 가족 요약 조회
  async getFamilySummary() {
    const users = await this.userRepo.find({
      where: { role: 'child' },
      relations: ['schedules'],
    });

    return users.map((user) => {
      const total = user.schedules?.length || 0;
      return {
        memberId: user.user_id,
        memberName: user.name,
        activeMedicines: total,
        todayCompleted: 0,
        todayTotal: total,
        upcomingRefills: 0,
      };
    });
  }
}
