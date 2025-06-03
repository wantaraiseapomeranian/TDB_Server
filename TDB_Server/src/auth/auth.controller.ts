import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { BasicTokenGuard } from './guard/basic-token.guard';
import {
  AccessTokenGuard,
  RefreshTokenGuard,
} from './guard/bearer-token.guard';
import { UnauthorizedException } from '@nestjs/common';
import { SignupDto } from './dto/Signtp.dto';
import { Request } from 'express';
import { UserRole } from '../users/entities/users.entity';

// BasicTokenGuard에서 req.user에 추가하는 정보 타입 정의
interface BasicAuthUser {
  user_id: string;
  password: string;
}

// JWT 토큰 페이로드 타입 정의 (AuthService.TokenPayload와 일치)
interface TokenPayload {
  sub: string;
  role: UserRole;
  type?: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// generateTokens용 사용자 타입 정의
interface TokenGenerationUser {
  user_id: string;
  role: UserRole;
}

// 인증된 요청 인터페이스들
interface BasicAuthRequest extends Request {
  user?: BasicAuthUser;
}

interface TokenAuthRequest extends Request {
  user?: TokenPayload;
}

interface RefreshTokenRequest extends Request {
  user?: TokenGenerationUser;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * 회원가입
   */
  @Post('signup')
  async signup(@Req() req: Request, @Body() rawBody: unknown) {
    console.log('--- [AuthController] Raw Request Headers ---');
    console.log(JSON.stringify(req.headers, null, 2));
    console.log('--- [AuthController] Raw Request Body (from req.body) ---');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('--- [AuthController] @Body() rawBody ---');
    console.log(JSON.stringify(rawBody, null, 2));

    // ValidationPipe를 수동으로 적용
    const validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });

    let signupDto: SignupDto;
    try {
      signupDto = await validationPipe.transform(rawBody, {
        type: 'body',
        metatype: SignupDto,
      });
      console.log('--- [AuthController] ValidationPipe 적용 후 signupDto ---');
      console.log(JSON.stringify(signupDto, null, 2));
    } catch (error) {
      console.error('--- [AuthController] ValidationPipe 에러 ---');
      console.error(error);
      throw error;
    }

    this.logger.log(
      `회원가입 요청 - ID: ${signupDto.id}, role: ${
        signupDto.role || signupDto.accountType
      }`,
    );
    return this.authService.signup({
      id: signupDto.id,
      password: signupDto.password,
      name: signupDto.name,
      birthDate: signupDto.birthDate,
      age: signupDto.age,
      accountType: signupDto.accountType,
      role: signupDto.role,
      parentUuid: signupDto.parentUuid,
    });
  }

  /**
   * 로그인 (Basic Token 인증)
   */
  @Post('login')
  @UseGuards(BasicTokenGuard)
  async login(@Req() req: BasicAuthRequest) {
    const user = req.user;

    if (!user || !user.user_id || !user.password) {
      this.logger.error('요청에서 user 정보가 없습니다.');
      throw new UnauthorizedException('인증 토큰에 사용자 정보가 없습니다.');
    }

    this.logger.log(`로그인 시도 - ID: ${user.user_id}`);
    return this.authService.login(user.user_id, user.password);
  }

  /**
   * 로그아웃
   */
  @Post('logout')
  async logout(@Body('id') id: string) {
    this.logger.log(`로그아웃 요청 - ID: ${id}`);
    return this.authService.logout(id);
  }

  /**
   * 인증 상태 확인 (Access Token)
   */
  @Get('check-auth')
  @UseGuards(AccessTokenGuard)
  async checkAuth(@Req() req: TokenAuthRequest) {
    const user = req.user;

    if (!user) {
      this.logger.error('인증된 사용자 정보가 없습니다.');
      throw new UnauthorizedException('인증된 사용자 정보가 없습니다.');
    }

    this.logger.log(`check-auth 요청 - user: ${user.sub}`);
    return this.authService.checkAuth(user);
  }

  /**
   * 토큰 재발급 (Refresh Token)
   */
  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  async refresh(@Req() req: RefreshTokenRequest) {
    const user = req.user;

    if (!user || !user.user_id || !user.role) {
      this.logger.error('토큰 재발급을 위한 사용자 정보가 없습니다.');
      throw new UnauthorizedException(
        '토큰 재발급을 위한 사용자 정보가 없습니다.',
      );
    }

    try {
      const { accessToken, refreshToken } =
        this.authService.generateTokens(user);
      await this.authService.updateRefreshToken(user.user_id, refreshToken);

      return {
        success: true,
        data: {
          accessToken,
          refreshToken,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Refresh 실패: ${errorMessage}`);
      throw error;
    }
  }
}
