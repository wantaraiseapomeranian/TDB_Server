import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Medicine } from '../medicine/entities/medicine.entity';
import { Repository } from 'typeorm';

@Injectable()
export class SupplementService {
  constructor(
    @InjectRepository(Medicine)
    private readonly medicineRepo: Repository<Medicine>,
  ) {}

  async getSupplementList(memberId: string) {
    return this.medicineRepo.find({
      where: {
        user_id: memberId,
        type: 'supplement',
      },
    });
  }

  async saveSupplement(data: any) {
    const newSupplement = this.medicineRepo.create({
      medi_id: data.medi_id,
      user_id: data.memberId,
      name: data.name,
      warning: data.warning || false,
      description: data.description,
      manufacturer: data.manufacturer,
      image_url: data.image_url,
      start_date: data.start_date,
      end_date: data.end_date,
      type: 'supplement',
    });
    return this.medicineRepo.save(newSupplement);
  }

  async getSupplementDetails(supplementId: string) {
    const supplement = await this.medicineRepo.findOne({
      where: {
        medi_id: supplementId,
        type: 'supplement',
      },
    });

    if (!supplement) throw new NotFoundException('영양제를 찾을 수 없습니다.');
    return supplement;
  }

  async saveSupplementSchedule(memberId: string, schedule: any) {
    return { success: true, schedule };
  }

  async getSupplementInventory(memberId: string) {
    return this.medicineRepo.find({
      where: {
        user_id: memberId,
        type: 'supplement',
      },
    });
  }

  async updateQuantity(memberId: string, data: { supplementId: string; quantity: number }) {
    // quantity 필드가 있다면 업데이트 가능
    return { success: true };
  }

  async completeSupplement(memberId: string, data: { supplementId: string }) {
    return { success: true, completedAt: new Date() };
  }
}