import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/users.entity';

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
  role: 'parent' | 'child';
  type?: 'access' | 'refresh';
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async signup(params: SignupParams) {
    const { id, password, parentUuid } = params;

    const existingUser = await this.userRepository.findOne({
      where: { user_id: id },
    });

    if (existingUser) {
      throw new ConflictException('이미 등록된 사용자입니다.');
    }

    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.HASH_ROUNDS || '10'),
    );

    const role = params.role || params.accountType;
    if (role !== 'parent' && role !== 'child') {
      throw new ConflictException('role은 "parent" 또는 "child"만 허용됩니다.');
    }

    let connect: string;

    if (role === 'parent') {
      connect = generateConnectCode(); // ✅ 8자리 고유 코드 생성
    } else {
      if (!parentUuid) {
        throw new ConflictException('자녀 계정은 부모의 UUID가 필요합니다.');
      }

      const parent = await this.userRepository.findOne({
        where: { connect: parentUuid, role: 'parent' },
      });

      if (!parent) {
        throw new ConflictException('해당 UUID를 가진 부모 계정을 찾을 수 없습니다.');
      }

      connect = parent.connect;
    }

    const user = new User();
    user.user_id = id;
    user.name = params.name;
    user.role = role;
    user.connect = connect;
    user.took_today = false;
    user.password = hashedPassword;
    if (params.birthDate) user.birthDate = params.birthDate;
    if (params.age !== undefined) user.age = params.age;

    await this.userRepository.save(user);

    return {
      success: true,
      data: { id: user.user_id, connect: user.connect },
    };
  }

  async login(id: string, password: string, deviceId: string) {
    const user = await this.userRepository.findOne({
      where: { user_id: id },
    });

    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('비밀번호가 올바르지 않습니다.');
    }

    const payload = { sub: user.user_id, role: user.role };

    const accessToken = this.getAccessToken(payload);
    const refreshToken = this.getRefreshToken(payload);

    await this.userRepository.update(user.user_id, {
      refresh_token: refreshToken,
    });

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.user_id,
          name: user.name,
          role: user.role,
        },
      },
    };
  }

  private getAccessToken(payload: Omit<TokenPayload, 'type' | 'iat' | 'exp'>) {
    return this.jwtService.sign(
      {
        ...payload,
        type: 'access',
      },
      { expiresIn: '1h' }
    );
  }

  private getRefreshToken(payload: Omit<TokenPayload, 'type' | 'iat' | 'exp'>) {
    return this.jwtService.sign(
      {
        ...payload,
        type: 'refresh',
      },
      { expiresIn: '7d' }
    );
  }

  async updateRefreshToken(userId: string, token: string): Promise<void> {
    await this.userRepository.update(userId, {
      refresh_token: token,
    });
  }

  async logout(id: string, deviceId: string) {
    const user = await this.userRepository.findOne({
      where: { user_id: id },
    });

    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    await this.userRepository.update(id, {
      refresh_token: null,
    });

    return {
      success: true,
      message: '로그아웃 성공',
      data: {
        id: user.user_id,
        name: user.name,
      },
    };
  }

  async checkAuth(user: TokenPayload) {
    const foundUser = await this.userRepository.findOne({
      where: { user_id: user.sub },
    });

    if (!foundUser) {
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
        },
      },
    };
  }

  extractTokenFromHeader(header: string, isBearer = true): string {
    const type = isBearer ? 'Bearer' : 'Basic';
    if (!header.startsWith(type)) {
      throw new UnauthorizedException(`${type} 형식의 인증 토큰이 아닙니다.`);
    }
    return header.slice(type.length).trim();
  }

  decodeBasicToken(token: string): { id: string; password: string } {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [id, password] = decoded.split(':');

      if (!id || !password) {
        throw new Error();
      }

      return { id, password };
    } catch {
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
    const user = await this.userRepository.findOne({
      where: { user_id: id },
    });

    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');
    }

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
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
  }

  private signToken(
    user: Pick<User, 'user_id' | 'role'>,
    type: 'access' | 'refresh' = 'access',
  ) {
    const payload: TokenPayload = {
      sub: user.user_id,
      role: user.role,
      type,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (type === 'access' ? 3600 : 604800),
    };

    return this.jwtService.sign(payload);
  }

  generateTokens(user: Pick<User, 'user_id' | 'role'>) {
    const accessToken = this.signToken(user, 'access');
    const refreshToken = this.signToken(user, 'refresh');
    return { accessToken, refreshToken };
  }
}

// ✅ 8자리 영문+숫자 연결 코드 생성기
function generateConnectCode(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
