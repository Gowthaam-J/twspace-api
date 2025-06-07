
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import fs from 'fs'
import { Pool } from 'pg'
import winston from 'winston'

export class StorageManager {
  private s3Client: S3Client
  private pool: Pool
  private logger: winston.Logger

  constructor() {
    this.logger = winston.createLogger({ level: 'info' })
    // Initialize S3 client with environment variables
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    })

    // Initialize PostgreSQL pool with environment variable
    // Disable SSL entirely if PG_DISABLE_SSL is set to 'true'
    if (process.env.PG_DISABLE_SSL === 'true') {
      this.pool = new Pool({
        connectionString: process.env.POSTGRES_CONNECTION_STRING,
        ssl: false,
      })
    } else {
      const rejectUnauthorized = process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true' ? true : false
      let sslConfig: any = { rejectUnauthorized }

      if (process.env.PG_SSL_CA_CERT_PATH) {
        const fs = require('fs')
        try {
          const caCert = fs.readFileSync(process.env.PG_SSL_CA_CERT_PATH).toString()
          sslConfig.ca = caCert
        } catch (err) {
          this.logger.error(`Failed to read CA certificate from path: ${process.env.PG_SSL_CA_CERT_PATH}, error: ${err.message}`)
        }
      }

      this.pool = new Pool({
        connectionString: process.env.POSTGRES_CONNECTION_STRING,
        ssl: sslConfig,
      })
    }
    
    
  }

  public async uploadFileToS3(filePath: string, key: string): Promise<string> {
    const fileContent = fs.readFileSync(filePath)
    const bucketName = process.env.AWS_S3_BUCKET_NAME || ''
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: fileContent,
    }
    try {
      const command = new PutObjectCommand(params)
      await this.s3Client.send(command)
      const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
      this.logger.info(`File uploaded successfully at ${s3Url}`)
      return s3Url
    } catch (error) {
      this.logger.error(`S3 upload error: ${error.message}`)
      throw error
    }
  }

  public async saveSpaceLinkToDb(spaceId: string, s3Url: string): Promise<void> {
    const query = 'INSERT INTO spaces (space_id, s3_url) VALUES ($1, $2) ON CONFLICT (space_id) DO UPDATE SET s3_url = EXCLUDED.s3_url'
    try {
      await this.pool.query(query, [spaceId, s3Url])
      this.logger.info(`Space link saved to DB for spaceId: ${spaceId}`)
    } catch (error) {
      this.logger.error(`DB save error: ${error.message}`)
      throw error
    }
  }
}

export const storageManager = new StorageManager()
