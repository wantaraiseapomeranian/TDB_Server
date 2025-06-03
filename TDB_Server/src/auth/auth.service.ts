import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../users/entities/users.entity';

interface SignupParams {
  id: string;
  password: string;
  name: string;
  birthDate: string;
  age: number;
  accountType: 'parent' | 'child';
  role?: 'parent' | 'child';
  parentUuid?: string;
}

interface TokenPayload {
  sub: string;
  role: UserRole;
  type?: 'access' | 'refresh';
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async signup(params: SignupParams) {
    this.logger.log(`--- [AuthService] Received Signup Params ---`);
    this.logger.log(JSON.stringify(params, null, 2));

    const {
      id,
      password,
      parentUuid,
      name,
      birthDate,
      age,
      role,
      accountType,
    } = params;

    this.logger.log(
      `회원가입 요청 처리 중 - ID: ${id}, Role: ${role || accountType}`,
    );

    try {
      const existingUser = await this.userRepository.findOne({
        where: { user_id: id },
      });

      if (existingUser) {
        this.logger.warn(`[signup] 중복된 ID 사용 시도: ${id}`);
        throw new ConflictException('이미 등록된 사용자입니다.');
      }

      const hashedPassword = await bcrypt.hash(
        password,
        parseInt(process.env.HASH_ROUNDS || '10'),
      );
      this.logger.debug(`[signup] 비밀번호 해시 완료`);

      const userRole: UserRole = (role || accountType) as UserRole;

      if (!Object.values(UserRole).includes(userRole)) {
        this.logger.error(`[signup] 유효하지 않은 역할 입력: ${userRole}`);
        throw new ConflictException(
          'role은 "parent" 또는 "child"만 허용됩니다.',
        );
      }

      // 1. 역할 확인 및 connect 설정
      let connect: string | null;

      if (userRole === UserRole.PARENT) {
        connect = id;
        this.logger.debug(`[signup] 메인인 계정 - connect = ${connect}`);
      } else {
        if (!parentUuid) {
          this.logger.error(`[signup] 서브 계정인데 parentUuid가 없음`);
          throw new ConflictException('서브 계정은 메인 계정의 UUID가 필요합니다.');
        }

        const parent = await this.userRepository.findOne({
          where: { connect: parentUuid, role: UserRole.PARENT },
        });

        if (!parent) {
          this.logger.warn(
            `[signup] 메인 계정의 UUID(${parentUuid})로 계정 찾기 실패`,
          );
          throw new ConflictException(
            '해당 UUID를 가진 메인인 계정을 찾을 수 없습니다.',
          );
        }

        connect = parent.connect;
        this.logger.debug(`[signup] 서브 계정 - 메인 계정의 connect = ${connect}`);
      }

      // 2. connect 값 누락 확인 (❗ 핵심 수정 포인트)
      if (!connect) {
        this.logger.error(`[signup] ❌ connect 값이 설정되지 않았습니다.`);
        throw new ConflictException(
          '회원가입 실패: connect 값이 누락되었습니다.',
        );
      }

      const user = this.userRepository.create({
        user_id: id,
        password: hashedPassword,
        name,
        birthDate,
        age,
        role: userRole,
        connect,
        took_today: 0,
      });

      this.logger.debug(`[signup] 저장될 사용자 객체: ${JSON.stringify(user)}`);

      const saved = await this.userRepository.save(user);

      if (!saved || !saved.user_id) {
        this.logger.error(
          `[signup] 저장 실패 - 반환값이 없음 또는 user_id 없음`,
        );
        throw new ConflictException(
          '회원가입 저장에 실패했습니다. 필수 정보가 누락됐을 수 있습니다.',
        );
      }

      this.logger.log(
        `[signup] 회원가입 완료 - ID: ${saved.user_id}, Role: ${saved.role}, Connect: ${saved.connect}`,
      );

      // 회원가입 성공 시 토큰 생성
      const accessToken = this.signToken(saved, 'access');
      const refreshToken = this.signToken(saved, 'refresh');

      // refresh token을 데이터베이스에 저장
      await this.userRepository.update(saved.user_id, {
        refresh_token: refreshToken,
      });

      this.logger.log(`[signup] 토큰 생성 및 저장 완료 - ID: ${saved.user_id}`);

      return {
        success: true,
        data: {
          accessToken,
          refreshToken,
          id: saved.user_id,
          name: saved.name,
          role: saved.role,
          connect: saved.connect,
          birthDate: saved.birthDate,
          age: saved.age,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[signup] 회원가입 중 오류 발생: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  async login(id: string, password: string) {
    this.logger.log(`로그인 요청 - ID: ${id}`);

    const user = await this.userRepository.findOne({ where: { user_id: id } });

    if (!user) {
      this.logger.warn(`로그인 실패 - 존재하지 않는 ID: ${id}`);
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`비밀번호 불일치 - ID: ${id}`);
      throw new UnauthorizedException('비밀번호가 올바르지 않습니다.');
    }

    const accessToken = this.signToken(user, 'access');
    const refreshToken = this.signToken(user, 'refresh');

    await this.userRepository.update(user.user_id, {
      refresh_token: refreshToken,
    });

    this.logger.log(`로그인 성공 - ID: ${id}, Token 발급 완료`);

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        id: user.user_id,
        name: user.name,
        role: user.role,
        connect: user.connect,
        m_uid: user.m_uid,
        k_uid: user.k_uid,
        took_today: user.took_today,
      },
    };
  }

  private signToken(
    user: Pick<User, 'user_id' | 'role'>,
    type: 'access' | 'refresh',
  ): string {
    const payload = {
      sub: user.user_id,
      role: user.role,
      type,
    };
    const expiresIn = type === 'access' ? '10h' : '7d';
    this.logger.debug(`JWT 생성 - Type: ${type}, Exp: ${expiresIn}`);
    return this.jwtService.sign(payload, { expiresIn });
  }

  async updateRefreshToken(userId: string, token: string): Promise<void> {
    this.logger.debug(`Refresh Token 저장 - ID: ${userId}`);
    await this.userRepository.update(userId, { refresh_token: token });
  }

  async logout(id: string) {
    this.logger.log(`로그아웃 요청 - ID: ${id}`);

    try {
      const user = await this.userRepository.findOne({
        where: { user_id: id },
      });

      if (!user) {
        this.logger.warn(`로그아웃 실패 - 존재하지 않는 ID: ${id}`);
        throw new UnauthorizedException('존재하지 않는 사용자입니다.');
      }

      await this.userRepository.update(user.user_id, {
        refresh_token: '',
      });

      this.logger.log(`로그아웃 성공 - ID: ${id}`);

      return {
        success: true,
        message: '로그아웃이 완료되었습니다.',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`로그아웃 실패 - ID: ${id}, Error: ${errorMessage}`);
      throw error;
    }
  }

  async checkAuth(user: TokenPayload) {
    this.logger.log(`사용자 인증 확인 요청 - sub: ${user.sub}`);

    const foundUser = await this.userRepository.findOne({
      where: { user_id: user.sub },
    });

    if (!foundUser) {
      this.logger.warn(`checkAuth 실패 - 사용자 없음: ${user.sub}`);
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    return {
      success: true,
      data: {
        isAuthenticated: true,
        user: {
          id: foundUser.user_id,
          name: foundUser.name,
          role: foundUser.role,
          connect: foundUser.connect,
          m_uid: foundUser.m_uid,
          k_uid: foundUser.k_uid,
          took_today: foundUser.took_today,
        },
      },
    };
  }

  extractTokenFromHeader(header: string, isBearer = true): string {
    const type = isBearer ? 'Bearer' : 'Basic';
    if (!header.startsWith(type)) {
      this.logger.warn(`잘못된 토큰 형식: ${header}`);
      throw new UnauthorizedException(`${type} 형식의 인증 토큰이 아닙니다.`);
    }
    return header.slice(type.length).trim();
  }

  decodeBasicToken(token: string): { id: string; password: string } {
    this.logger.debug(`Basic 토큰 디코딩 시도`);
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [id, password] = decoded.split(':');
      this.logger.debug(`디코딩 성공 - ID: ${id}`);
      if (!id || !password) throw new Error();
      return { id, password };
    } catch {
      this.logger.error(`Basic 토큰 디코딩 실패`);
      throw new UnauthorizedException('Basic 토큰 디코딩에 실패했습니다.');
    }
  }

  async authenticateWithIdAndPassword({
    id,
    password,
  }: {
    id: string;
    password: string;
  }) {
    this.logger.debug(`ID/PW 인증 시도 - ID: ${id}`);
    const user = await this.userRepository.findOne({
      where: { user_id: id },
    });

    if (!user) {
      this.logger.warn(`인증 실패 - ID 없음: ${id}`);
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      this.logger.warn(`인증 실패 - 비밀번호 불일치`);
      throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');
    }

    this.logger.log(`인증 성공 - ID: ${id}`);
    return {
      user_id: user.user_id,
      name: user.name,
      role: user.role,
      uid: user.k_uid,
    };
  }

  verifyToken(token: string): TokenPayload {
    try {
      return this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException(
          'Refresh Token이 만료되었습니다. 다시 로그인해주세요.',
        );
      } else if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }
      throw new UnauthorizedException('토큰 인증 중 오류가 발생했습니다.');
    }
  }

  generateTokens(user: Pick<User, 'user_id' | 'role'>) {
    const accessToken = this.signToken(user, 'access');
    const refreshToken = this.signToken(user, 'refresh');
    return { accessToken, refreshToken };
  }
}
