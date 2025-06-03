import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './entities/schedule.entity';
import { User } from 'src/users/entities/users.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';
import { Machine } from 'src/machine/entities/machine.entity';
import { UserRole } from 'src/users/entities/users.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
  ) {}

  // 1. 스케줄 저장
  async saveSchedule(
    medicineId: string,
    memberId: string,
    scheduleData: any, // Record<string, unknown>에서 any로 변경
    totalQuantity?: string,
    doseCount?: string,
    requestUserId?: string, // 🔥 실제 요청한 사용자 ID 추가
  ) {
    console.log('저장할 스케줄 데이터:', { medicineId, memberId, scheduleData, totalQuantity, doseCount, requestUserId });

    // 배열 형태의 스케줄 데이터 처리
    if (Array.isArray(scheduleData)) {
      console.log('배열 형태의 스케줄 데이터:', scheduleData);
      
      const user = await this.userRepo.findOne({ where: { user_id: memberId } });
      if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
      if (!user.connect) throw new NotFoundException('사용자의 connect 정보가 없습니다.');

      // 🔥 실제 요청한 사용자 정보 조회 (부모가 자식 관리하는지 확인용)
      let requestUser: User | null = null;
      if (requestUserId && requestUserId !== memberId) {
        requestUser = await this.userRepo.findOne({ where: { user_id: requestUserId } });
        console.log(`[ScheduleService] 요청자와 대상자가 다름 - 요청자: ${requestUserId}, 대상자: ${memberId}`);
        console.log(`[ScheduleService] 요청자 정보:`, requestUser ? { role: requestUser.role, name: requestUser.name } : '없음');
      }

      const medicine = await this.medicineRepo.findOne({
        where: { medi_id: medicineId, connect: user.connect! },
      });
      if (!medicine) throw new NotFoundException('약 정보를 찾을 수 없습니다.');

      // 기존 스케줄 삭제
      await this.scheduleRepo.delete({
        user_id: user.user_id,
        medi_id: medicine.medi_id,
      });

      // 🔥 총량/복용량 업데이트 - Machine 테이블에서 해당 약의 슬롯 찾기
      // totalQuantity가 명시적으로 전달되고 유효한 값일 때만 Machine 테이블 업데이트
      // 🚨 중요: 부모가 자식 스케줄을 관리할 때는 totalQuantity 업데이트 금지
      const isParentManagingChild = requestUser && requestUser.role === UserRole.PARENT && requestUser.user_id !== memberId;
      
      if (totalQuantity && totalQuantity.trim() !== '' && !isNaN(Number(totalQuantity)) && Number(totalQuantity) > 0) {
        console.log(`[ScheduleService] Machine 테이블 업데이트 시도 - totalQuantity: ${totalQuantity}, user_role: ${user.role}, memberId: ${memberId}`);
        console.log(`[ScheduleService] 요청자 분석: isParentManagingChild=${isParentManagingChild}`);
        
        if (isParentManagingChild) {
          console.log(`[ScheduleService] 🚨 부모가 자식 스케줄 관리 중 - Machine 테이블 업데이트 건너뜀`);
        } else {
          console.log(`[ScheduleService] ✅ 본인 스케줄 관리 - Machine 테이블 업데이트 진행`);
          
        let machineRecord = await this.machineRepo.findOne({
          where: { 
            medi_id: medicine.medi_id,
            owner: user.connect! 
          }
        });
        
        if (machineRecord) {
          // 기존 Machine 레코드 업데이트
          machineRecord.total = Number(totalQuantity);
          machineRecord.remain = Number(totalQuantity);
          await this.machineRepo.save(machineRecord);
          console.log(`[ScheduleService] 기존 Machine 업데이트: total=${machineRecord.total}, remain=${machineRecord.remain}`);
        } else {
          // 🔥 Machine 레코드가 없으면 새로 생성
          console.log(`[ScheduleService] Machine 레코드가 없어서 새로 생성: medi_id=${medicine.medi_id}, owner=${user.connect}`);
          
          // 부모 계정의 m_uid 조회
          const parentUser = await this.userRepo.findOne({
            where: { connect: user.connect!, role: UserRole.PARENT },
            select: ['m_uid']
          });
          
          if (parentUser?.m_uid) {
            // 사용 중인 슬롯 조회
            const usedMachines = await this.machineRepo.find({
              where: { owner: user.connect! },
              select: ['slot']
            });
            const usedSlots = usedMachines.map(m => m.slot).filter(slot => slot !== null);
            
            // 빈 슬롯 찾기 (1번부터)
            let assignedSlot = 1;
            while (usedSlots.includes(assignedSlot) && assignedSlot <= 6) {
              assignedSlot++;
            }
            
            if (assignedSlot <= 6) {
              const slotMachineId = `${parentUser.m_uid}_SLOT${assignedSlot}`;
              const newMachine = this.machineRepo.create({
                machine_id: slotMachineId,
                medi_id: medicine.medi_id,
                owner: user.connect!,
                slot: assignedSlot,
                total: Number(totalQuantity),
                remain: Number(totalQuantity),
                error_status: '',
                last_error_at: new Date()
              });
              
              await this.machineRepo.save(newMachine);
              console.log(`[ScheduleService] 새 Machine 레코드 생성: ${slotMachineId} - 슬롯 ${assignedSlot}번, total=${newMachine.total}`);
            } else {
              console.log(`[ScheduleService] 경고: 사용 가능한 슬롯이 없음 (최대 6개)`);
            }
          } else {
            console.log(`[ScheduleService] 경고: 부모 계정의 m_uid를 찾을 수 없음`);
          }
        }
        }
      } else {
        console.log(`[ScheduleService] Machine 테이블 업데이트 건너뜀 - totalQuantity: "${totalQuantity}" (빈 값이거나 유효하지 않음)`);
      }

      // 새로운 스케줄 생성
      const newSchedules: Schedule[] = scheduleData.map(item => {
        // 🔥 복용량 결정 로직 개선: 전달된 doseCount > 기존 설정된 복용량 > item.dose > 기본값 1
        let finalDose = 1; // 기본값
        
        if (doseCount && !isNaN(Number(doseCount)) && Number(doseCount) > 0) {
          // 1. 전달된 doseCount 우선 사용
          finalDose = Number(doseCount);
          console.log(`[ScheduleService] doseCount 사용: ${finalDose}`);
        } else {
          // 2. 기존 설정된 복용량 조회 시도
          console.log(`[ScheduleService] doseCount가 없어서 기존 설정 조회 시도`);
          // 여기서는 동기적으로 조회할 수 없으므로, 이후에 조회하여 설정
        }
        
        if (finalDose === 1 && item.dose && !isNaN(Number(item.dose)) && Number(item.dose) > 0) {
          // 3. item.dose 사용
          finalDose = Number(item.dose);
          console.log(`[ScheduleService] item.dose 사용: ${finalDose}`);
        }
        
        console.log(`[ScheduleService] 스케줄 생성: ${item.day_of_week} ${item.time_of_day}, dose=${finalDose} (doseCount=${doseCount}, item.dose=${item.dose})`);
        
        return this.scheduleRepo.create({
          schedule_id: randomUUID(),
          user_id: user.user_id,
          medi_id: medicine.medi_id,
          connect: user.connect!,
          day_of_week: item.day_of_week,
          time_of_day: item.time_of_day,
          dose: finalDose,
        });
      });

      // 🔥 doseCount가 전달되지 않은 경우 기존 복용량 조회하여 적용
      if (!doseCount || isNaN(Number(doseCount)) || Number(doseCount) <= 0) {
        console.log(`[ScheduleService] doseCount가 없어서 기존 복용량 조회`);
        
        // 1. 같은 약의 다른 사용자 스케줄에서 복용량 조회 (부모가 설정한 복용량)
        const existingScheduleFromOthers = await this.scheduleRepo.findOne({
          where: {
            medi_id: medicine.medi_id,
            connect: user.connect!, // 같은 가족
          },
          order: { created_at: 'DESC' }
        });
        
        if (existingScheduleFromOthers && existingScheduleFromOthers.dose > 0) {
          console.log(`[ScheduleService] 다른 사용자의 복용량 발견: ${existingScheduleFromOthers.dose}정`);
          // 모든 새 스케줄에 기존 복용량 적용
          newSchedules.forEach(schedule => {
            schedule.dose = existingScheduleFromOthers.dose;
          });
        } else {
          // 2. 현재 사용자의 기존 스케줄에서 복용량 조회
          const existingSchedule = await this.scheduleRepo.findOne({
            where: {
              medi_id: medicine.medi_id,
              user_id: user.user_id,
            },
            order: { created_at: 'DESC' }
          });
          
          if (existingSchedule && existingSchedule.dose > 0) {
            console.log(`[ScheduleService] 자신의 기존 복용량 발견: ${existingSchedule.dose}정`);
            // 모든 새 스케줄에 기존 복용량 적용
            newSchedules.forEach(schedule => {
              schedule.dose = existingSchedule.dose;
            });
          } else {
            console.log(`[ScheduleService] 기존 복용량이 없어서 기본값 1정 사용`);
          }
        }
      }

      await this.scheduleRepo.save(newSchedules);
      return { success: true, created: true };
    }

    // 기존 객체 형태 처리 (하위 호환성)
    if (!scheduleData || typeof scheduleData !== 'object') {
      throw new Error('유효하지 않은 스케줄 데이터입니다.');
    }

    const days: string[] = [];
    const times: Set<string> = new Set();

    for (const [day, timeObj] of Object.entries(scheduleData)) {
      days.push(day);
      if (typeof timeObj === 'object' && timeObj !== null) {
        Object.entries(timeObj as Record<string, unknown>).forEach(
          ([time, val]) => {
            if (val) times.add(time);
          },
        );
      }
    }

    const user = await this.userRepo.findOne({ where: { user_id: memberId } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (!user.connect) throw new NotFoundException('사용자의 connect 정보가 없습니다.');

    const medicine = await this.medicineRepo.findOne({
      where: { medi_id: medicineId, connect: user.connect! },
    });
    if (!medicine) throw new NotFoundException('약 정보를 찾을 수 없습니다.');

    // 기존 스케줄 삭제
    await this.scheduleRepo.delete({
      user_id: user.user_id,
      medi_id: medicine.medi_id,
    });

    // 🔥 총량/복용량 업데이트 - Machine 테이블에서 해당 약의 슬롯 찾기
    // 🚨 중요: 부모가 자식 스케줄을 관리할 때는 totalQuantity 업데이트 금지
    let requestUser: User | null = null;
    if (requestUserId && requestUserId !== memberId) {
      requestUser = await this.userRepo.findOne({ where: { user_id: requestUserId } });
      console.log(`[ScheduleService] 객체형 - 요청자와 대상자가 다름 - 요청자: ${requestUserId}, 대상자: ${memberId}`);
    }
    
    const isParentManagingChild = requestUser && requestUser.role === UserRole.PARENT && requestUser.user_id !== memberId;
    
    if (totalQuantity && totalQuantity.trim() !== '' && !isNaN(Number(totalQuantity)) && Number(totalQuantity) > 0) {
      console.log(`[ScheduleService] 객체형 - Machine 테이블 업데이트 시도 - totalQuantity: ${totalQuantity}, user_role: ${user.role}`);
      console.log(`[ScheduleService] 객체형 - 요청자 분석: isParentManagingChild=${isParentManagingChild}`);
      
      if (isParentManagingChild) {
        console.log(`[ScheduleService] 객체형 - 🚨 부모가 자식 스케줄 관리 중 - Machine 테이블 업데이트 건너뜀`);
      } else {
        console.log(`[ScheduleService] 객체형 - ✅ 본인 스케줄 관리 - Machine 테이블 업데이트 진행`);
        
      let machineRecord = await this.machineRepo.findOne({
        where: { 
          medi_id: medicine.medi_id,
          owner: user.connect! 
        }
      });
      
      if (machineRecord) {
        // 기존 Machine 레코드 업데이트
        machineRecord.total = Number(totalQuantity);
        machineRecord.remain = Number(totalQuantity);
        await this.machineRepo.save(machineRecord);
        console.log(`[ScheduleService] 기존 Machine 업데이트: total=${machineRecord.total}, remain=${machineRecord.remain}`);
      } else {
        // 🔥 Machine 레코드가 없으면 새로 생성
        console.log(`[ScheduleService] Machine 레코드가 없어서 새로 생성: medi_id=${medicine.medi_id}, owner=${user.connect}`);
        
        // 부모 계정의 m_uid 조회
        const parentUser = await this.userRepo.findOne({
          where: { connect: user.connect!, role: UserRole.PARENT },
          select: ['m_uid']
        });
        
        if (parentUser?.m_uid) {
          // 사용 중인 슬롯 조회
          const usedMachines = await this.machineRepo.find({
            where: { owner: user.connect! },
            select: ['slot']
          });
          const usedSlots = usedMachines.map(m => m.slot).filter(slot => slot !== null);
          
          // 빈 슬롯 찾기 (1번부터)
          let assignedSlot = 1;
          while (usedSlots.includes(assignedSlot) && assignedSlot <= 6) {
            assignedSlot++;
          }
          
          if (assignedSlot <= 6) {
            const slotMachineId = `${parentUser.m_uid}_SLOT${assignedSlot}`;
            const newMachine = this.machineRepo.create({
              machine_id: slotMachineId,
              medi_id: medicine.medi_id,
              owner: user.connect!,
              slot: assignedSlot,
              total: Number(totalQuantity),
              remain: Number(totalQuantity),
              error_status: '',
              last_error_at: new Date()
            });
            
            await this.machineRepo.save(newMachine);
            console.log(`[ScheduleService] 새 Machine 레코드 생성: ${slotMachineId} - 슬롯 ${assignedSlot}번, total=${newMachine.total}`);
          } else {
            console.log(`[ScheduleService] 경고: 사용 가능한 슬롯이 없음 (최대 6개)`);
          }
        } else {
          console.log(`[ScheduleService] 경고: 부모 계정의 m_uid를 찾을 수 없음`);
        }
      }
      }
    } else {
      console.log(`[ScheduleService] Machine 테이블 업데이트 건너뜀 - totalQuantity: "${totalQuantity}" (빈 값이거나 유효하지 않음)`);
    }

    // 새로운 스케줄 생성
    const newSchedules: Schedule[] = [];

    for (const day of days) {
      for (const time of times) {
        const schedule = this.scheduleRepo.create({
          schedule_id: randomUUID(),
          user_id: user.user_id,
          medi_id: medicine.medi_id,
          connect: user.connect!,
          day_of_week: day as Schedule['day_of_week'],
          time_of_day: time as Schedule['time_of_day'],
          dose: Number(doseCount) > 0 ? Number(doseCount) : 1,
        });
        newSchedules.push(schedule);
      }
    }

    await this.scheduleRepo.save(newSchedules);
    return { success: true, created: true };
  }

  // 2. 스케줄 조회
  async getSchedule(medicineId: string, memberId: string) {
    // 🔥 저장할 때와 동일한 방식으로 실제 사용자 정보 조회
    const user = await this.userRepo.findOne({ where: { user_id: memberId } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (!user.connect) throw new NotFoundException('사용자의 connect 정보가 없습니다.');

    console.log(`[ScheduleService] 스케줄 조회: medicineId=${medicineId}, memberId=${memberId}, user.user_id=${user.user_id}, connect=${user.connect}`);

    const schedules = await this.scheduleRepo.find({
      where: {
        user_id: user.user_id,  // 🔥 실제 조회된 user_id 사용
        medi_id: medicineId,
      },
      relations: ['user', 'medicine'],
    });

    console.log(`[ScheduleService] 조회된 스케줄 개수: ${schedules.length}`);
    if (schedules.length > 0) {
      console.log(`[ScheduleService] 첫 번째 스케줄의 복용량: ${schedules[0].dose}`);
    }

    if (!schedules || schedules.length === 0) {
      throw new NotFoundException('스케줄을 찾을 수 없습니다.');
    }

    // 🔥 Machine 정보도 함께 조회
    const machine = await this.machineRepo.findOne({
      where: { 
        medi_id: medicineId,
        owner: user.connect! 
      },
      select: ['slot', 'total', 'remain', 'machine_id']
    });

    console.log(`[ScheduleService] Machine 정보:`, machine ? {
      machine_id: machine.machine_id,
      slot: machine.slot,
      total: machine.total,
      remain: machine.remain
    } : 'Machine 레코드 없음');

    // 🔥 스케줄 데이터에 Machine 정보 추가
    const enrichedSchedules = schedules.map(schedule => ({
      ...schedule,
      machine: machine
    }));

    return enrichedSchedules;
  }

  // 3. 복용 완료 처리
  async completeDose(): Promise<{ success: boolean; message: string }> {
    // 실제 복용 완료 로직을 여기에 구현
    // 예: 데이터베이스 업데이트 등
    await Promise.resolve(); // 비동기 작업을 시뮬레이션

    return {
      success: true,
      message: '복용이 완료되었습니다.',
    };
  }

  // 4. 오늘 스케줄 조회
  async getTodaySchedule(connect: string) {
    const today = new Date();
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const day = dayMap[today.getDay()] as Schedule['day_of_week'];

    const schedules = await this.scheduleRepo.find({
      where: { connect, day_of_week: day },
      relations: ['user', 'medicine'],
    });

    return {
      date: today.toISOString().split('T')[0],
      schedules: schedules.map((s) => ({
        medicineId: s.medicine?.medi_id,
        medicineName: s.medicine?.name,
        memberName: s.user?.name,
        time: s.time_of_day,
        dosage: s.dose.toString(),
        isCompleted: false,
        type: 'medicine',
      })),
    };
  }

  // 5. 가족 요약 조회
  async getFamilySummary(connect: string) {
    const children = await this.userRepo.find({
      where: { connect, role: UserRole.CHILD },
      relations: ['schedules', 'schedules.medicine'],
    });

    const today = new Date();
    const todayDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
      today.getDay()
    ] as Schedule['day_of_week'];

    return children.map((child) => {
      const todaySchedules =
        child.schedules?.filter((s) => s.day_of_week === todayDay) || [];

      return {
        memberId: child.user_id,
        memberName: child.name,
        activeMedicines: child.schedules?.length || 0,
        todayCompleted: child.took_today ? todaySchedules.length : 0,
        todayTotal: todaySchedules.length,
        upcomingRefills: 0,
      };
    });
  }
}
