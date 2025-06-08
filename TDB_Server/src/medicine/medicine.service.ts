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
    console.log(`🔍 [Service] 약 목록 조회 시작: connect=${connect}`);
    
    // 🔥 Machine 테이블과 조인하여 슬롯 정보 포함 + target_users 필드 포함
    const medicines = await this.medicineRepo.find({
      where: { connect },
      select: ['medi_id', 'connect', 'name', 'warning', 'start_date', 'end_date', 'target_users']
    });

    console.log(`🔍 [Service] Medicine 테이블에서 조회된 약 개수: ${medicines.length}`);
    
    // 🔥 약물별 target_users 값 디버깅
    medicines.forEach((medicine, index) => {
      console.log(`🔍 [Service] 약물 ${index + 1}: ${medicine.name}`);
      console.log(`  medi_id: ${medicine.medi_id}`);
      console.log(`  target_users:`, medicine.target_users);
      console.log(`  target_users 타입:`, typeof medicine.target_users);
      console.log(`  target_users null 체크:`, medicine.target_users === null);
      console.log(`  target_users Array 체크:`, Array.isArray(medicine.target_users));
    });

    // 각 약에 대해 Machine 테이블에서 슬롯 정보 조회
    const medicinesWithSlot = await Promise.all(
      medicines.map(async (medicine) => {
        console.log(`🔍 [Service] Medicine: ${medicine.name} (medi_id: ${medicine.medi_id}, connect: ${connect}) Machine 조회 시작`);
        
        const machine = await this.machineRepo.findOne({
          where: { medi_id: medicine.medi_id, owner: connect },
          select: ['slot', 'total', 'remain', 'machine_id']
        });

        console.log(`🔍 [Service] Machine 조회 결과:`, machine ? {
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

        console.log(`🔍 [Service] Schedule 조회 결과:`, schedule ? { dose: schedule.dose } : 'Schedule 레코드 없음');

        const result = {
          ...medicine,
          slot: machine?.slot || null,
          total: machine?.total || null,
          remain: machine?.remain || null,
          // 🔥 실제 저장된 복용량 사용, 없으면 기본값 '1'
          totalQuantity: machine?.total?.toString() || null,
          doseCount: schedule?.dose?.toString() || '1',
          // 🔥 target_users 필드 명시적으로 포함 확인
          target_users: medicine.target_users,
        };

        console.log(`🎯 [Service] 최종 결과 (${medicine.name}):`, {
          medi_id: result.medi_id,
          name: result.name,
          slot: result.slot,
          totalQuantity: result.totalQuantity,
          doseCount: result.doseCount,
          target_users: result.target_users // 🔥 target_users 포함 확인
        });

        // 🔥 슬롯 정보가 없는 경우 경고 로그
        if (!result.slot) {
          console.warn(`⚠️ [Service] 경고: ${medicine.name}에 슬롯 정보가 없습니다! Machine 레코드를 확인하세요.`);
        }

        return result;
      })
    );

    console.log(`🎯 [Service] 최종 반환될 약 목록 (슬롯 정보 포함):`, 
      medicinesWithSlot.map(m => ({ 
        name: m.name, 
        medi_id: m.medi_id, 
        slot: (m as any).slot 
      }))
    );

    return medicinesWithSlot;
  }

  async addMedicine(
    connect: string,
    dto: Partial<Medicine> & { slot?: number; total?: number; remain?: number; target_users?: string[] | null },
  ): Promise<Medicine> {
    const { medi_id, target_users } = dto;
    
    console.log(`🔍 약 저장 요청 - connect: ${connect}, target_users:`, target_users);
    
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

    // 🔥 개선된 자동 슬롯 할당 로직 (max_slot 3개 고정)
    let assignedSlot: number;
    
    const maxSlot = 3; // 하드코딩된 3개 슬롯
    console.log(`🔍 디스펜서 최대 슬롯: ${maxSlot}개 (고정값)`);

    if (dto.slot && dto.slot >= 1 && dto.slot <= maxSlot) {
      // 사용자가 지정한 슬롯이 유효한 경우
      const slotCheck = await this.machineRepo.findOne({
        where: { owner: connect, slot: dto.slot },
      });

      if (slotCheck) {
        throw new ConflictException(`${dto.slot}번 슬롯은 이미 사용 중입니다. (${slotCheck.medi_id})`);
      }

      assignedSlot = dto.slot;
      console.log(`🔥 사용자 지정 슬롯 사용: ${assignedSlot}번`);
    } else {
      // 자동 슬롯 할당 (1번부터 순차 검색)
      const usedSlots = await this.machineRepo.find({
        where: { owner: connect },
        select: ['machine_id', 'slot'],
      });

      const slotNumbers = usedSlots.map(m => m.slot).filter(slot => slot !== null);
      console.log(`🔍 현재 사용 중인 슬롯: [${slotNumbers.join(', ')}]`);

      assignedSlot = 1;
      while (slotNumbers.includes(assignedSlot) && assignedSlot <= maxSlot) {
        assignedSlot++;
      }

      if (assignedSlot > maxSlot) {
        throw new ConflictException(`사용 가능한 디스펜서 슬롯이 없습니다. (최대 ${maxSlot}개)`);
      }

      console.log(`🔥 자동 할당된 슬롯: ${assignedSlot}번`);
    }

    // Medicine 레코드 저장
    const medicine = this.medicineRepo.create({
      ...dto,
      medi_id,
      connect,
      target_users, // 🔥 target_users 필드 추가
    });

    const savedMedicine = await this.medicineRepo.save(medicine);
    
    if (target_users === null) {
      console.log(`🔥 약 저장 완료 - connect: ${connect}, medi_id: ${medi_id}, 가족 공통 약물`);
    } else {
      console.log(`🔥 약 저장 완료 - connect: ${connect}, medi_id: ${medi_id}, 개인 지정 약물:`, target_users);
    }

    // 🔥 Machine 테이블에 슬롯 정보 저장 (복합키 구조)
    const machineRecord = this.machineRepo.create({
      machine_id: parentUser.m_uid, // 실제 디스펜서 UID 사용
      medi_id,
      owner: connect,
      slot: assignedSlot,
      total: dto.total || 100,
      remain: dto.remain || dto.total || 100,
      error_status: '',
      last_error_at: new Date(),
      max_slot: 3, // 항상 3으로 고정
    });

    await this.machineRepo.save(machineRecord);

    console.log(`✅ Machine 레코드 생성 완료: machine_id=${parentUser.m_uid}, medi_id=${medi_id} - 슬롯 ${assignedSlot}번 등록`);

    return {
      ...savedMedicine,
      slot: assignedSlot,
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
      // 1. 해당 약물이 존재하는지 먼저 확인
      const existingMedicine = await queryRunner.query(
        'SELECT medi_id, name FROM medicine WHERE medi_id = ? AND connect = ?',
        [medi_id, connect]
      );
      
      if (!existingMedicine || existingMedicine.length === 0) {
        console.log(`⚠️ 삭제할 약물이 존재하지 않음: medi_id=${medi_id}, connect=${connect}`);
        await queryRunner.commitTransaction();
        return { success: true }; // 이미 삭제된 것으로 간주
      }
      
      console.log(`✅ 삭제할 약물 확인: ${existingMedicine[0].name}`);

      // 2. 관련 레코드 확인 및 삭제 (순서 중요: 외래키 제약 조건 고려)
      
      // 2-1. DoseHistory 테이블에서 해당 약물 기록 삭제 (가장 먼저)
      const doseHistoryResult = await queryRunner.query(
        'DELETE FROM dose_history WHERE medi_id = ?',
        [medi_id]
      );
      console.log(`🔥 DoseHistory에서 ${doseHistoryResult.affectedRows}개 레코드 삭제`);

      // 2-2. Schedule 테이블에서 해당 약물 스케줄 삭제
      const scheduleResult = await queryRunner.query(
        'DELETE FROM schedule WHERE medi_id = ? AND connect = ?',
        [medi_id, connect]
      );
      console.log(`🔥 Schedule에서 ${scheduleResult.affectedRows}개 레코드 삭제`);

      // 2-3. Machine 테이블에서 해당 약물 기계 정보 삭제
      // medi_id가 PrimaryColumn이므로 해당 레코드 자체를 삭제
      const machineResult = await queryRunner.query(
        'DELETE FROM machine WHERE medi_id = ? AND owner = ?',
        [medi_id, connect]
      );
      console.log(`🔥 Machine에서 ${machineResult.affectedRows}개 레코드 삭제`);

      // 2-4. 혹시 다른 connect에서도 같은 medi_id를 참조하는 Machine 레코드가 있는지 확인 후 삭제
      const otherMachineResult = await queryRunner.query(
        'DELETE FROM machine WHERE medi_id = ?',
        [medi_id]
      );
      if (otherMachineResult.affectedRows > 0) {
        console.log(`🔥 다른 사용자의 Machine에서 ${otherMachineResult.affectedRows}개 레코드 추가 삭제`);
      }

      // 3. 최종적으로 Medicine 테이블에서 삭제
      const medicineResult = await queryRunner.query(
        'DELETE FROM medicine WHERE medi_id = ? AND connect = ?',
        [medi_id, connect]
      );

      if (medicineResult.affectedRows === 0) {
        console.log(`⚠️ Medicine 테이블에서 삭제할 레코드가 없음 (이미 삭제됨)`);
      } else {
        console.log(`🔥 Medicine에서 ${medicineResult.affectedRows}개 레코드 삭제 완료`);
      }

      // 트랜잭션 커밋
      await queryRunner.commitTransaction();
      console.log(`✅ 약 삭제 트랜잭션 완료: medi_id=${medi_id}`);
      
      return { success: true };
      
    } catch (error) {
      // 트랜잭션 롤백
      await queryRunner.rollbackTransaction();
      console.error(`❌ 약 삭제 실패 (롤백): medi_id=${medi_id}`, error);
      
      // 상세한 에러 정보 로깅
      if (error.code) {
        console.error(`📋 MySQL 에러 코드: ${error.code}`);
        console.error(`📋 MySQL 에러 메시지: ${error.sqlMessage}`);
      }
      
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

  // 🔥 새로 추가: 사용자별 약물 조회 (권한 포함)
  async getMedicineListByUser(userId: string): Promise<any[]> {
    console.log(`🔍 [Service] 사용자별 약물 조회: userId=${userId}`);
    
    // 1. 사용자 정보 조회
    const user = await this.userRepo.findOne({
      where: { user_id: userId },
      select: ['user_id', 'connect', 'role', 'name']
    });
    
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    
    console.log(`🔍 [Service] 사용자 정보:`, {
      user_id: user.user_id,
      connect: user.connect,
      role: user.role,
      name: user.name
    });
    
    console.log(`🔧 [Service] 사용자 정보 상세:`, {
      'user.user_id 타입': typeof user.user_id,
      'user.user_id 길이': user.user_id?.length,
      'user.user_id HEX': Buffer.from(user.user_id || '', 'utf8').toString('hex'),
      'userId 파라미터': userId,
      'userId 파라미터 타입': typeof userId,
      'userId 파라미터 길이': userId?.length,
      'userId 파라미터 HEX': Buffer.from(userId || '', 'utf8').toString('hex'),
      '두 값 일치 여부': user.user_id === userId
    });
    
    // 2. 해당 가족(connect)의 모든 약물 조회 - target_users 필드 명시적 포함
    const medicines = await this.medicineRepo.find({
      where: { connect: user.connect as string },
      select: ['medi_id', 'connect', 'name', 'warning', 'start_date', 'end_date', 'target_users']
    });
    
    console.log(`🔍 [Service] RAW 데이터베이스 조회 결과:`, medicines.map(med => ({
      medi_id: med.medi_id,
      name: med.name,
      target_users_raw: med.target_users,
      target_users_type: typeof med.target_users,
      target_users_string: JSON.stringify(med.target_users)
    })));
    
    console.log(`🔍 [Service] 가족 전체 약물 개수: ${medicines.length}`);
    
    // 🔥 약물별 target_users 값 디버깅
    medicines.forEach((medicine, index) => {
      console.log(`🔍 [Service] 약물 ${index + 1}: ${medicine.name}`);
      console.log(`  medi_id: ${medicine.medi_id}`);
      console.log(`  target_users:`, medicine.target_users);
      console.log(`  target_users 타입:`, typeof medicine.target_users);
      console.log(`  target_users null 체크:`, medicine.target_users === null);
      console.log(`  target_users Array 체크:`, Array.isArray(medicine.target_users));
    });
    
    // 3. 각 약물에 대해 권한 판단 및 추가 정보 조회
    const medicinesWithPermission = await Promise.all(
      medicines.map(async (medicine) => {
        // 🔥 권한 판단 로직 강화 - 부모는 모든 약물 접근 가능
        let permission = 'others';
        
        console.log(`🔍 [Service] ${medicine.name} 권한 판단:`);
        console.log(`  target_users:`, medicine.target_users);
        console.log(`  target_users JSON:`, JSON.stringify(medicine.target_users));
        console.log(`  요청한 userId:`, userId);
        console.log(`  요청한 userId 타입:`, typeof userId);
        console.log(`  사용자 role:`, user.role);
        console.log(`  UserRole.PARENT:`, UserRole.PARENT);
        
        // 🎯 부모 계정은 모든 약물에 접근 가능
        if (user.role === UserRole.PARENT) {
          permission = 'own';
          console.log(`  → 결과: 부모 계정 - 모든 약물 관리 가능 (own)`);
        } else if (medicine.target_users === null || medicine.target_users === undefined) {
          // 공통약 (전체 가족)
          permission = 'own';
          console.log(`  → 결과: 가족 공통 약물 (own)`);
        } else if (Array.isArray(medicine.target_users)) {
          console.log(`  📋 배열 요소들:`, medicine.target_users);
          medicine.target_users.forEach((targetUserId, index) => {
            console.log(`    [${index}] "${targetUserId}" (타입: ${typeof targetUserId}) vs "${userId}" (타입: ${typeof userId})`);
            console.log(`    [${index}] 일치 여부: ${targetUserId === userId}`);
          });
          
          // 🔥 공백 및 인코딩 문제 해결을 위한 정규화된 비교
          const normalizedUserId = decodeURIComponent(userId).trim();
          const normalizedTargetUsers = medicine.target_users.map(id => decodeURIComponent(id).trim());
          
          console.log(`  🔧 정규화된 userId: "${normalizedUserId}"`);
          console.log(`  🔧 정규화된 target_users:`, normalizedTargetUsers);
          
          const isIncluded = normalizedTargetUsers.includes(normalizedUserId);
          console.log(`  🎯 includes() 결과:`, isIncluded);
          
          if (isIncluded) {
            // 개인 지정약 - 본인 포함
            permission = 'own';
            console.log(`  → 결과: 개인 지정 약물 - 본인 포함 (own)`);
          } else {
          permission = 'others';
          console.log(`  → 결과: 개인 지정 약물 - 본인 미포함 (others), 대상:`, medicine.target_users);
          }
        } else {
          permission = 'others';
          console.log(`  → 결과: 알 수 없는 형태 (others), target_users:`, medicine.target_users);
        }
        
        // Machine 정보 조회
        const machine = await this.machineRepo.findOne({
          where: { 
            medi_id: medicine.medi_id, 
            owner: user.connect as string
          },
          select: ['slot', 'total', 'remain', 'machine_id']
        });
        
        // 해당 사용자의 스케줄 조회 (권한이 있는 경우만)
        let scheduleInfo: any = null;
        if (permission === 'own') {
          const schedule = await this.scheduleRepo.findOne({
            where: { medi_id: medicine.medi_id, user_id: userId },
            select: ['dose']
          });
          scheduleInfo = schedule;
        }
        
        console.log(`🔍 [Service] ${medicine.name} - 권한: ${permission}, 슬롯: ${machine?.slot}, 복용량: ${scheduleInfo?.dose || 'N/A'}`);
        
        return {
          ...medicine,
          permission, // 'own' | 'others'
          slot: machine?.slot || null,
          total: machine?.total || null,
          remain: machine?.remain || null,
          totalQuantity: machine?.total?.toString() || null,
          doseCount: scheduleInfo?.dose?.toString() || '1',
          // 약물 소유자 정보 (타인 약물인 경우 표시용)
          ownerInfo: permission === 'others' ? {
            isCommon: medicine.target_users === null,
            targetUsers: medicine.target_users
          } : null
        };
      })
    );
    
    console.log(`🎯 [Service] 최종 반환: 총 ${medicinesWithPermission.length}개 약물 (권한별 구분 완료)`);
    
    return medicinesWithPermission;
  }

  /**
   * 수동 배출 처리
   */
  async processManualDispense(request: {
    medi_id: string;
    slot: number;
    m_uid: string;
    dispense_count: number;
    reason: 'guidance' | 'missed' | 'emergency' | 'extra';
  }): Promise<{
    dispense_id: string;
    success: boolean;
    message: string;
    remaining_amount: number;
    dispensed_count: number;
  }> {
    console.log('🔥 [Service] 수동 배출 처리 시작:', request);
    
    // 1. 해당 약물의 Machine 정보 조회
    const machine = await this.machineRepo.findOne({
      where: { 
        medi_id: request.medi_id,
        slot: request.slot
      }
    });
    
    if (!machine) {
      throw new NotFoundException(`슬롯 ${request.slot}에서 약물 ${request.medi_id}를 찾을 수 없습니다.`);
    }
    
    console.log('🔥 [Service] 현재 Machine 상태:', {
      medi_id: machine.medi_id,
      slot: machine.slot,
      current_remain: machine.remain,
      request_count: request.dispense_count
    });
    
    // 2. 잔량 확인
    if (machine.remain < request.dispense_count) {
      throw new ConflictException(`잔량이 부족합니다. 현재 잔량: ${machine.remain}정, 요청 개수: ${request.dispense_count}정`);
    }
    
    // 3. 잔량 차감
    const newRemain = machine.remain - request.dispense_count;
    await this.machineRepo.update(
      { medi_id: request.medi_id, slot: request.slot },
      { remain: newRemain }
    );
    
    console.log('🔥 [Service] 잔량 업데이트 완료:', {
      previous_remain: machine.remain,
      dispensed: request.dispense_count,
      new_remain: newRemain
    });
    
    // 4. 배출 ID 생성 (실제로는 UUID 등을 사용)
    const dispenseId = `manual_${Date.now()}_${request.medi_id}`;
    
    // 5. 성공 응답 반환
    return {
      dispense_id: dispenseId,
      success: true,
      message: `${request.dispense_count}정이 성공적으로 배출되었습니다.`,
      remaining_amount: newRemain,
      dispensed_count: request.dispense_count
    };
  }
}
