import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { MedicineService } from './medicine.service';
import { AccessTokenGuard } from '../auth/guard/bearer-token.guard';
import { Medicine } from './entities/medicine.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/users.entity';

@UseGuards(AccessTokenGuard)
@Controller('medicine')
export class MedicineController {
  constructor(
    private readonly medicineService: MedicineService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 🔥 새로 추가: 사용자별 약물 목록 조회 (권한 포함)
   */
  @Get('user/:userId')
  async getMedicineListByUser(@Param('userId') userId: string) {
    console.log(`🔍 [Controller] 사용자별 약물 조회 요청: userId=${userId}`);
    
    const medicines = await this.medicineService.getMedicineListByUser(userId);
    
    console.log(`🔍 [Controller] 조회된 약물 개수: ${medicines.length}`);
    medicines.forEach((medicine, index) => {
      console.log(`🔍 [Controller] 약물 ${index + 1}: ${medicine.name}`, {
        medi_id: medicine.medi_id,
        permission: medicine.permission,
        slot: medicine.slot,
        totalQuantity: medicine.totalQuantity,
        doseCount: medicine.doseCount
      });
    });
    
    return {
      success: true,
      data: medicines
    };
  }

  /**
   * 가족 연결 코드 기준 약 목록 조회
   */
  @Get('list/:connect')
  async getMedicineList(@Param('connect') connect: string) {
    console.log(`🔍 [Controller] 약 목록 조회 요청: connect=${connect}`);
    
    const medicines = await this.medicineService.getMedicineListByConnect(connect);
    
    console.log(`🔍 [Controller] 조회된 약 개수: ${medicines.length}`);
    medicines.forEach((medicine, index) => {
      console.log(`🔍 [Controller] 약 ${index + 1}: ${medicine.name}`, {
        medi_id: medicine.medi_id,
        slot: (medicine as any).slot,
        totalQuantity: (medicine as any).totalQuantity,
        doseCount: (medicine as any).doseCount
      });
    });
    
    // 🔥 표준화된 응답 형식으로 반환
    return {
      success: true,
      data: medicines
    };
  }

  /**
   * 약 정보 등록
   */
  @Post()
  async addMedicine(
    @Body('connect') connect: string,
    @Body()
    dto: {
      medi_id?: string;
      name?: string;
      warning?: boolean;
      start_date?: string;
      end_date?: string;
      target_users?: string[] | null;
      requestUser?: string;
    },
  ) {
    if (dto.requestUser) {
      const requestingUser = await this.userRepo.findOne({
        where: { user_id: dto.requestUser },
        select: ['role', 'connect']
      });
      
      if (!requestingUser) {
        throw new NotFoundException('요청 사용자를 찾을 수 없습니다.');
      }
      
      if (requestingUser.role !== 'parent') {
        throw new ConflictException('약 등록은 메인 계정(부모)만 가능합니다. 서브 계정은 스케줄만 설정할 수 있습니다.');
      }
      
      if (requestingUser.connect !== connect) {
        throw new ConflictException('다른 가족의 약을 등록할 수 없습니다.');
      }
      
      console.log(`🔍 약 등록 권한 확인 완료 - 부모 계정: ${dto.requestUser}, connect: ${connect}`);
    }

    const medicineData: Partial<Medicine> = {
      medi_id: dto.medi_id,
      name: dto.name,
      warning: dto.warning,
      start_date: dto.start_date ? new Date(dto.start_date) : undefined,
      end_date: dto.end_date ? new Date(dto.end_date) : undefined,
      target_users: dto.target_users,
    };
    
    console.log(`🔍 [Controller] 약물 등록 요청:`, {
      medi_id: dto.medi_id,
      name: dto.name,
      target_users: dto.target_users,
      requestUser: dto.requestUser
    });
    
    return this.medicineService.addMedicine(connect, medicineData);
  }

  /**
   * 약 상세 조회
   */
  @Get(':connect/:medi_id')
  async getMedicine(
    @Param('connect') connect: string,
    @Param('medi_id') medi_id: string,
  ) {
    return this.medicineService.findOne(medi_id, connect);
  }

  /**
   * 약 정보 수정
   */
  @Put(':id')
  async updateMedicine(
    @Param('id') id: string,
    @Body('connect') connect: string,
    @Body()
    updateDto: {
      name?: string;
      warning?: boolean;
      start_date?: string;
      end_date?: string;
    },
  ) {
    const medicineUpdateData: Partial<Medicine> = {
      name: updateDto.name,
      warning: updateDto.warning,
      start_date: updateDto.start_date
        ? new Date(updateDto.start_date)
        : undefined,
      end_date: updateDto.end_date ? new Date(updateDto.end_date) : undefined,
    };
    return this.medicineService.updateMedicine(id, connect, medicineUpdateData);
  }

  /**
   * 약 정보 삭제
   */
  @Delete(':connect/:medi_id')
  async deleteMedicine(
    @Param('connect') connect: string,
    @Param('medi_id') medi_id: string,
  ) {
    return this.medicineService.deleteMedicine(medi_id, connect);
  }

  /**
   * 약 이름으로 검색
   */
  @Get('search/:connect/:name')
  async searchMedicine(
    @Param('connect') connect: string,
    @Param('name') name: string,
  ) {
    return this.medicineService.searchByName(connect, name);
  }

  // 🔧 디버그용: 잘못된 Machine 데이터 정리
  @Post('debug/clear-machines/:connect')
  async clearMachineData(@Param('connect') connect: string) {
    return this.medicineService.clearMachineData(connect);
  }

  // 🔧 디버그용: connect 데이터 조회
  @Get('debug/connect/:connect')
  async debugConnectData(@Param('connect') connect: string) {
    return this.medicineService.debugConnectData(connect);
  }

  /**
   * 수동 배출 요청
   */
  @Post('manual-dispense')
  async requestManualDispense(@Body() request: {
    medi_id: string;
    slot: number;
    m_uid: string;
    dispense_count: number;
    reason: 'guidance' | 'missed' | 'emergency' | 'extra';
  }) {
    console.log('🔥 [Controller] 수동 배출 요청:', request);
    
    try {
      const result = await this.medicineService.processManualDispense(request);
      
      console.log('🔥 [Controller] 수동 배출 성공:', result);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('🔥 [Controller] 수동 배출 실패:', error);
      return {
        success: false,
        error: {
          message: error.message || '수동 배출 처리 중 오류가 발생했습니다.'
        }
      };
    }
  }
}
