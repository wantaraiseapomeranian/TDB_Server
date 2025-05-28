import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/users.entity';




@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * 유저 생성
   */
  async createUser(user: Partial<User>): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { user_id: user.user_id },
    });

    if (existing) {
      throw new BadRequestException('이미 사용 중인 ID입니다.');
    }

    const newUser = this.usersRepository.create(user);
    return this.usersRepository.save(newUser);
  }

  // 유저 수정

  /**
   * 전체 유저 조회
   */
  async getAllUsers(): Promise<User[]> {
    return this.usersRepository.find();
  }

  /**
   * ID로 유저 조회
   */
  async getUserById(user_id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { user_id },
    });
  }

  /**
   * UID로 유저 조회 (선택사항)
   */
  async getUserByUid(k_uid: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { k_uid },
    });
  }

  /**
   * 부모 ID 기준으로 자식 계정 목록 조회
   */
  async getChildrenOfParent(parentUserId: string): Promise<User[]> {
    return this.usersRepository.find({
      where: { connect: parentUserId, role: 'child' },
    });
  }
}
