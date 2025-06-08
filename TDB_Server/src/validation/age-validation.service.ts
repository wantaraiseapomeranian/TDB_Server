import { Injectable } from '@nestjs/common';

export interface AgeValidationResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
  adjustedDosage?: number;
  requiresConsultation: boolean;
}

export interface ContraindicationData {
  minAge?: number;
  maxAge?: number;
  contraindicatedAges: number[];
  specialConditions: string[];
  dosageAdjustments: Array<{
    minAge: number;
    maxAge: number;
    multiplier: number;
  }>;
}

@Injectable()
export class AgeValidationService {
  
  /**
   * 연령 기반 복용 가능성 검증
   */
  validateAge(userAge: number, contraindications: string): AgeValidationResult {
    const result: AgeValidationResult = {
      allowed: true,
      warnings: [],
      requiresConsultation: false
    };

    // 기본 연령 제한 검사
    if (userAge < 2) {
      return {
        allowed: false,
        reason: '2세 미만 영아는 복용할 수 없습니다.',
        warnings: ['의사와 상담이 필요합니다.'],
        requiresConsultation: true
      };
    }

    if (userAge < 7) {
      result.warnings.push('7세 이하는 의사와 상담 후 복용하세요.');
      result.requiresConsultation = true;
    }

    // 의약품별 상세 제약사항 파싱
    const restrictions = this.parseContraindications(contraindications);
    
    // 금기 연령 검사
    if (this.isContraindicatedAge(userAge, restrictions)) {
      return {
        allowed: false,
        reason: `${userAge}세는 이 의약품의 복용 금지 연령입니다.`,
        warnings: ['의사와 상담이 필요합니다.'],
        requiresConsultation: true
      };
    }

    // 복용량 조절 필요성 검사
    const dosageAdjustment = this.getDosageAdjustment(userAge);
    if (dosageAdjustment !== 1) {
      result.adjustedDosage = dosageAdjustment;
      result.warnings.push(`소아는 성인의 ${dosageAdjustment * 100}% 복용량입니다.`);
    }

    return result;
  }

  /**
   * 금기사항 텍스트 파싱
   */
  private parseContraindications(text: string): ContraindicationData {
    const result: ContraindicationData = {
      contraindicatedAges: [],
      specialConditions: [],
      dosageAdjustments: []
    };

    if (!text) return result;

    // "만 X세 이하" 패턴 검출
    const agePatterns = [
      /만\s*(\d+)세\s*이하/g,
      /(\d+)세\s*이하/g,
      /(\d+)세\s*미만/g
    ];

    agePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const age = parseInt(match[1]);
        if (!isNaN(age)) {
          result.contraindicatedAges.push(age);
        }
      }
    });

    // 특별 조건들 검출
    const specialConditions = [
      '영아', '유아', '소아', '어린이', '임산부', '수유부'
    ];
    
    specialConditions.forEach(condition => {
      if (text.includes(condition)) {
        result.specialConditions.push(condition);
      }
    });

    return result;
  }

  /**
   * 금기 연령 확인
   */
  private isContraindicatedAge(userAge: number, restrictions: ContraindicationData): boolean {
    // 명시적 금기 연령
    if (restrictions.contraindicatedAges.some(age => userAge <= age)) {
      return true;
    }

    // 기본 안전 규칙
    if (userAge < 7 && restrictions.specialConditions.includes('소아')) {
      return true;
    }

    return false;
  }

  /**
   * 연령별 복용량 조절 계수 계산
   */
  private getDosageAdjustment(userAge: number): number {
    if (userAge < 3) return 0;      // 복용 금지
    if (userAge < 7) return 0.25;   // 1/4 용량 (의사 상담)
    if (userAge < 15) return 0.5;   // 1/2 용량 (소아)
    return 1;                       // 정상 용량 (성인)
  }

  /**
   * 클라이언트용 즉시 검증 (기본적인 연령 체크만)
   */
  getBasicAgeValidation(userAge: number) {
    return {
      isChild: userAge < 15,
      requiresParentalSupervision: userAge < 18,
      contraindicatedAge: userAge < 7,
      dosageMultiplier: this.getDosageAdjustment(userAge)
    };
  }
} 