import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Medicine } from '../medicine/entities/medicine.entity';
import { Machine } from '../machine/entities/machine.entity';
import { User, UserRole } from '../users/entities/users.entity';

@Injectable()
export class SupplementService {
  constructor(
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // 1. 영양제 목록 조회
  async getSupplementList(connect: string): Promise<Medicine[]> {
    // 🔥 Machine 테이블과 조인하여 슬롯 정보 포함
    const supplements = await this.medicineRepo.find({
      where: { connect },
      order: { start_date: 'ASC' },
    });

    // 각 영양제에 대해 Machine 테이블에서 슬롯 정보 조회
    const supplementsWithSlot = await Promise.all(
      supplements.map(async (supplement) => {
        const machine = await this.machineRepo.findOne({
          where: { 
            medi_id: supplement.medi_id, 
            owner: connect 
          },
          select: ['machine_id', 'slot', 'total', 'remain']
        });

        return {
          ...supplement,
          slot: machine?.slot || null,
          total: machine?.total || null,
          remain: machine?.remain || null,
          // 🔥 프론트엔드 호환성을 위한 필드명 추가
          totalQuantity: machine?.total?.toString() || null,
          doseCount: '1', // 기본 복용량, 스케줄에서 개별 설정 가능
        };
      })
    );

    return supplementsWithSlot;
  }

  // 2. 영양제 등록
  async saveSupplement(data: {
    connect: string;
    medi_id: string;
    name: string;
    manufacturer?: string;
    ingredients?: string;
    primaryFunction?: string;
    intakeMethod?: string;
    precautions?: string;
    warning?: boolean;
    start_date?: string;
    end_date?: string;
    slot?: number;
    target_users?: string[] | null;
    memberName?: string;
    memberType?: string;
  }): Promise<Medicine> {
    const { medi_id, target_users } = data;
    
    console.log(`🔍 영양제 저장 요청 - connect: ${data.connect}, target_users:`, target_users);
    
    // 🔥 기기 연동 상태 확인 - connect 그룹의 부모 계정 m_uid 체크
    const parentUser = await this.userRepo.findOne({
      where: { connect: data.connect, role: UserRole.PARENT },
      select: ['m_uid', 'user_id', 'name']
    });
    
    if (!parentUser?.m_uid) {
      throw new ConflictException('스마트 디스펜서가 연동되지 않았습니다. 메인 계정에서 기기를 먼저 연동해주세요.');
    }

    const exists = await this.medicineRepo.findOne({
      where: { medi_id: data.medi_id, connect: data.connect },
    });

    if (exists) {
      throw new ConflictException('이미 등록된 영양제입니다.');
    }

    // 🔥 자동 슬롯 할당: 영양제 + 의약품 합쳐서 최대 3개 제한
    let assignedSlot: number;
    
    if (data.slot && data.slot >= 1 && data.slot <= 3) {
      // 사용자가 지정한 슬롯이 있고 유효한 경우
      const existingMachine = await this.machineRepo.findOne({
        where: { owner: data.connect, slot: data.slot },
      });
      
      if (existingMachine) {
        throw new ConflictException(`${data.slot}번 슬롯은 이미 사용 중입니다.`);
      }
      assignedSlot = data.slot;
    } else {
      // 🔥 영양제 + 의약품 전체 슬롯 사용 현황 조회 
      const usedMachines = await this.machineRepo.find({
        where: { owner: data.connect },
        select: ['machine_id', 'slot', 'medi_id']
      });
      
      console.log(`🔍 영양제+의약품 - connect: ${data.connect}의 전체 Machine 레코드:`, usedMachines);
      
      const usedSlots = usedMachines.map(machine => machine.slot).filter(slot => slot !== null);
      console.log(`🔍 영양제+의약품 - 현재 사용 중인 슬롯들:`, usedSlots);
      
      // 🔥 이미 3개 슬롯이 모두 사용 중인 경우 에러
      if (usedSlots.length >= 3) {
        throw new ConflictException('의약품과 영양제는 총 3개까지만 등록 가능합니다.');
      }
      
      // 1번부터 3번까지 순차적으로 빈 슬롯 찾기
      assignedSlot = 1;
      while (usedSlots.includes(assignedSlot) && assignedSlot <= 3) {
        console.log(`🔍 영양제+의약품 - 슬롯 ${assignedSlot}번은 이미 사용 중, 다음 슬롯 확인...`);
        assignedSlot++;
      }
      
      if (assignedSlot > 3) {
        throw new ConflictException('의약품과 영양제는 총 3개까지만 등록 가능합니다.');
      }
      
      console.log(`🔥 영양제 자동 할당된 슬롯: ${assignedSlot}번 (connect: ${data.connect})`);
    }

    // medicine 테이블에 저장 (🔥 target_users 추가)
    const supplement = this.medicineRepo.create({
      medi_id: data.medi_id,
      connect: data.connect,
      name: data.name,
      warning: data.warning ?? false,
      start_date: data.start_date ? new Date(data.start_date) : null,
      end_date: data.end_date ? new Date(data.end_date) : null,
      target_users: target_users, // 🔥 영양제도 유저 선택 기능 추가
    } as Medicine);

    const savedSupplement = await this.medicineRepo.save(supplement);
    
    if (target_users === null) {
      console.log(`🔥 영양제 저장 완료 - connect: ${data.connect}, medi_id: ${medi_id}, 가족 공통 영양제`);
    } else {
      console.log(`🔥 영양제 저장 완료 - connect: ${data.connect}, medi_id: ${medi_id}, 개인 지정 영양제:`, target_users);
    }

    // 🔥 영양제도 Machine 테이블에 슬롯 정보 저장
    const newMachine = this.machineRepo.create({
      machine_id: parentUser.m_uid, // 기존 기기 ID 재사용
      medi_id: medi_id, // 🔥 복합키이므로 반드시 필요
      owner: data.connect,
      slot: assignedSlot,
      total: 100, // 영양제 기본 총량
      remain: 100, // 영양제 기본 잔여량
      error_status: '',
      last_error_at: new Date()
    });

    await this.machineRepo.save(newMachine);
    console.log(`🔥 영양제 Machine 레코드 생성: ${parentUser.m_uid} - 슬롯 ${assignedSlot}번에 ${medi_id} 등록`);

    // 🔥 할당된 슬롯 정보를 포함한 응답 반환
    return {
      ...savedSupplement,
      slot: assignedSlot // 프론트엔드에서 할당된 슬롯 정보 확인 가능
    } as any;
  }

  // 3. 영양제 상세 조회
  async getSupplementDetails(
    connect: string,
    medi_id: string,
  ): Promise<Medicine> {
    const supplement = await this.medicineRepo.findOne({
      where: { connect, medi_id },
    });

    if (!supplement) {
      throw new NotFoundException('영양제를 찾을 수 없습니다.');
    }

    return supplement;
  }

  // 4. 스케줄 저장 (Mock)
  async saveSupplementSchedule(): Promise<{
    success: boolean;
    message: string;
  }> {
    // 실제 영양제 스케줄 저장 로직을 여기에 구현
    // 예: 데이터베이스 저장 등
    await Promise.resolve(); // 비동기 작업을 시뮬레이션

    // data 사용 로직은 실제 구현 시 추가...

    return {
      success: true,
      message: '영양제 스케줄이 저장되었습니다.',
    };
  }

  // 5. 잔여량 정보 조회 (경고 상태만 제공)
  async getSupplementInventory(
    connect: string,
  ): Promise<{ medi_id: string; name: string; warning: boolean }[]> {
    const supplements = await this.medicineRepo.find({ where: { connect } });
    return supplements.map((m) => ({
      medi_id: m.medi_id,
      name: m.name,
      warning: !!m.warning,
    }));
  }

  // 6. 경고 상태 수동 업데이트
  async updateWarning(
    connect: string,
    data: { supplementId: string; warning: boolean },
  ) {
    const supplement = await this.medicineRepo.findOne({
      where: { medi_id: data.supplementId, connect },
    });

    if (!supplement) {
      throw new NotFoundException('영양제를 찾을 수 없습니다.');
    }

    supplement.warning = data.warning;
    return this.medicineRepo.save(supplement);
  }

  // 7. 복용 완료 처리 → 경고 true 전환
  async completeSupplement(connect: string, data: { supplementId: string }) {
    const supplement = await this.medicineRepo.findOne({
      where: { medi_id: data.supplementId, connect },
    });

    if (!supplement) {
      throw new NotFoundException('영양제를 찾을 수 없습니다.');
    }

    if (supplement.warning === true) {
      return {
        success: false,
        message: '이미 복용 완료되었거나 재고가 부족합니다.',
      };
    }

    supplement.warning = true; // 복용 완료로 표시
    await this.medicineRepo.save(supplement);

    return {
      success: true,
      completedAt: new Date(),
      supplementId: data.supplementId,
    };
  }
}
