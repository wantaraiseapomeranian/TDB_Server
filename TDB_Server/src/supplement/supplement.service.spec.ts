import { Test, TestingModule } from '@nestjs/testing';
import { SupplementService } from './supplement.service';

describe('SupplementService', () => {
  let service: SupplementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplementService],
    }).compile();

    service = module.get<SupplementService>(SupplementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
