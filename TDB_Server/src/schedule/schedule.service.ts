import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './entities/schedule.entity';
import { DoseHistory } from '../dose-history/dose-history.entity';
import { User } from 'src/users/entities/users.entity';
import { Medicine } from 'src/medicine/entities/medicine.entity';
import { Machine } from 'src/machine/entities/machine.entity';
import { UserRole } from 'src/users/entities/users.entity';
import { randomUUID } from 'crypto';
import { DoseHistoryService } from '../dose-history/dose-history.service';
import { AgeValidationService, AgeValidationResult } from '../validation/age-validation.service';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(DoseHistory)
    private readonly doseHistoryRepo: Repository<DoseHistory>,
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    private readonly doseHistoryService: DoseHistoryService,
    private readonly ageValidationService: AgeValidationService,
  ) {}

  // 🔥 V3: 매트릭스 스케줄 저장 (요일×시간별 개별 복용량)
  async saveMatrixSchedule(
    medicineId: string,
    memberId: string,
    scheduleItems: Array<{
      day_of_week: string;
      time_of_day: string;
      dose_count: number;
      enabled: boolean;
    }>,
    totalQuantity: string = '1',
    requestUserId?: string  // 🔥 요청자 정보 추가
  ) {
    console.log(`🔥 [Service V3] 매트릭스 스케줄 저장: ${medicineId}/${memberId}`);
    console.log(`🔥 [Service V3] 스케줄 항목 ${scheduleItems.length}개:`, scheduleItems);

    try {
      // 사용자 조회
      const user = await this.userRepo.findOne({ where: { user_id: memberId } });
      if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
      if (!user.connect) throw new NotFoundException('사용자의 connect 정보가 없습니다.');

      // 약물 조회
      const medicine = await this.medicineRepo.findOne({
        where: { medi_id: medicineId, connect: user.connect! },
      });
      if (!medicine) throw new NotFoundException('약 정보를 찾을 수 없습니다.');

      // 🔥 실제 요청한 사용자 정보 조회 (부모가 자식 관리하는지 확인용)
      let requestUser: User | null = null;
      if (requestUserId && requestUserId !== memberId) {
        requestUser = await this.userRepo.findOne({ where: { user_id: requestUserId } });
        console.log(`🔥 [Service V3] 요청자와 대상자가 다름 - 요청자: ${requestUserId}, 대상자: ${memberId}`);
        console.log(`🔥 [Service V3] 요청자 정보:`, requestUser ? { role: requestUser.role, name: requestUser.name } : '없음');
      }

      // 기존 스케줄 삭제
      await this.scheduleRepo.delete({
        user_id: user.user_id,
        medi_id: medicine.medi_id,
      });

      // 새로운 매트릭스 스케줄 생성
      const newSchedules: Schedule[] = [];
      
      for (const item of scheduleItems) {
        console.log(`🔥 [Service V3] 스케줄 생성: ${item.day_of_week} ${item.time_of_day}, dose=${item.dose_count}`);
        
        const schedule = new Schedule();
        schedule.schedule_id = randomUUID();
        schedule.user_id = user.user_id;
        schedule.medi_id = medicine.medi_id;
        schedule.connect = user.connect!;
        schedule.day_of_week = item.day_of_week as any;
        schedule.time_of_day = item.time_of_day as any;
        schedule.dose = item.dose_count;
        schedule.created_at = new Date();
        
        newSchedules.push(schedule);
      }

      // 스케줄 저장
      const savedSchedules = await this.scheduleRepo.save(newSchedules);
      console.log(`🔥 [Service V3] ${savedSchedules.length}개 스케줄 저장 완료`);

      // 🔥 totalQuantity 업데이트 (Machine 테이블) - 부모/자녀 구분 로직 추가
      const isParentManagingChild = requestUser && requestUser.role === UserRole.PARENT && requestUser.user_id !== memberId;
      
      const parsedTotalQuantity = Number(totalQuantity);
      if (parsedTotalQuantity > 0) {
        console.log(`🔥 [Service V3] Machine 테이블 업데이트 시도 - parsedTotalQuantity: ${parsedTotalQuantity}, isParentManagingChild: ${isParentManagingChild}`);
        
        if (isParentManagingChild) {
          console.log(`🔥 [Service V3] 🚨 부모가 자식 스케줄 관리 중 - totalQuantity 값이 유효하지 않을 수 있음. 기존 Machine 값 유지`);
          
          // 부모가 자녀 스케줄 관리할 때는 totalQuantity를 무조건 믿지 말고 기존 값 확인
          const machineRecord = await this.machineRepo.findOne({
            where: { 
              medi_id: medicine.medi_id,
              owner: user.connect! 
            }
          });
          
          if (machineRecord && machineRecord.total > parsedTotalQuantity) {
            console.log(`🔥 [Service V3] 기존 Machine total(${machineRecord.total})이 더 크므로 업데이트 건너뜀`);
          } else if (machineRecord) {
            console.log(`🔥 [Service V3] 기존 Machine total(${machineRecord.total})보다 크거나 같으므로 업데이트 진행`);
            machineRecord.total = parsedTotalQuantity;
            machineRecord.remain = parsedTotalQuantity;
            await this.machineRepo.save(machineRecord);
            console.log(`🔥 [Service V3] Machine 업데이트 완료: total=${machineRecord.total}`);
          }
        } else {
          console.log(`🔥 [Service V3] ✅ 본인 스케줄 관리 - Machine 테이블 업데이트 진행`);
          
          let machineRecord = await this.machineRepo.findOne({
            where: { 
              medi_id: medicine.medi_id,
              owner: user.connect! 
            }
          });
          
          if (machineRecord) {
            machineRecord.total = parsedTotalQuantity;
            machineRecord.remain = parsedTotalQuantity;
            await this.machineRepo.save(machineRecord);
            console.log(`🔥 [Service V3] Machine 업데이트 완료: total=${machineRecord.total}`);
          }
        }
      } else {
        console.log(`🔥 [Service V3] Machine 테이블 업데이트 건너뜀 - parsedTotalQuantity: ${parsedTotalQuantity} (유효하지 않음)`);
      }

      return {
        success: true,
        message: '매트릭스 스케줄이 성공적으로 저장되었습니다.',
        data: {
          savedCount: savedSchedules.length,
          schedules: savedSchedules
        }
      };
      
    } catch (error) {
      console.error('🔥 [Service V3] 매트릭스 스케줄 저장 실패:', error);
      throw error;
    }
  }

  // 1. 스케줄 저장 (유효성 검사 포함)
  async saveSchedule(
    medicineId: string,
    memberId: string,
    scheduleData: any, // Record<string, unknown>에서 any로 변경
    totalQuantity?: string,
    doseCount?: string,
    requestUserId?: string, // 🔥 실제 요청한 사용자 ID 추가
  ) {
    console.log('저장할 스케줄 데이터:', { medicineId, memberId, scheduleData, totalQuantity, doseCount, requestUserId });

    // 🔥 1단계: 사용자 연령 기반 유효성 검사
    const validationResult = await this.validateUserAge(memberId, medicineId);
    if (!validationResult.allowed) {
      throw new BadRequestException({
        error: 'AGE_RESTRICTION',
        message: validationResult.reason,
        warnings: validationResult.warnings
      });
    }

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
      const isParentUser = requestUser ? requestUser.role === UserRole.PARENT : user.role === UserRole.PARENT;
      
      // 🔥 totalQuantity 파싱 로직 개선 - "9#99" 같은 형식도 처리
      let parsedTotalQuantity = 0;
      if (totalQuantity && totalQuantity.trim() !== '') {
        // "#" 문자를 제거하고 숫자 부분만 추출
        const cleanedQuantity = totalQuantity.replace(/[#]/g, '');
        parsedTotalQuantity = Number(cleanedQuantity);
        console.log(`[ScheduleService] totalQuantity 파싱: "${totalQuantity}" → "${cleanedQuantity}" → ${parsedTotalQuantity}`);
      }
      
      if (parsedTotalQuantity > 0) {
        console.log(`[ScheduleService] Machine 테이블 업데이트 시도 - parsedTotalQuantity: ${parsedTotalQuantity}, user_role: ${user.role}, memberId: ${memberId}`);
        console.log(`[ScheduleService] 요청자 분석: isParentManagingChild=${isParentManagingChild}`);
        
        console.log(`[ScheduleService] 🔥 Machine 테이블 업데이트 진행 - isParentManagingChild: ${isParentManagingChild}`);
        
        let machineRecord = await this.machineRepo.findOne({
          where: { 
            medi_id: medicine.medi_id,
            owner: user.connect! 
          }
        });
        
        if (machineRecord) {
          // 기존 Machine 레코드 업데이트
          machineRecord.total = parsedTotalQuantity;
          machineRecord.remain = parsedTotalQuantity;
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
            // 사용 중인 슬롯 조회 (복합키 구조에 맞게 수정)
            const usedMachines = await this.machineRepo.find({
              where: { owner: user.connect! },
              select: ['machine_id', 'slot']
            });
            const usedSlots = usedMachines.map(m => m.slot).filter(slot => slot !== null);
            
            // 빈 슬롯 찾기 (1번부터)
            let assignedSlot = 1;
            while (usedSlots.includes(assignedSlot) && assignedSlot <= 6) {
              assignedSlot++;
            }
            
            if (assignedSlot <= 6) {
              // 🔥 Foreign Key 제약 조건 수정: machine_id는 실제 m_uid 사용
              const newMachine = this.machineRepo.create({
                machine_id: parentUser.m_uid, // 🔥 실제 m_uid 사용 (Foreign Key 만족)
                medi_id: medicine.medi_id,
                owner: user.connect!,
                slot: assignedSlot, // 🔥 슬롯 정보는 별도 필드에 저장
                total: parsedTotalQuantity,
                remain: parsedTotalQuantity,
                error_status: '',
                last_error_at: new Date()
              });
              
              await this.machineRepo.save(newMachine);
              console.log(`[ScheduleService] 새 Machine 레코드 생성: machine_id=${parentUser.m_uid} - 슬롯 ${assignedSlot}번, total=${newMachine.total}`);
            } else {
              console.log(`[ScheduleService] 경고: 사용 가능한 슬롯이 없음 (최대 6개)`);
            }
          } else {
            console.log(`[ScheduleService] 경고: 부모 계정의 m_uid를 찾을 수 없음`);
          }
        }
      } else {
        if (!isParentUser && parsedTotalQuantity > 0) {
          console.log(`[ScheduleService] ❌ 자녀계정이므로 Machine 테이블 업데이트 건너뜀 - isParentUser: ${isParentUser}`);
          console.log(`[ScheduleService]    자녀계정은 총량 조회만 가능하며 변경할 수 없습니다.`);
        } else {
          console.log(`[ScheduleService] Machine 테이블 업데이트 건너뜀 - totalQuantity: "${totalQuantity}" → parsedTotalQuantity: ${parsedTotalQuantity} (유효하지 않음)`);
        }
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
        
        // 🔥 1. 부모가 자녀 관리하는 경우: 부모의 복용량 우선 조회
        if (isParentManagingChild && requestUser) {
          console.log(`[ScheduleService] 부모가 자녀 관리: 부모의 복용량 조회 시도`);
          const parentSchedule = await this.scheduleRepo.findOne({
            where: {
              medi_id: medicine.medi_id,
              user_id: requestUser.user_id, // 부모의 user_id
              connect: user.connect!
            },
            order: { created_at: 'DESC' }
          });
          
          if (parentSchedule && parentSchedule.dose > 0) {
            console.log(`[ScheduleService] 🔥 부모의 복용량 발견: ${parentSchedule.dose}정 → 자녀에게 적용`);
            newSchedules.forEach(schedule => {
              schedule.dose = parentSchedule.dose;
            });
          } else {
            console.log(`[ScheduleService] 부모의 복용량이 없어서 가족 내 다른 사용자 조회`);
            // 부모의 복용량이 없으면 가족 내 다른 사용자 조회
            const familySchedule = await this.scheduleRepo.findOne({
              where: {
                medi_id: medicine.medi_id,
                connect: user.connect!,
              },
              order: { created_at: 'DESC' }
            });
            
            if (familySchedule && familySchedule.dose > 0) {
              console.log(`[ScheduleService] 가족 내 복용량 발견: ${familySchedule.dose}정`);
              newSchedules.forEach(schedule => {
                schedule.dose = familySchedule.dose;
              });
            }
          }
        } else {
          // 🔥 2. 일반적인 경우: 같은 약의 가족 내 복용량 조회
          const existingScheduleFromFamily = await this.scheduleRepo.findOne({
            where: {
              medi_id: medicine.medi_id,
              connect: user.connect!, // 같은 가족
            },
            order: { created_at: 'DESC' }
          });
          
          if (existingScheduleFromFamily && existingScheduleFromFamily.dose > 0) {
            console.log(`[ScheduleService] 가족 내 복용량 발견: ${existingScheduleFromFamily.dose}정`);
            newSchedules.forEach(schedule => {
              schedule.dose = existingScheduleFromFamily.dose;
            });
          } else {
            // 3. 현재 사용자의 기존 스케줄에서 복용량 조회
            const existingSchedule = await this.scheduleRepo.findOne({
              where: {
                medi_id: medicine.medi_id,
                user_id: user.user_id,
              },
              order: { created_at: 'DESC' }
            });
            
            if (existingSchedule && existingSchedule.dose > 0) {
              console.log(`[ScheduleService] 자신의 기존 복용량 발견: ${existingSchedule.dose}정`);
              newSchedules.forEach(schedule => {
                schedule.dose = existingSchedule.dose;
              });
            } else {
              console.log(`[ScheduleService] 기존 복용량이 없어서 기본값 1정 사용`);
            }
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
    const isParentUser = requestUser ? requestUser.role === UserRole.PARENT : user.role === UserRole.PARENT;
    
    if (totalQuantity && totalQuantity.trim() !== '' && !isNaN(Number(totalQuantity)) && Number(totalQuantity) > 0 && isParentUser) {
      console.log(`[ScheduleService] 객체형 - Machine 테이블 업데이트 시도 - totalQuantity: ${totalQuantity}, user_role: ${user.role}`);
      console.log(`[ScheduleService] 객체형 - 요청자 분석: isParentUser=${isParentUser}`);
      
      console.log(`[ScheduleService] 객체형 - 🔥 부모계정이므로 Machine 테이블 업데이트 진행`);
        
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
          // 사용 중인 슬롯 조회 (복합키 구조에 맞게 수정)
          const usedMachines = await this.machineRepo.find({
            where: { owner: user.connect! },
            select: ['machine_id', 'slot']
          });
          const usedSlots = usedMachines.map(m => m.slot).filter(slot => slot !== null);
          
          // 빈 슬롯 찾기 (1번부터)
          let assignedSlot = 1;
          while (usedSlots.includes(assignedSlot) && assignedSlot <= 6) {
            assignedSlot++;
          }
          
          if (assignedSlot <= 6) {
            // 🔥 Foreign Key 제약 조건 수정: machine_id는 실제 m_uid 사용
            const newMachine = this.machineRepo.create({
              machine_id: parentUser.m_uid, // 🔥 실제 m_uid 사용 (Foreign Key 만족)
              medi_id: medicine.medi_id,
              owner: user.connect!,
              slot: assignedSlot, // 🔥 슬롯 정보는 별도 필드에 저장
              total: Number(totalQuantity),
              remain: Number(totalQuantity),
              error_status: '',
              last_error_at: new Date()
            });
            
            await this.machineRepo.save(newMachine);
            console.log(`[ScheduleService] 새 Machine 레코드 생성: machine_id=${parentUser.m_uid} - 슬롯 ${assignedSlot}번, total=${newMachine.total}`);
          } else {
            console.log(`[ScheduleService] 경고: 사용 가능한 슬롯이 없음 (최대 6개)`);
          }
        } else {
          console.log(`[ScheduleService] 경고: 부모 계정의 m_uid를 찾을 수 없음`);
        }
      }
    } else if (totalQuantity && totalQuantity.trim() !== '' && !isNaN(Number(totalQuantity)) && Number(totalQuantity) > 0 && !isParentUser) {
      console.log(`[ScheduleService] 객체형 - ❌ 자녀계정이므로 Machine 테이블 업데이트 건너뜀 - isParentUser: ${isParentUser}`);
      console.log(`[ScheduleService] 객체형 -    자녀계정은 총량 조회만 가능하며 변경할 수 없습니다.`);
    } else {
      console.log(`[ScheduleService] 객체형 - Machine 테이블 업데이트 건너뜀 - totalQuantity: "${totalQuantity}" (빈 값이거나 유효하지 않음)`);
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

  // 🔥 새로운 메서드: 시간대별 복용량을 처리하는 스케줄 저장
  async saveScheduleWithTimeDoses(
    medicineId: string,
    memberId: string,
    scheduleData: any,
    totalQuantity?: string,
    doseCount?: string,
    requestUserId?: string,
    timeDoses?: {
      morningDose?: number;
      afternoonDose?: number;
      eveningDose?: number;
    }
  ) {
    console.log('🔥 시간대별 복용량 저장 요청:', { 
      medicineId, 
      memberId, 
      totalQuantity, 
      doseCount, 
      requestUserId,
      timeDoses 
    });

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

      // 🔥 Machine 테이블 업데이트 로직 (기존과 동일)
      const isParentManagingChild = requestUser && requestUser.role === UserRole.PARENT && requestUser.user_id !== memberId;
      
      let parsedTotalQuantity = 0;
      if (totalQuantity && totalQuantity.trim() !== '') {
        const cleanedQuantity = totalQuantity.replace(/[#]/g, '');
        parsedTotalQuantity = Number(cleanedQuantity);
        console.log(`[ScheduleService] totalQuantity 파싱: "${totalQuantity}" → "${cleanedQuantity}" → ${parsedTotalQuantity}`);
      }
      
      // 🔥 부모계정만 Machine 테이블 업데이트 허용 (자녀계정은 조회만 가능)
      const isParentUser = requestUser ? requestUser.role === UserRole.PARENT : user.role === UserRole.PARENT;
      
      if (parsedTotalQuantity > 0 && isParentUser) {
        console.log(`[ScheduleService] ✅ 부모계정이므로 Machine 테이블 업데이트 진행 - isParentUser: ${isParentUser}`);
        
        let machineRecord = await this.machineRepo.findOne({
          where: { 
            medi_id: medicine.medi_id,
            owner: user.connect! 
          }
        });
        
        if (machineRecord) {
          machineRecord.total = parsedTotalQuantity;
          machineRecord.remain = parsedTotalQuantity;
          await this.machineRepo.save(machineRecord);
          console.log(`[ScheduleService] 기존 Machine 업데이트: total=${machineRecord.total}, remain=${machineRecord.remain}`);
        } else {
          console.log(`[ScheduleService] Machine 레코드가 없어서 새로 생성`);
          
          // 부모 계정의 m_uid 조회
          const parentUser = await this.userRepo.findOne({
            where: { connect: user.connect!, role: UserRole.PARENT },
            select: ['m_uid']
          });
          
          if (parentUser?.m_uid) {
            // 사용 중인 슬롯 조회
            const usedMachines = await this.machineRepo.find({
              where: { owner: user.connect! },
              select: ['machine_id', 'slot']
            });
            const usedSlots = usedMachines.map(m => m.slot).filter(slot => slot !== null);
            
            // 빈 슬롯 찾기 (1번부터)
            let assignedSlot = 1;
            while (usedSlots.includes(assignedSlot) && assignedSlot <= 6) {
              assignedSlot++;
            }
            
            if (assignedSlot <= 6) {
              const newMachine = this.machineRepo.create({
                machine_id: parentUser.m_uid,
                medi_id: medicine.medi_id,
                owner: user.connect!,
                slot: assignedSlot,
                total: parsedTotalQuantity,
                remain: parsedTotalQuantity,
                error_status: '',
                last_error_at: new Date()
              });
              
              await this.machineRepo.save(newMachine);
              console.log(`[ScheduleService] 새 Machine 레코드 생성: machine_id=${parentUser.m_uid} - 슬롯 ${assignedSlot}번, total=${newMachine.total}`);
            } else {
              console.log(`[ScheduleService] 경고: 사용 가능한 슬롯이 없음 (최대 6개)`);
            }
          } else {
            console.log(`[ScheduleService] 경고: 부모 계정의 m_uid를 찾을 수 없음`);
          }
        }
      } else if (parsedTotalQuantity > 0 && !isParentUser) {
        console.log(`[ScheduleService] saveScheduleWithTimeDoses - ❌ 자녀계정이므로 Machine 테이블 업데이트 건너뜀 - isParentUser: ${isParentUser}`);
        console.log(`[ScheduleService] saveScheduleWithTimeDoses -    자녀계정은 총량 조회만 가능하며 변경할 수 없습니다.`);
      }

      // 🔥 시간대별 복용량을 적용한 새로운 스케줄 생성
      const newSchedules: Schedule[] = scheduleData.map(item => {
        let finalDose = 1; // 기본값
        
        // 1. doseCount가 있으면 기본값으로 사용
        if (doseCount && !isNaN(Number(doseCount)) && Number(doseCount) > 0) {
          finalDose = Number(doseCount);
        }
        
        // 2. item.dose가 있으면 사용
        if (item.dose && !isNaN(Number(item.dose)) && Number(item.dose) > 0) {
          finalDose = Number(item.dose);
        }
        
        // 3. 🔥 시간대별 복용량이 있으면 최우선 적용 (V2 API의 핵심 기능)
        if (timeDoses) {
          if (item.time_of_day === 'morning' && timeDoses.morningDose && timeDoses.morningDose > 0) {
            finalDose = timeDoses.morningDose;
          } else if (item.time_of_day === 'afternoon' && timeDoses.afternoonDose && timeDoses.afternoonDose > 0) {
            finalDose = timeDoses.afternoonDose;
          } else if (item.time_of_day === 'evening' && timeDoses.eveningDose && timeDoses.eveningDose > 0) {
            finalDose = timeDoses.eveningDose;
          }
        }
        
        console.log(`[ScheduleService] 🔥 시간대별 스케줄 생성: ${item.day_of_week} ${item.time_of_day}, 최종 복용량=${finalDose} (timeDoses.${item.time_of_day}Dose=${timeDoses?.[item.time_of_day + 'Dose']}, doseCount=${doseCount}, item.dose=${item.dose})`);
        
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

      // 🔥 doseCount가 전달되지 않은 경우 기존 복용량 조회하여 적용 (saveSchedule과 동일한 로직)
      if (!doseCount || isNaN(Number(doseCount)) || Number(doseCount) <= 0) {
        console.log(`[ScheduleService] saveScheduleWithTimeDoses - doseCount가 없어서 기존 복용량 조회`);
        
        // 🔥 1. 부모가 자녀 관리하는 경우: 부모의 복용량 우선 조회
        if (isParentManagingChild && requestUser) {
          console.log(`[ScheduleService] saveScheduleWithTimeDoses - 부모가 자녀 관리: 부모의 복용량 조회 시도`);
          const parentSchedule = await this.scheduleRepo.findOne({
            where: {
              medi_id: medicine.medi_id,
              user_id: requestUser.user_id, // 부모의 user_id
              connect: user.connect!
            },
            order: { created_at: 'DESC' }
          });
          
          if (parentSchedule && parentSchedule.dose > 0) {
            console.log(`[ScheduleService] saveScheduleWithTimeDoses - 🔥 부모의 복용량 발견: ${parentSchedule.dose}정 → 자녀에게 적용`);
            newSchedules.forEach(schedule => {
              // timeDoses가 설정되지 않은 시간대만 부모 복용량 적용
              if (!timeDoses || 
                  (schedule.time_of_day === 'morning' && (!timeDoses.morningDose || timeDoses.morningDose <= 0)) ||
                  (schedule.time_of_day === 'afternoon' && (!timeDoses.afternoonDose || timeDoses.afternoonDose <= 0)) ||
                  (schedule.time_of_day === 'evening' && (!timeDoses.eveningDose || timeDoses.eveningDose <= 0))) {
                schedule.dose = parentSchedule.dose;
              }
            });
          } else {
            console.log(`[ScheduleService] saveScheduleWithTimeDoses - 부모의 복용량이 없어서 가족 내 다른 사용자 조회`);
            // 부모의 복용량이 없으면 가족 내 다른 사용자 조회
            const familySchedule = await this.scheduleRepo.findOne({
              where: {
                medi_id: medicine.medi_id,
                connect: user.connect!,
              },
              order: { created_at: 'DESC' }
            });
            
            if (familySchedule && familySchedule.dose > 0) {
              console.log(`[ScheduleService] saveScheduleWithTimeDoses - 가족 내 복용량 발견: ${familySchedule.dose}정`);
              newSchedules.forEach(schedule => {
                if (!timeDoses || 
                    (schedule.time_of_day === 'morning' && (!timeDoses.morningDose || timeDoses.morningDose <= 0)) ||
                    (schedule.time_of_day === 'afternoon' && (!timeDoses.afternoonDose || timeDoses.afternoonDose <= 0)) ||
                    (schedule.time_of_day === 'evening' && (!timeDoses.eveningDose || timeDoses.eveningDose <= 0))) {
                  schedule.dose = familySchedule.dose;
                }
              });
            }
          }
        } else {
          // 🔥 2. 일반적인 경우: 같은 약의 가족 내 복용량 조회
          const existingScheduleFromFamily = await this.scheduleRepo.findOne({
            where: {
              medi_id: medicine.medi_id,
              connect: user.connect!, // 같은 가족
            },
            order: { created_at: 'DESC' }
          });
          
          if (existingScheduleFromFamily && existingScheduleFromFamily.dose > 0) {
            console.log(`[ScheduleService] saveScheduleWithTimeDoses - 가족 내 복용량 발견: ${existingScheduleFromFamily.dose}정`);
            newSchedules.forEach(schedule => {
              if (!timeDoses || 
                  (schedule.time_of_day === 'morning' && (!timeDoses.morningDose || timeDoses.morningDose <= 0)) ||
                  (schedule.time_of_day === 'afternoon' && (!timeDoses.afternoonDose || timeDoses.afternoonDose <= 0)) ||
                  (schedule.time_of_day === 'evening' && (!timeDoses.eveningDose || timeDoses.eveningDose <= 0))) {
                schedule.dose = existingScheduleFromFamily.dose;
              }
            });
          } else {
            // 3. 현재 사용자의 기존 스케줄에서 복용량 조회
            const existingSchedule = await this.scheduleRepo.findOne({
              where: {
                medi_id: medicine.medi_id,
                user_id: user.user_id,
              },
              order: { created_at: 'DESC' }
            });
            
            if (existingSchedule && existingSchedule.dose > 0) {
              console.log(`[ScheduleService] saveScheduleWithTimeDoses - 자신의 기존 복용량 발견: ${existingSchedule.dose}정`);
              newSchedules.forEach(schedule => {
                if (!timeDoses || 
                    (schedule.time_of_day === 'morning' && (!timeDoses.morningDose || timeDoses.morningDose <= 0)) ||
                    (schedule.time_of_day === 'afternoon' && (!timeDoses.afternoonDose || timeDoses.afternoonDose <= 0)) ||
                    (schedule.time_of_day === 'evening' && (!timeDoses.eveningDose || timeDoses.eveningDose <= 0))) {
                  schedule.dose = existingSchedule.dose;
                }
              });
            } else {
              console.log(`[ScheduleService] saveScheduleWithTimeDoses - 기존 복용량이 없어서 기본값 1정 사용`);
            }
          }
        }
      }

      await this.scheduleRepo.save(newSchedules);
      return { success: true, message: '시간대별 복용량이 적용된 스케줄이 저장되었습니다.' };
    }

    // 객체 형태의 스케줄 데이터는 기존 saveSchedule 메서드로 위임
    return this.saveSchedule(medicineId, memberId, scheduleData, totalQuantity, doseCount, requestUserId);
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

    // 🔥 스케줄이 없어도 에러를 던지지 않고 빈 배열 반환
    if (!schedules || schedules.length === 0) {
      console.log(`[ScheduleService] 스케줄이 없습니다 - 빈 배열 반환: medicineId=${medicineId}, memberId=${memberId}`);
      return [];
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

  // 🔥 실제 복용 완료 처리 - DoseHistoryService 사용
  async completeDose(
    medicineId: string,
    userId: string,
    timeOfDay: 'morning' | 'afternoon' | 'evening',
    actualDose?: number,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    console.log(`🔥 [ScheduleService] 복용 완료 처리: ${medicineId}/${userId}/${timeOfDay}`);
    
    try {
      // DoseHistoryService를 통해 복용 완료 처리
      const result = await this.doseHistoryService.completeDose(
        userId,
        medicineId,
        timeOfDay,
        actualDose || 1,
        notes
      );
      
      console.log(`✅ [ScheduleService] 복용 완료 기록 저장: ${result.actual_dose}정`);
      
      return {
        success: true,
        message: `${result.actual_dose}정 복용이 완료되었습니다.`
      };
      
    } catch (error) {
      console.error('🔥 [ScheduleService] 복용 완료 처리 실패:', error);
      return {
        success: false,
        message: error.message || '복용 기록 저장에 실패했습니다.'
      };
    }
  }

  // 🔥 복용 기록 조회 (특정 날짜) - DoseHistoryService 사용
  async getDoseHistory(
    medicineId: string,
    userId: string,
    date?: string
  ): Promise<any[]> {
    console.log(`🔍 [ScheduleService] 복용 기록 조회: ${medicineId}/${userId}/${date || 'today'}`);
    
    const targetDate = date || new Date().toISOString().split('T')[0];
    const startDate = targetDate;
    const endDate = targetDate;
    
    const histories = await this.doseHistoryService.getDoseHistory(
      userId,
      medicineId,
      startDate,
      endDate
    );
    
    console.log(`🔍 [ScheduleService] 조회된 복용 기록 ${histories.length}개`);
    
    return histories;
  }

  // 🔥 주간 복용 통계 (실제 데이터) - DoseHistoryService 사용
  async getWeeklyStats(userId: string, medicineId?: string): Promise<{
    totalScheduled: number;
    totalCompleted: number;
    completionRate: number;
    dailyStats: any[];
  }> {
    console.log(`🔍 [ScheduleService] 주간 통계 조회: ${userId}, medicine=${medicineId || 'all'}`);
    
    // 최근 7일간 날짜 생성
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    const dailyStats: Array<{
      date: string;
      scheduled: number;
      completed: number;
      rate: number;
    }> = [];
    let totalScheduled = 0;
    let totalCompleted = 0;
    
    for (const date of dates) {
      // 해당 날짜의 요일 계산
      const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const dayOfWeek = dayMap[new Date(date).getDay()];
      
      // 스케줄된 복용량 조회
      const scheduleQuery: any = {
        user_id: userId,
        day_of_week: dayOfWeek
      };
      if (medicineId) {
        scheduleQuery.medi_id = medicineId;
      }
      
      const scheduledDoses = await this.scheduleRepo.find({
        where: scheduleQuery
      });
      
      const scheduledCount = scheduledDoses.reduce((sum, s) => sum + s.dose, 0);
      
      // 실제 복용 기록 조회
      const historyQuery: any = {
        user_id: userId,
        dose_date: date,
        status: 'completed'
      };
      if (medicineId) {
        historyQuery.medi_id = medicineId;
      }
      
      const completedDoses = await this.doseHistoryRepo.find({
        where: historyQuery
      });
      
      const completedCount = completedDoses.reduce((sum, h) => sum + h.actual_dose, 0);
      
      const rate = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;
      
      dailyStats.push({
        date,
        scheduled: scheduledCount,
        completed: completedCount,
        rate
      });
      
      totalScheduled += scheduledCount;
      totalCompleted += completedCount;
    }
    
    const completionRate = totalScheduled > 0 
      ? Math.round((totalCompleted / totalScheduled) * 100) 
      : 0;
    
    console.log(`🔍 [ScheduleService] 주간 통계: ${completionRate}% (${totalCompleted}/${totalScheduled})`);
    
    return {
      totalScheduled,
      totalCompleted,
      completionRate,
      dailyStats
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

  // 🔥 새로 추가: 현재 시간 기준 복용량 조회
  async getCurrentDose(medicineId: string, userId: string): Promise<{ dose: number; timeSlot: string; nextDose?: { timeSlot: string; dose: number } }> {
    console.log(`🔍 [ScheduleService] 현재 시간 복용량 조회: medicineId=${medicineId}, userId=${userId}`);
    
    // 1. 사용자 정보 조회
    const user = await this.userRepo.findOne({
      where: { user_id: userId },
      select: ['user_id', 'connect']
    });
    
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    
    // 2. 현재 시간 기준 시간대 결정
    const now = new Date();
    const hour = now.getHours();
    
    let currentTimeSlot: 'morning' | 'afternoon' | 'evening';
    if (hour >= 6 && hour < 12) {
      currentTimeSlot = 'morning';
    } else if (hour >= 12 && hour < 18) {
      currentTimeSlot = 'afternoon';
    } else {
      currentTimeSlot = 'evening';
    }
    
    console.log(`🔍 [ScheduleService] 현재 시각: ${hour}시, 시간대: ${currentTimeSlot}`);
    
    // 3. 오늘 요일 결정
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = dayMap[now.getDay()] as Schedule['day_of_week'];
    
    console.log(`🔍 [ScheduleService] 오늘 요일: ${today}`);
    
    // 4. 현재 시간대 스케줄 조회
    const currentSchedule = await this.scheduleRepo.findOne({
      where: {
        user_id: user.user_id,
        medi_id: medicineId,
        day_of_week: today,
        time_of_day: currentTimeSlot
      },
      select: ['dose', 'time_of_day']
    });
    
    if (!currentSchedule) {
      console.log(`🔍 [ScheduleService] 현재 시간대(${currentTimeSlot})에 복용할 약이 없습니다.`);
      
      // 5. 다음 복용 시간 찾기
      const nextTimeSlots = currentTimeSlot === 'morning' ? ['afternoon', 'evening'] 
                          : currentTimeSlot === 'afternoon' ? ['evening'] : [];
      
      let nextDose: { timeSlot: string; dose: number } | undefined = undefined;
      for (const timeSlot of nextTimeSlots) {
        const nextSchedule = await this.scheduleRepo.findOne({
          where: {
            user_id: user.user_id,
            medi_id: medicineId,
            day_of_week: today,
            time_of_day: timeSlot as 'morning' | 'afternoon' | 'evening'
          },
          select: ['dose', 'time_of_day']
        });
        
        if (nextSchedule) {
          nextDose = { timeSlot, dose: nextSchedule.dose };
          break;
        }
      }
      
      return {
        dose: 0,
        timeSlot: currentTimeSlot,
        nextDose
      };
    }
    
    console.log(`🔍 [ScheduleService] 현재 복용량: ${currentSchedule.dose}정 (${currentTimeSlot})`);
    
    return {
      dose: currentSchedule.dose,
      timeSlot: currentTimeSlot
    };
  }

  // 🔥 새로 추가: 특정 약물의 하루 전체 복용 스케줄 조회
  async getDailySchedule(medicineId: string, userId: string, date?: string): Promise<{
    morning: number;
    afternoon: number;  
    evening: number;
    total: number;
  }> {
    console.log(`🔍 [ScheduleService] 하루 복용 스케줄 조회: medicineId=${medicineId}, userId=${userId}, date=${date || 'today'}`);
    
    // 1. 사용자 정보 조회
    const user = await this.userRepo.findOne({
      where: { user_id: userId },
      select: ['user_id', 'connect']
    });
    
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    
    // 2. 날짜 결정 (오늘 또는 지정된 날짜)
    const targetDate = date ? new Date(date) : new Date();
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const targetDay = dayMap[targetDate.getDay()] as Schedule['day_of_week'];
    
    console.log(`🔍 [ScheduleService] 조회 날짜: ${targetDate.toISOString().split('T')[0]}, 요일: ${targetDay}`);
    
    // 3. 해당 날짜의 모든 시간대 스케줄 조회
    const schedules = await this.scheduleRepo.find({
      where: {
        user_id: user.user_id,
        medi_id: medicineId,
        day_of_week: targetDay
      },
      select: ['time_of_day', 'dose']
    });
    
    console.log(`🔍 [ScheduleService] 조회된 스케줄 개수: ${schedules.length}`);
    
    // 4. 시간대별 복용량 정리
    const result = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      total: 0
    };
    
    schedules.forEach(schedule => {
      if (schedule.time_of_day && schedule.dose > 0) {
        result[schedule.time_of_day] = schedule.dose;
        result.total += schedule.dose;
        console.log(`🔍 [ScheduleService] ${schedule.time_of_day}: ${schedule.dose}정`);
      }
    });
    
    console.log(`🔍 [ScheduleService] 하루 총 복용량: ${result.total}정`);
    
    return result;
  }

  // 🔥 새로 추가: 사용자 연령 기반 유효성 검사
  private async validateUserAge(userId: string, medicineId: string): Promise<AgeValidationResult> {
    try {
      // 사용자 정보 조회
      const user = await this.userRepo.findOne({ 
        where: { user_id: userId },
        select: ['user_id', 'age', 'role', 'connect']
      });
      
      if (!user) {
        throw new NotFoundException('사용자를 찾을 수 없습니다.');
      }

      if (!user.age) {
        return {
          allowed: true,
          warnings: ['나이 정보가 없어 기본 검증만 수행됩니다.'],
          requiresConsultation: false
        };
      }

      // 의약품 정보 조회 (금기사항 포함)
      const medicine = await this.medicineRepo.findOne({
        where: { medi_id: medicineId, connect: user.connect! }
      });

      if (!medicine) {
        throw new NotFoundException('의약품 정보를 찾을 수 없습니다.');
      }

      // 연령 기반 유효성 검사 수행 (기본 검증)
      // TODO: 실제 의약품 JSON 데이터에서 주의사항 정보를 가져와야 함
      const contraindications = ''; // 현재는 기본 검증만 수행
      const validationResult = this.ageValidationService.validateAge(user.age, contraindications);

      console.log(`🔍 [Validation] 사용자 ${userId}(${user.age}세)의 의약품 ${medicineId} 유효성 검사:`, validationResult);

      return validationResult;

    } catch (error) {
      console.error('🚨 [Validation] 유효성 검사 중 오류:', error);
      throw error;
    }
  }
}
