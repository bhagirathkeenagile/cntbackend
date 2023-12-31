import { Injectable } from '@nestjs/common';
import { fetchAllRules } from 'src/ruleset';
import { PrismaService } from './../prisma.service';
import * as xlsx from 'xlsx';
import { CreateMapDto } from './dto/create-map.dto';
import { ConfigService } from '@nestjs/config';
import { JobsService } from 'src/jobs/jobs.service';

@Injectable()
export class MapService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private jobsService: JobsService,
  ) {}

  async readExcelFile(filePath: string): Promise<any[]> {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    return sheetData;
  }

  fetchRuleset() {
    return fetchAllRules();
  }

  async saveMappingData(data: CreateMapDto): Promise<{
    errorCode: 'ERROR' | 'NO_ERROR' | 'PROCESSING_FAILED';
  }> {
    const countExcelRows = (await this.readExcelFile(data.filePath)).length;
    console.log('countExcelRows---[ line 33 ]--->', countExcelRows);
    // IMMEDIATE_ROWS_TO_PROCESS
    const IMMEDIATE_ROWS_TO_PROCESS =
      this.configService.get<number>('IMMEDIATE_ROWS_TO_PROCESS') || 10000;

    // save mapping data to database
    console.log('data------[ line 39 ]--->', data);
    console.log('data.isInsert->', data.isInsert);
    let mapid: number = null;
    if (data.isInsert === true) {
      console.log('I am here 11');
      try {
        const mappingData = await this.prisma.mappingData.create({
          data: {
            /**
         * spread operator is used to merge two objects
         * its equivalent to 
         * { name: data.name,
          mainTable: data.mainTable,
          mapping: data.mapping,
          filePath: data.filePath,
          status: data.status,
          action: data.action
        }
         */
            ...data,
            ...{
              created_at: new Date(),
              isDeleted: false,
            },
          },
        });

        console.log('mappingData->', mappingData);
        mapid = mappingData.id;
      } catch (error) {
        // Handle the error here
        console.error('Error creating mappingData:', error.message);
        console.log('mappingData->', error.message);
        throw error;
      }
    } else {
      console.log('I am here 22');
      console.log('I am here 22-->', data.filePath);
      console.log('I am here 22-->', typeof data.mapId);

      await this.prisma.mappingData.update({
        where: {
          id: +data.mapId,
        },
        data: {
          filePath: data.filePath,
        },
      });
    }

    /**
     * if excel file has more than IMMEDIATE_ROWS_TO_PROCESS rows then
     * create a job and send mapping data to job
     */
    if (countExcelRows > IMMEDIATE_ROWS_TO_PROCESS) {
      await this.jobsService.sendDataToJob({
        mapId: +mapid,
        status: 'PENDING',
      });
      return { errorCode: 'NO_ERROR' };
    }
    // process contact rows immediately
    const mapStatus = await this.jobsService.ProcessContactRowsImmediately(2);
    return { errorCode: mapStatus.errorCode };
  }

  async fetchMapData() {
    const mapListData = await this.prisma.mappingData.findMany({});
    return { mapListData: mapListData };
  }

  async fetchSingleMap(id: number | string) {
    const mapData = await this.prisma.mappingData.findUnique({
      where: {
        id: Number(id),
      },
    });
    return { mapData: mapData };
  }
}

// FIND NAME
// {
//   where:{
//     name:{
//       contains:

//     }

//   }
// }
