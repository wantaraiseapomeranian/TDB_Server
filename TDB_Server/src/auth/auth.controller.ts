import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { BasicTokenGuard } from './guard/basic-token.guard';
import { PasswordPipe } from './pipe/password.pipe';
import { AccessTokenGuard, RefreshTokenGuard } from './guard/bearer-token.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(
    @Body('id') id: string,
    @Body('password', PasswordPipe) password: string,
    @Body('name') name: string,
    @Body('birthDate') birthDate: string,
    @Body('age') age: number,
    @Body('accountType') accountType: 'parent' | 'child',
    @Body('role') role?: 'parent' | 'child',
    @Body('parentUuid') parentUuid?: string,
  ) {
    this.logger.log(`회원가입 요청 - ID: ${id}, role: ${role}`);
    return this.authService.signup({
      id,
      password,
      name,
      birthDate,
      age,
      accountType,
      role: role || accountType,
      parentUuid,
    });
  }

  @Post('login')
  @UseGuards(BasicTokenGuard)
  async login(@Req() req, @Body('deviceId') deviceId: string) {
    this.logger.log('로그인 요청 수신됨');
    try {
      const user = req.user;
      if (!user) {
        this.logger.error('요청에서 user 정보가 없습니다.');
        throw new Error('req.user가 없습니다.');
      }

      this.logger.log(`로그인 시도 - ID: ${user.user_id}, deviceId: ${deviceId}`);
      const result = await this.authService.login(user.user_id, user.password, deviceId);

      this.logger.log('로그인 성공');
      return result;
    } catch (err) {
      this.logger.error(`로그인 중 오류 발생: ${err.message}`, err.stack);
      throw err;
    }
  }

  @Post('logout')
  async logout(
    @Body('id') id: string,
    @Body('deviceId') deviceId: string,
  ) {
    this.logger.log(`로그아웃 요청 - ID: ${id}, deviceId: ${deviceId}`);
    return this.authService.logout(id, deviceId);
  }

  @Get('check-auth')
  @UseGuards(AccessTokenGuard)
  async checkAuth(@Req() req) {
    this.logger.log(`check-auth 요청 - user: ${req.user?.user_id}`);
    return {
      success: true,
      data: {
        user: req.user,
      },
    };
  }

  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  async refresh(@Req() req) {
    const user = req.user;
    this.logger.log(`refresh 요청 - user: ${user?.user_id}`);
    const { accessToken, refreshToken } = this.authService.generateTokens(user);

    await this.authService.updateRefreshToken(user.user_id, refreshToken);

    return {
      success: true,
      data: {
        accessToken,
        refreshToken,
      },
    };
  }
}
