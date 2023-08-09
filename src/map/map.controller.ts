import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MapService } from './map.service';
import { CreateMapDto } from './dto/create-map.dto';

/**
 * Map Controller
 * @description This Controller is being used for uploading map data.
 * @method uploadFile() - This method is used for uploading excel file.
 * @method getRuleset() - This method is used for fetching ruleset.
 * @method createUser() - This method is used for creating user.
 */
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('excelFile'))
  async uploadFile(@UploadedFile() file) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const data = await this.mapService.readExcelFile(file.path);
    const keyFromExcel = Object.keys(data);
    return { keyFromExcel };
  }

  @Get('ruleset')
  async getRuleset() {
    const ruleset = this.mapService.fetchRuleset();
    return ruleset;
  }

  @Post('import')
  async createUser(@Body() data: CreateMapDto): Promise<{
    errorCode: 'ERROR' | 'NO_ERROR' | 'PROCESSING_FAILED';
    message?: string;
  }> {
    try {
      return await this.mapService.saveMappingData(data);
    } catch (err) {
      return {
        errorCode: 'ERROR',
        message: err.message,
      };
    }
  }

  @Get('list-mapData')
  async listMapData() {
    try {
      return await this.mapService.fetchMapData();
    } catch (error) {
      return {
        errorCode: 'ERROR',
        message: error.message,
      };
    }
  }

  @Post('get-single-map')
  async getSingleMap(@Body() data: { mapId: string | number }) {
    try {
      return await this.mapService.fetchSingleMap(data.mapId);
    } catch (error) {
      return {
        errorCode: 'ERROR',
        message: error.message,
      };
    }
  }

  // async getContactLevelMappings() {
  //   const contactLevelMappings = this.mapService.fetchContactLevelMappings();
  //   return contactLevelMappings;
  // }
}
