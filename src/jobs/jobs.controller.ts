import { Controller, Get } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('mmmtc')
  async mmmtc() {
    return this.jobsService.ProcessContactRowsImmediately(1);
  }
}
