import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class PasswordPipe implements PipeTransform {
  transform(value: string): string {
    const password = value?.toString();
    if (!password || password.length < 8) {
      throw new BadRequestException('비밀번호는 최소 8자 이상이어야 합니다!');
    }
    return password;
  }
}
