import { Test, TestingModule } from '@nestjs/testing';
import { SupplementController } from './supplement.controller';
import { SupplementService } from './supplement.service';

describe('SupplementController', () => {
  let controller: SupplementController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupplementController],
      providers: [SupplementService],
    }).compile();

    controller = module.get<SupplementController>(SupplementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
