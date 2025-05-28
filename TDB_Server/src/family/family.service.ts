import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/users.entity';
import { Repository } from 'typeorm';

@Injectable()
export class FamilyService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getFamilyMembersByUuid(uuid: string): Promise<User[]> {
    const parent = await this.userRepo.findOne({ where: { k_uid: uuid } });

    if (!parent) {
      throw new NotFoundException('부모 사용자를 찾을 수 없습니다.');
    }

    return this.userRepo.find({
      where: { connect: parent.connect, role: 'child' },
    });
  }

  async addFamilyMember(data: {
    user_id: string;
    uid: string;
    name: string;
    birthDate: string;
    age: number;
    connect: string;
  }): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: [{ user_id: data.user_id }, { k_uid: data.uid }],
    });

    if (existing) {
      throw new ConflictException('이미 등록된 구성원입니다.');
    }

    const child = this.userRepo.create({
      ...data,
      role: 'child',
      took_today: false,
    });

    return this.userRepo.save(child);
  }

  async updateFamilyMember(id: string, updateData: Partial<User>) {
    const member = await this.userRepo.findOne({ where: { user_id: id, role: 'child' } });

    if (!member) {
      throw new NotFoundException('해당 구성원을 찾을 수 없습니다.');
    }

    Object.assign(member, updateData);
    return this.userRepo.save(member);
  }

  async deleteFamilyMember(id: string): Promise<{ success: true }> {
    const result = await this.userRepo.delete({ user_id: id, role: 'child' });

    if (result.affected === 0) {
      throw new NotFoundException('삭제할 구성원을 찾을 수 없습니다.');
    }

    return { success: true };
  }

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
