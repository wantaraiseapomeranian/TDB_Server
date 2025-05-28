import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class BasicTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const rawToken: string = req.headers['authorization'];

    console.log('✅ [Guard] BasicTokenGuard called');
    console.log('✅ [Guard] Authorization Header:', rawToken);

    if (!rawToken) {
      console.error('❌ [Guard] 인증 토큰이 존재하지 않습니다.');
      throw new UnauthorizedException('인증 토큰이 존재하지 않습니다.');
    }

    try {
      const token = this.authService.extractTokenFromHeader(rawToken, false);
      console.log('✅ [Guard] 추출된 Basic Token:', token);

      const { id, password } = this.authService.decodeBasicToken(token);
      console.log(`✅ [Guard] 디코딩 결과 - ID: ${id}, PW: ${'*'.repeat(password.length)}`);

      const user = await this.authService.authenticateWithIdAndPassword({
        id,
        password,
      });

      console.log('✅ [Guard] 인증 성공 - 사용자:', user.user_id);
      req.user = {
        user_id: user.user_id,
        password, // service.login에서 검증 위해 전달
        role: user.role,
      };

      return true;
    } catch (err) {
      console.error('❌ [Guard] 인증 실패:', err.message);
      throw new UnauthorizedException('Basic 인증 실패');
    }
  }
}
