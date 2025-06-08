import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/users.entity';

@Injectable()
export class FamilyService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // 사용자 ID로 가족 구성원 목록 조회
  async getFamilyMembersByUserId(userId: string): Promise<{ success: boolean; data: User[] }> {
    // 먼저 요청한 사용자 정보 조회
    const user = await this.userRepo.findOne({
      where: { user_id: userId },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // connect가 null인 경우 에러 처리
    if (!user.connect) {
      throw new BadRequestException('사용자의 connect 정보가 없습니다.');
    }

    // 같은 connect를 가진 모든 사용자 조회 (가족 구성원)
    const familyMembers = await this.userRepo.find({
      where: { connect: user.connect },
      select: [
        'user_id',
        'name', 
        'role',
        'birthDate',
        'age',
        'connect',
        'took_today',
        'k_uid',
        'm_uid'
      ],
    });

    return {
      success: true,
      data: familyMembers,
    };
  }

  // connect ID로 가족 구성원 목록 조회 (대시보드용)
  async getFamilyMembersByConnect(connect: string): Promise<{ success: boolean; data: User[] }> {
    if (!connect) {
      throw new BadRequestException('connect 정보가 필요합니다.');
    }

    // 같은 connect를 가진 모든 사용자 조회 (가족 구성원)
    const familyMembers = await this.userRepo.find({
      where: { connect },
      select: [
        'user_id',
        'name', 
        'role',
        'birthDate',
        'age',
        'connect',
        'took_today',
        'k_uid',
        'm_uid'
      ],
    });

    return {
      success: true,
      data: familyMembers,
    };
  }

  // 부모 UUID로 자녀 목록 조회
  async getFamilyMembersByUuid(uuid: string): Promise<User[]> {
    const parent = await this.userRepo.findOne({
      where: { k_uid: uuid, role: UserRole.PARENT },
    });

    if (!parent) {
      throw new NotFoundException('메인 계정을 찾을 수 없습니다.');
    }

    // connect가 null인 경우 빈 배열 반환
    if (!parent.connect) {
      return [];
    }

    return this.userRepo.find({
      where: { connect: parent.connect, role: UserRole.CHILD },
    });
  }

  // 자녀 구성원 추가
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

    const parent = await this.userRepo.findOne({
      where: { user_id: data.user_id, role: UserRole.PARENT },
    });

    if (!parent) {
      throw new NotFoundException('부모 사용자를 찾을 수 없습니다.');
    }

    // parent.connect가 null인 경우 에러 처리
    if (!parent.connect) {
      throw new BadRequestException('부모 사용자의 connect 정보가 없습니다.');
    }

    // 🔥 자식 계정 생성 시 부모의 m_uid도 상속
    const childData = {
      ...data,
      role: UserRole.CHILD,
      connect: parent.connect,
      m_uid: parent.m_uid, // 🔥 부모의 m_uid 상속
    };

    console.log(`[FamilyService] 자식 계정 생성: ${data.name}`);
    console.log(`  부모 connect: ${parent.connect}`);
    console.log(`  부모 m_uid: ${parent.m_uid}`);
    console.log(`  자식이 상속받을 m_uid: ${childData.m_uid}`);

    const child = this.userRepo.create(childData);
    return this.userRepo.save(child);
  }

  // 자녀 정보 수정
  async updateFamilyMember(id: string, updateData: Partial<User>) {
    const member = await this.userRepo.findOne({
      where: { user_id: id, role: UserRole.CHILD },
    });

    if (!member) {
      throw new NotFoundException('해당 구성원을 찾을 수 없습니다.');
    }

    Object.assign(member, updateData);
    return this.userRepo.save(member);
  }

  // 자녀 삭제
  async deleteFamilyMember(id: string): Promise<{ success: true }> {
    const result = await this.userRepo.delete({
      user_id: id,
      role: UserRole.CHILD,
    });

    if (result.affected === 0) {
      throw new NotFoundException('삭제할 구성원을 찾을 수 없습니다.');
    }

    return { success: true };
  }

  // 전체 자녀 스케줄 요약
  async getFamilySummary() {
    const users = await this.userRepo.find({
      where: { role: UserRole.CHILD },
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
