import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Medicine } from './entities/medicine.entity';
import { Machine } from '../machine/entities/machine.entity';
import { User, UserRole } from '../users/entities/users.entity';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Schedule } from '../schedule/entities/schedule.entity';

// 외부 API 응답 타입 정의
interface DrugApiResponse {
  body?: {
    items?: DrugApiItem | DrugApiItem[];
  };
}

interface DrugApiItem {
  itemSeq?: string;
  itemName?: string;
  entpName?: string;
  efcyQesitm?: string;
  useMethodQesitm?: string;
  atpnWarnQesitm?: string;
  packUnit?: string;
}

interface MedicineSearchResult {
  itemSeq: string;
  itemName: string;
  entpName: string;
  efcyQesitm: string;
  useMethodQesitm: string;
  atpnWarnQesitm: string;
  packUnit: string;
}

@Injectable()
export class MedicineService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('OPEN_DRUG_API_KEY')!;
    this.baseUrl = this.configService.get<string>('OPEN_DRUG_API_BASE_URL')!;

    if (!this.apiKey || !this.baseUrl) {
      throw new InternalServerErrorException(
        '의약품 API 환경변수가 누락되었습니다.',
      );
    }
  }

  async getMedicineListByConnect(connect: string): Promise<Medicine[]> {
    // 🔥 Machine 테이블과 조인하여 슬롯 정보 포함
    const medicines = await this.medicineRepo.find({
      where: { connect },
    });

    // 각 약에 대해 Machine 테이블에서 슬롯 정보 조회
    const medicinesWithSlot = await Promise.all(
      medicines.map(async (medicine) => {
        console.log(`🔍 Medicine: ${medicine.name} (medi_id: ${medicine.medi_id}, connect: ${connect}) Machine 조회 시작`);
        
        const machine = await this.machineRepo.findOne({
          where: { medi_id: medicine.medi_id, owner: connect },
          select: ['slot', 'total', 'remain', 'machine_id']
        });

        console.log(`🔍 Machine 조회 결과:`, machine ? {
          machine_id: machine.machine_id,
          slot: machine.slot,
          total: machine.total,
          remain: machine.remain
        } : 'Machine 레코드 없음');

        // 🔥 Schedule 테이블에서 실제 저장된 복용량 조회
        const schedule = await this.scheduleRepo.findOne({
          where: { medi_id: medicine.medi_id, connect },
          select: ['dose']
        });

        console.log(`🔍 Schedule 조회 결과:`, schedule ? { dose: schedule.dose } : 'Schedule 레코드 없음');

        const result = {
          ...medicine,
          slot: machine?.slot || null,
          total: machine?.total || null,
          remain: machine?.remain || null,
          // 🔥 실제 저장된 복용량 사용, 없으면 기본값 '1'
          totalQuantity: machine?.total?.toString() || null,
          doseCount: schedule?.dose?.toString() || '1',
        };

        console.log(`🎯 최종 결과 (${medicine.name}):`, {
          slot: result.slot,
          totalQuantity: result.totalQuantity,
          doseCount: result.doseCount
        });

        return result;
      })
    );

    return medicinesWithSlot;
  }

  async addMedicine(
    connect: string,
    dto: Partial<Medicine> & { slot?: number; total?: number; remain?: number },
  ): Promise<Medicine> {
    const { medi_id } = dto;
    
    // 🔥 기기 연동 상태 확인 - connect 그룹의 부모 계정 m_uid 체크
    const parentUser = await this.userRepo.findOne({
      where: { connect, role: UserRole.PARENT },
      select: ['m_uid', 'user_id', 'name']
    });
    
    if (!parentUser?.m_uid) {
      throw new ConflictException('스마트 디스펜서가 연동되지 않았습니다. 메인 계정에서 기기를 먼저 연동해주세요.');
    }

    // 🚨 중요: Medicine은 부모 계정(connect 기준)에서만 저장 가능
    // 자식 계정에서는 스케줄만 저장할 수 있음
    console.log(`🔍 약 저장 요청 - connect: ${connect}, 부모 user_id: ${parentUser.user_id}`);

    const existing = await this.medicineRepo.findOne({
      where: { medi_id, connect },
    });

    if (existing) {
      throw new ConflictException('이미 존재하는 약입니다.');
    }

    // 🔥 개선된 자동 슬롯 할당 로직
    let assignedSlot: number;
    
    if (dto.slot && dto.slot >= 1 && dto.slot <= 6) {
      // 사용자가 지정한 슬롯이 있고 유효한 경우 (관리자 전용)
      const existingMachine = await this.machineRepo.findOne({
        where: { owner: connect, slot: dto.slot },
      });
      
      if (existingMachine) {
        throw new ConflictException(`${dto.slot}번 슬롯은 이미 사용 중입니다.`);
      }
      assignedSlot = dto.slot;
    } else {
      // 🔥 자동 슬롯 할당: 사용 중인 슬롯 조회 후 빈 슬롯 찾기
      const usedMachines = await this.machineRepo.find({
        where: { owner: connect },
        select: ['slot', 'machine_id', 'medi_id']
      });
      
      console.log(`🔍 connect: ${connect}의 기존 Machine 레코드:`, usedMachines);
      
      const usedSlots = usedMachines.map(machine => machine.slot).filter(slot => slot !== null);
      console.log(`🔍 현재 사용 중인 슬롯들:`, usedSlots);
      
      // 1번부터 6번까지 순차적으로 빈 슬롯 찾기
      assignedSlot = 1;
      while (usedSlots.includes(assignedSlot) && assignedSlot <= 6) {
        console.log(`🔍 슬롯 ${assignedSlot}번은 이미 사용 중, 다음 슬롯 확인...`);
        assignedSlot++;
      }
      
      if (assignedSlot > 6) {
        throw new ConflictException('사용 가능한 디스펜서 슬롯이 없습니다. (최대 6개)');
      }
      
      console.log(`🔥 자동 할당된 슬롯: ${assignedSlot}번 (connect: ${connect})`);
    }

    // 🚨 Medicine 테이블에 저장 - connect 기준 (가족 공통)
    const newMedicine = this.medicineRepo.create({
      medi_id,
      connect, // 가족 그룹 단위로 저장 (부모/자식 공통)
      name: dto.name,
      warning: dto.warning ?? false,
      start_date: dto.start_date,
      end_date: dto.end_date,
    });

    const savedMedicine = await this.medicineRepo.save(newMedicine);
    console.log(`🔥 Medicine 저장 완료 - connect: ${connect}, medi_id: ${medi_id}, 가족 공통 약`);

    // 🔥 각 약품마다 별도의 Machine 레코드 생성 (슬롯별 고유 ID)
    const slotMachineId = `${parentUser.m_uid}_SLOT${assignedSlot}`;
    const newMachine = this.machineRepo.create({
      machine_id: slotMachineId, // 슬롯별 고유 ID
      medi_id: medi_id || null,
      owner: connect,
      slot: assignedSlot,
      total: dto.total || 100,
      remain: dto.remain || dto.total || 100,
      error_status: '',
      last_error_at: new Date()
    });

    await this.machineRepo.save(newMachine);
    console.log(`🔥 새 Machine 레코드 생성: ${slotMachineId} - 슬롯 ${assignedSlot}번에 ${medi_id} 등록`);

    // 🔥 할당된 슬롯 정보를 포함한 응답 반환
    return {
      ...savedMedicine,
      slot: assignedSlot // 프론트엔드에서 할당된 슬롯 정보 확인 가능
    } as any;
  }

  async findOne(medi_id: string, connect: string): Promise<Medicine> {
    const medicine = await this.medicineRepo.findOne({
      where: { medi_id, connect },
    });

    if (!medicine) {
      throw new NotFoundException('해당 약을 찾을 수 없습니다.');
    }

    return medicine;
  }

  async updateMedicine(
    medi_id: string,
    connect: string,
    updateDto: Partial<Medicine>,
  ): Promise<Medicine> {
    const medicine = await this.medicineRepo.findOne({
      where: { medi_id, connect },
    });

    if (!medicine) {
      throw new NotFoundException('해당 약을 찾을 수 없습니다.');
    }


    Object.assign(medicine, updateDto);
    return this.medicineRepo.save(medicine);
  }

  async deleteMedicine(
    medi_id: string,
    connect: string,
  ): Promise<{ success: true }> {
    console.log(`🔥 약 삭제 시작: medi_id=${medi_id}, connect=${connect}`);

    // 트랜잭션을 사용하여 안전하게 삭제
    const queryRunner = this.medicineRepo.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. 삭제할 관련 레코드 확인
      const scheduleCount = await queryRunner.query(
        'SELECT COUNT(*) as count FROM schedule WHERE medi_id = ? AND connect = ?',
        [medi_id, connect]
      );
      console.log(`🔍 삭제할 Schedule 레코드 수: ${scheduleCount[0].count}`);

      const machineCount = await queryRunner.query(
        'SELECT COUNT(*) as count FROM machine WHERE medi_id = ? AND owner = ?',
        [medi_id, connect]
      );
      console.log(`🔍 삭제할 Machine 레코드 수: ${machineCount[0].count}`);

      // 2. Schedule 레코드 삭제
      if (scheduleCount[0].count > 0) {
        const scheduleResult = await queryRunner.query(
      'DELETE FROM schedule WHERE medi_id = ? AND connect = ?',
      [medi_id, connect]
    );
        console.log(`🔥 Schedule 테이블에서 ${scheduleResult.affectedRows}개 레코드 삭제 완료`);
      } else {
        console.log(`🔍 삭제할 Schedule 레코드 없음`);
      }

      // 3. Machine 레코드 삭제
      if (machineCount[0].count > 0) {
        const machineResult = await queryRunner.query(
      'DELETE FROM machine WHERE medi_id = ? AND owner = ?',
      [medi_id, connect]
    );
        console.log(`🔥 Machine 테이블에서 ${machineResult.affectedRows}개 레코드 삭제 완료`);
      } else {
        console.log(`🔍 삭제할 Machine 레코드 없음`);
      }

      // 4. 최종 확인: 아직 참조하는 레코드가 있는지 확인
      const remainingMachineCount = await queryRunner.query(
        'SELECT COUNT(*) as count FROM machine WHERE medi_id = ?',
        [medi_id]
      );
      
      if (remainingMachineCount[0].count > 0) {
        console.log(`⚠️ 경고: 여전히 ${remainingMachineCount[0].count}개의 Machine 레코드가 medi_id를 참조하고 있습니다.`);
        
        // 모든 Machine 레코드에서 해당 medi_id 참조 제거
        const clearResult = await queryRunner.query(
          'UPDATE machine SET medi_id = NULL WHERE medi_id = ?',
          [medi_id]
        );
        console.log(`🔥 Machine 테이블에서 medi_id 참조 ${clearResult.affectedRows}개 제거 완료`);
      }

      // 5. Medicine 테이블에서 삭제
      const medicineResult = await queryRunner.query(
        'DELETE FROM medicine WHERE medi_id = ? AND connect = ?',
        [medi_id, connect]
      );

      if (medicineResult.affectedRows === 0) {
      throw new NotFoundException('삭제할 약을 찾을 수 없습니다.');
    }

      console.log(`🔥 Medicine 테이블에서 ${medicineResult.affectedRows}개 레코드 삭제 완료`);

      // 트랜잭션 커밋
      await queryRunner.commitTransaction();
      console.log(`✅ 약 삭제 트랜잭션 완료: medi_id=${medi_id}`);
      
    return { success: true };
    } catch (error) {
      // 트랜잭션 롤백
      await queryRunner.rollbackTransaction();
      console.error(`❌ 약 삭제 실패 (롤백): medi_id=${medi_id}`, error);
      throw error;
    } finally {
      // 연결 해제
      await queryRunner.release();
    }
  }

  async searchByName(connect: string, name: string): Promise<Medicine[]> {
    return this.medicineRepo.find({
      where: {
        connect,
        name,
      },
    });
  }

  async searchMedicineByName(
    itemName: string,
  ): Promise<MedicineSearchResult[]> {
    try {
      const response = await axios.get<DrugApiResponse>(this.baseUrl, {
        params: {
          serviceKey: this.apiKey,
          itemName,
          type: 'json',
          pageNo: 1,
          numOfRows: 20,
        },
      });

      const responseData = response.data;
      const items = responseData.body?.items || [];
      const results = Array.isArray(items) ? items : [items];

      return results.map(
        (item: DrugApiItem): MedicineSearchResult => ({
          itemSeq: item.itemSeq || '',
          itemName: item.itemName || '',
          entpName: item.entpName || '',
          efcyQesitm: item.efcyQesitm || '',
          useMethodQesitm: item.useMethodQesitm || '',
          atpnWarnQesitm: item.atpnWarnQesitm || '',
          packUnit: item.packUnit || '',
        }),
      );
    } catch {
      throw new InternalServerErrorException('의약품 검색 실패');
    }
  }

  async getMedicineDetails(
    itemSeq: string,
  ): Promise<MedicineSearchResult | null> {
    try {
      const response = await axios.get<DrugApiResponse>(this.baseUrl, {
        params: {
          serviceKey: this.apiKey,
          itemSeq,
          type: 'json',
        },
      });

      const responseData = response.data;
      const items = responseData.body?.items || [];
      const results = Array.isArray(items) ? items : [items];

      if (results.length === 0) return null;

      const item = results[0];
      return {
        itemSeq: item.itemSeq || '',
        itemName: item.itemName || '',
        entpName: item.entpName || '',
        efcyQesitm: item.efcyQesitm || '',
        useMethodQesitm: item.useMethodQesitm || '',
        atpnWarnQesitm: item.atpnWarnQesitm || '',
        packUnit: item.packUnit || '',
      };
    } catch {
      throw new InternalServerErrorException('의약품 상세 조회 실패');
    }
  }

  // 🔧 디버그용: 특정 connect의 Machine 데이터 정리
  async clearMachineData(connect: string): Promise<{ cleared: number }> {
    console.log(`🧹 Machine 테이블에서 connect: ${connect} 데이터 정리 시작`);
    
    const result = await this.machineRepo.delete({ owner: connect });
    console.log(`🧹 정리 완료: ${result.affected}개 레코드 삭제`);
    
    return { cleared: result.affected || 0 };
  }

  // 🔧 디버그용: 특정 connect의 모든 데이터 조회
  async debugConnectData(connect: string) {
    const machines = await this.machineRepo.find({
      where: { owner: connect },
      order: { slot: 'ASC' }
    });
    
    const medicines = await this.medicineRepo.find({
      where: { connect },
      order: { name: 'ASC' }
    });
    
    console.log(`🔍 connect: ${connect} 디버그 정보:`);
    console.log(`📦 Machine 레코드 (${machines.length}개):`, machines);
    console.log(`💊 Medicine 레코드 (${medicines.length}개):`, medicines);
    
    return { machines, medicines };
  }
}
