import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/users.entity';
import { Machine } from '../machine/entities/machine.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
  ) {}

  /**
   * 유저 생성
   */
  async createUser(user: Partial<User>): Promise<User> {
    console.log('[UsersService] 회원가입 요청됨:', user);

    const existing = await this.usersRepository.findOne({
      where: { user_id: user.user_id },
    });

    if (existing) {
      console.warn('[UsersService] 이미 존재하는 ID:', user.user_id);
      throw new BadRequestException('이미 사용 중인 ID입니다.');
    }

    const newUser = this.usersRepository.create(user);
    const saved = await this.usersRepository.save(newUser);
    console.log('[UsersService] 저장 완료:', saved);

    // 🔥 Machine 레코드는 약 추가 시에 슬롯별로 생성됩니다.
    // 회원가입 시에는 불필요한 Machine 레코드를 생성하지 않습니다.

    return saved;
  }

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
    return this.usersRepository.findOne({ where: { user_id } });
  }

  /**
   * 키트 UID로 유저 조회
   */
  async getUserByKitUid(k_uid: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { k_uid } });
  }

  /**
   * 머신 UID로 유저 조회
   */
  async getUserByMachineUid(m_uid: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { m_uid } });
  }

  /**
   * 부모 ID 기준 자식 계정 목록 조회
   */
  async getChildrenOfParent(parentUserId: string): Promise<User[]> {
    return this.usersRepository.find({
      where: {
        connect: parentUserId,
        role: UserRole.CHILD,
      },
    });
  }

  /**
   * refresh_token으로 유저 조회
   */
  async getUserByRefreshToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { refresh_token: token },
    });
  }

  /**
   * 유저 정보 업데이트
   */
  async updateUser(user_id: string, update: Partial<User>): Promise<User> {
    const user = await this.getUserById(user_id);
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    Object.assign(user, update);
    return this.usersRepository.save(user);
  }

  /**
   * 🔥 디스펜서 등록 (m_uid 업데이트만, max_slot 기본 3개 고정)
   */
  async registerDispenser(userId: string, m_uid: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 부모 계정만 기기 등록 가능
    if (user.role !== UserRole.PARENT) {
      throw new BadRequestException('메인 계정만 디스펜서를 등록할 수 있습니다.');
    }

    // connect가 없으면 에러
    if (!user.connect) {
      throw new BadRequestException('사용자의 connect 정보가 없습니다.');
    }

    // 이미 다른 사용자가 해당 m_uid를 사용 중인지 확인
    const existingUser = await this.usersRepository.findOne({ 
      where: { m_uid },
    });
    
    if (existingUser && existingUser.connect !== user.connect) {
      throw new BadRequestException('이미 등록된 디스펜서입니다.');
    }

    // 🔥 같은 connect 그룹의 모든 사용자 m_uid 업데이트
    const allUsersInGroup = await this.usersRepository.find({
      where: { connect: user.connect }
    });

    for (const groupUser of allUsersInGroup) {
      groupUser.m_uid = m_uid;
      await this.usersRepository.save(groupUser);
    }
    
    console.log(`[UsersService] 디스펜서 등록 완료: connect ${user.connect} 그룹 전체 → ${m_uid}`);
    console.log(`[UsersService] 업데이트된 사용자 수: ${allUsersInGroup.length}명`);
    console.log(`[UsersService] Machine 테이블 레코드는 약 추가 시 슬롯별로 생성됩니다.`);
    
    // 업데이트된 부모 계정 정보 반환
    const updatedUser = await this.getUserById(userId);
    if (!updatedUser) {
      throw new NotFoundException('업데이트된 사용자 정보를 찾을 수 없습니다.');
    }
    return updatedUser;
  }

  /**
   * 🔥 데일리 키트 등록 (k_uid 업데이트)
   */
  async registerDailyKit(userId: string, k_uid: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 이미 다른 사용자가 해당 k_uid를 사용 중인지 확인
    const existingUser = await this.usersRepository.findOne({ 
      where: { k_uid },
    });
    
    if (existingUser && existingUser.user_id !== userId) {
      throw new BadRequestException('이미 등록된 데일리 키트입니다.');
    }

    // 사용자의 k_uid 업데이트
    user.k_uid = k_uid;
    const updatedUser = await this.usersRepository.save(user);
    
    console.log(`[UsersService] 데일리 키트 등록 완료: ${userId} -> ${k_uid}`);
    return updatedUser;
  }

  /**
   * 🔥 디스펜서 정보 조회 (max_slot 기본 3개 고정)
   */
  async getDispenserInfo(userId: string): Promise<{ m_uid: string | null; max_slot: number }> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    console.log(`[UsersService] 디스펜서 정보 조회: userId=${userId}, m_uid=${user.m_uid}, max_slot=3 (고정)`);
    
    return {
      m_uid: user.m_uid,
      max_slot: 3 // 항상 3개로 고정
    };
  }

  /**
   * 🔥 가족 구성원들의 m_uid 동기화 (기존 데이터 수정용)
   */
  async syncFamilyMuid(connect: string): Promise<{ updatedCount: number; m_uid: string | null }> {
    // 해당 connect 그룹의 모든 사용자 조회
    const allUsersInGroup = await this.usersRepository.find({
      where: { connect }
    });

    if (allUsersInGroup.length === 0) {
      throw new NotFoundException('해당 connect를 가진 사용자를 찾을 수 없습니다.');
    }

    // 부모 계정의 m_uid를 기준으로 동기화
    const parentUser = allUsersInGroup.find(user => user.role === UserRole.PARENT);
    if (!parentUser) {
      throw new NotFoundException('부모 계정을 찾을 수 없습니다.');
    }

    const targetMuid = parentUser.m_uid;
    let updatedCount = 0;

    // 모든 가족 구성원의 m_uid를 부모와 동일하게 설정
    for (const user of allUsersInGroup) {
      if (user.m_uid !== targetMuid) {
        user.m_uid = targetMuid;
        await this.usersRepository.save(user);
        updatedCount++;
      }
    }

    console.log(`[UsersService] 가족 m_uid 동기화 완료: connect ${connect}`);
    console.log(`[UsersService] 대상 m_uid: ${targetMuid}`);
    console.log(`[UsersService] 업데이트된 사용자 수: ${updatedCount}명`);

    return { updatedCount, m_uid: targetMuid };
  }
}
