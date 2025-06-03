import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/users.entity';

interface AuthenticatedRequest extends Request {
  user: User;
  token: string;
  tokenType: 'access' | 'refresh';
}

@Injectable()
export class BearerTokenGuard implements CanActivate {
  constructor(
    protected readonly authService: AuthService,
    protected readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const rawToken = req.headers['authorization'];
    if (!rawToken) {
      throw new UnauthorizedException('인증 토큰이 없습니다.');
    }

    const token = this.authService.extractTokenFromHeader(rawToken, true);
    const decoded = this.authService.verifyToken(token);

    const user = await this.usersService.getUserById(decoded.sub);
    if (!user) {
      throw new UnauthorizedException('해당 사용자를 찾을 수 없습니다.');
    }

    req.user = user;
    req.token = token;
    req.tokenType = decoded.type ?? 'access'; // type이 명시되지 않은 경우 기본값 access

    return true;
  }
}

@Injectable()
export class AccessTokenGuard extends BearerTokenGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.tokenType !== 'access') {
      throw new UnauthorizedException('Access 토큰이 아닙니다.');
    }

    return true;
  }
}

@Injectable()
export class RefreshTokenGuard extends BearerTokenGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.tokenType !== 'refresh') {
      throw new UnauthorizedException('Refresh 토큰이 아닙니다.');
    }

    return true;
  }
}
