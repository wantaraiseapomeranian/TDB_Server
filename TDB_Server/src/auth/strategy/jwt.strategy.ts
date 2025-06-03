import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../../users/entities/users.entity';

interface JwtPayload {
  sub: string;
  role: UserRole;
  uid?: string;
  iat: number;
  exp: number;
}

interface ValidatedUser {
  user_id: string;
  uid?: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  validate(payload: JwtPayload): ValidatedUser {
    const user_id: string = payload.sub;
    const uid: string | undefined = payload.uid;
    const role: UserRole = payload.role;

    return {
      user_id,
      uid,
      role,
    };
  }
}
