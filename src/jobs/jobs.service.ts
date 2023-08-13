import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateJobDto } from './dtos/create-job.dto';
import { Jobs } from '@prisma/client';
import { ExcelService } from 'src/excel/excel.service';
import { Cron } from '@nestjs/schedule';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private excelService: ExcelService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  /**
   * This function will save jobs to database
   * @param data CreateJobDto
   * @returns Jobs
   */
  async sendDataToJob(data: CreateJobDto): Promise<Jobs> {
    return await this.prisma.jobs.create({
      data: {
        ...data,
      },
    });
  }

  async ProcessContactRowsImmediately(mapId: number): Promise<{
    errorCode: 'ERROR' | 'NO_ERROR' | 'PROCESSING_FAILED';
    message: string;
  }> {
    try {
      console.log('mapId-->', mapId);
      console.log('mapId-->', mapId);
      const map = await this.prisma.mappingData.update({
        where: {
          id: mapId,
        },
        data: {
          status: 'PROCESSING',
        },
      });
      const accountsFields = JSON.parse(map.mapping).filter(
        (a) => a.table === 'Accounts' && a.mapped === 'Mapped',
      );
      const contactsFields = JSON.parse(map.mapping).filter(
        (a) => a.table === 'Contacts' && a.mapped === 'Mapped',
      );

      const readExcelFile = await this.excelService.readExcelFile(map.filePath);
      readExcelFile.map(async (row) => {
        // check source table
        const accountsData = {};
        accountsFields.map((field) => {
          const cleanedcolumName = field.columnName.replace(
            /\s+\(required\)$/,
            '',
          );
          accountsData[
            cleanedcolumName.charAt(0).toUpperCase() +
              cleanedcolumName.slice(1).trim()
          ] = row[field.excelHeader]?.toString();
        });
        const contactsData: any = {};
        contactsFields.map((field) => {
          const cleanedcolumName = field.columnName.replace(
            /\s+\(required\)$/,
            '',
          );
          contactsData[
            cleanedcolumName.charAt(0).toUpperCase() +
              cleanedcolumName.slice(1).trim()
          ] = row[field.excelHeader]?.toString();
        });

        if (map.action === 'Insert Only' || map.action === 'Insert') {
          contactsData.insert_map_history_id = map.id;
          console.log('accountsData->', accountsData);
          console.log('contactsData->', contactsData);
          /**
           * check if source table is account
           * TODO @Bhagirath: Map Fields
           */
          await this.prisma.contact.create({
            data: {
              ...contactsData,
              Account: {
                connectOrCreate: {
                  where: {
                    Name: accountsData['Name'],
                  },
                  create: {
                    ...accountsData,
                  },
                },
              },
            },
          });
        }
        if (map.action === 'Update Only') {
          await this.prisma.contact.upsert({
            where: {
              // add unique fields here based on mapping
              id: contactsData['id'],
            },
            update: {
              ...contactsData,
            },
            create: {
              ...contactsData,
              Account: {
                connectOrCreate: {
                  where: {
                    id: accountsData['name'],
                  },
                  create: {
                    ...accountsData,
                  },
                },
              },
            },
          });
        }
      });
    } catch (err) {
      console.log('errorCode' + err);
      return { errorCode: 'ERROR', message: 'Something went wrong' };
    }
  }

  @Cron('45 * * * * *')
  async handleCron() {
    const allQueuedJobs = await this.prisma.jobs.findMany({
      where: {
        status: 'uploaded',
      },
    });
    allQueuedJobs.map(async (job) => {
      const status = await this.ProcessContactRowsImmediately(job.mapId);
      if (status.errorCode === 'NO_ERROR') {
        this.configService.get<boolean>('SEND_EMAIL_AFTER_UPLOAD') &&
          (await this.mailService.sendUserConfirmation(
            {
              name: 'Bhagirath',
              email: 'twiiter@gmail.com',
            },
            'Contact Upload Completed',
          ));
      }
    });
  }

  @Cron('0 0 0 * * *')
  async handleScoreCron() {
    await this.createRankOnTitle();
    //
  }

  async createRankOnTitle() {
    const getContactsWithoutRank = await this.prisma.contact.findMany({
      where: {
        Title_Score__c: null,
      },
    });
    getContactsWithoutRank.map(async (contact) => {
      const title = contact.Title;
      const joiningDate = contact.CreatedDate;
      const titleScore = await this.matchCriteriaRules(title, joiningDate);
      await this.prisma.contact.update({
        where: {
          id: contact.id,
        },
        data: {
          Title_Score__c: titleScore,
        },
      });
    });
  }

  async matchCriteriaRules(
    title: string,
    joiningDate: string | Date,
  ): Promise<number> {
    const criteria = title.split(' ');
    let score = 0;
    let matchedScore = [];
    criteria.map((c, index) => {
      if (this.matchDepartment(c)) {
        matchedScore.push('DEPARTMENT_MATCHED');
      }
      if (this.matchTitle(c)) {
        matchedScore.push('TILE_MATCHED');
      }
      if (this.matchTopPost(c)) {
        matchedScore.push('POST_MATCHED');
      }
      /**
       * Since this is last index here we will calculate score based on matched criteria
       */
      if (index === criteria.length - 1) {
        // last index
        if (
          matchedScore.includes('DEPARTMENT_MATCHED') &&
          matchedScore.includes('TITLE_MATCHED')
        ) {
          score = score + 50;
          const getJoinedTime = this.getDuration(joiningDate, new Date());
          if (getJoinedTime > 365 && getJoinedTime < 365 * 2) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 1 to 2 years
             */
            score = score + 15;
          }
          if (getJoinedTime > 365 * 2 && getJoinedTime < 365 * 3) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 2 to 3 years
             */
            score = score + 10;
          }
          if (getJoinedTime > 365 * 3) {
            /**
             * @bhagirath Please add score to calculate if joined date is more than 3 years
             */
            score = score + 5;
          }
        }
        if (matchedScore.includes('POST_MATCHED')) {
          score = score + 75;

          const getJoinedTime = this.getDuration(joiningDate, new Date());
          if (getJoinedTime > 365 && getJoinedTime < 365 * 2) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 1 to 2 years
             */
            score = score + 15;
          }
          if (getJoinedTime > 365 * 2 && getJoinedTime < 365 * 3) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 2 to 3 years
             */
            score = score + 10;
          }
          if (getJoinedTime > 365 * 3) {
            /**
             * @bhagirath Please add score to calculate if joined date is more than 3 years
             */
            score = score + 5;
          }
        }
      }
    });
    return score;
  }

  /**
   * Match Department based on criteria
   * @bhagirath Add more departments here
   * @param str string
   * @returns boolean
   */
  matchDepartment(str: string) {
    return ['Sales', 'IT', 'Marketing'].includes(str);
  }
  /**
   * Match Title based on criteria
   * @bhagirath Add more Titles here
   * @param str string
   * @returns boolean
   */
  matchTitle(str: string) {
    return ['Senior', 'VP', 'Manager', 'Deputy'].includes(str);
  }

  /**
   * Match Post based on criteria
   * @bhagirath Add more Posts here
   * @param str string
   * @returns boolean
   */
  matchTopPost(str: string) {
    return ['CEO', 'CFO', 'CTO', 'COO'].includes(str);
  }

  getDuration(d1: string | Date, d2: string | Date) {
    const date1 = new Date(d1).getTime();
    const date2 = new Date(d2).getTime();
    const diffTime = Math.abs(date2 - date1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  async getEmployeeRankings(
    employeePercentageRequest: number,
    minimumCount: number,
    rowIds: number[],
  ): Promise<any> {
    // $employeePercentage = ((float)$request->get('employeePercentage') / 100);
    // $minimumCount = (int)$request->get('minimumCount');
    const employeePercentage = employeePercentageRequest / 100;

    const allContacts = await this.prisma.contact.findMany({
      where: {
        id: {
          in: rowIds,
        },
      },
      select: {
        LastName: true,
        FirstName: true,
        AccountId: true,
        Email: true,
        Title: true,
        RingLead_Score__c: true,
        Account: {
          select: {
            Name: true,
          },
        },
      },
    });

    allContacts.map((contact) => {
      const newContactsDataWithindex = [];
    });
  }
}
