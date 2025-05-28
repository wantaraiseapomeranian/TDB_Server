import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Medicine } from './entities/medicine.entity';
import { Repository } from 'typeorm';
import { Schedule } from 'src/schedule/entities/schedule.entity';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MedicineService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('OPEN_DRUG_API_KEY')!;
    this.baseUrl = this.configService.get<string>('OPEN_DRUG_API_BASE_URL')!;

    if (!this.apiKey || !this.baseUrl) {
      throw new InternalServerErrorException('의약품 API 환경변수가 누락되었습니다.');
    }
  }

  // 1. 구성원별 약 목록 조회
  async getMedicineListByMember(memberId: string): Promise<Medicine[]> {
    const schedules = await this.scheduleRepo.find({
      where: { user_id: memberId },
      relations: ['medicine'],
    });

    return schedules
      .map((s) => s.medicine)
      .filter((m) => m.type === 'medicine');
  }

  // 2. 약 정보 저장
  async addMedicine(memberId: string, medicineDto: Partial<Medicine>): Promise<Medicine> {
    const existing = await this.medicineRepo.findOne({
      where: { medi_id: medicineDto.medi_id, type: 'medicine' },
    });

    if (existing) {
      throw new ConflictException('이미 존재하는 약입니다.');
    }

    const medicine = this.medicineRepo.create({
      medi_id: medicineDto.medi_id,
      name: medicineDto.name,
      warning: medicineDto.warning ?? false,
      user_id: memberId,
      type: 'medicine',
    });

    return this.medicineRepo.save(medicine);
  }

  // 3. 약 정보 수정
  async updateMedicine(
    memberId: string,
    medicineId: string,
    medicineDto: Partial<Medicine>,
  ): Promise<Medicine> {
    const medicine = await this.medicineRepo.findOne({
      where: { medi_id: medicineId, type: 'medicine' },
    });

    if (!medicine) {
      throw new NotFoundException('해당 약을 찾을 수 없습니다.');
    }

    Object.assign(medicine, medicineDto);
    return this.medicineRepo.save(medicine);
  }

  // 4. 약 정보 삭제
  async deleteMedicine(memberId: string, medicineId: string): Promise<{ success: true }> {
    const result = await this.medicineRepo.delete({ medi_id: medicineId, user_id: memberId, type: 'medicine' });

    if (result.affected === 0) {
      throw new NotFoundException('삭제할 약을 찾을 수 없습니다.');
    }

    return { success: true };
  }

  // 5. 약 이름으로 외부 API 검색
  async searchMedicineByName(itemName: string) {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          serviceKey: this.apiKey,
          itemName,
          type: 'json',
          pageNo: 1,
          numOfRows: 20,
        },
      });

      const items = response.data.body?.items || [];
      const results = Array.isArray(items) ? items : [items];

      return results.map((item: any) => ({
        itemSeq: item.itemSeq || '',
        itemName: item.itemName || '',
        entpName: item.entpName || '',
        efcyQesitm: item.efcyQesitm || '',
        useMethodQesitm: item.useMethodQesitm || '',
        atpnWarnQesitm: item.atpnWarnQesitm || '',
        packUnit: item.packUnit || '',
      }));
    } catch (err) {
      throw new InternalServerErrorException('의약품 검색 실패');
    }
  }

  // 6. 약 상세 정보 조회
  async getMedicineDetails(itemSeq: string) {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          serviceKey: this.apiKey,
          itemSeq,
          type: 'json',
        },
      });

      const items = response.data.body?.items || [];
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
    } catch (err) {
      throw new InternalServerErrorException('의약품 상세 조회 실패');
    }
  }
}