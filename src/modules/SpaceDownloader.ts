import axios from 'axios'
import { spawn } from 'child_process'
import { existsSync, writeFileSync } from 'fs'
import path from 'path'
import { setTimeout } from 'timers'
import winston from 'winston'
import { PeriscopeApi } from '../apis/PeriscopeApi'
import { logger as baseLogger } from '../logger'
import { PeriscopeUtil } from '../utils/PeriscopeUtil'
import { Util } from '../utils/Util'
import { configManager } from './ConfigManager'

export class SpaceDownloader {
  private logger: winston.Logger

  private playlistUrl: string
  private playlistFile: string
  private audioFile: string

  constructor(
    private readonly originUrl: string,
    private readonly filename: string,
    private readonly subDir = '',
    private readonly metadata?: Record<string, any>,
  ) {
    this.logger = baseLogger.child({ label: '[SpaceDownloader]' })
    this.logger.debug('constructor', {
      originUrl, filename, subDir, metadata,
    })
    this.playlistFile = path.join(Util.getMediaDir(subDir), `${filename}.m3u8`)
    this.audioFile = path.join(Util.getMediaDir(subDir), `${filename}.m4a`)
    this.logger.verbose(`Playlist path: "${this.playlistFile}"`)
    this.logger.verbose(`Audio path: "${this.audioFile}"`)
  }

  public async download() {
    this.logger.debug('download', { playlistUrl: this.playlistUrl, originUrl: this.originUrl })
    if (!this.playlistUrl) {
      this.playlistUrl = await PeriscopeApi.getFinalPlaylistUrl(this.originUrl)
      this.logger.info(`Final playlist url: ${this.playlistUrl}`)
    }
    Util.createMediaDir(this.subDir)
    await this.saveFinalPlaylist()
    await this.spawnFfmpeg() // Await ffmpeg process
  }

  private async saveFinalPlaylist() {
    try {
      this.logger.debug(`--> saveFinalPlaylist: ${this.playlistUrl}`)
      const { data } = await axios.get<string>(this.playlistUrl)
      this.logger.debug(`<-- saveFinalPlaylist: ${this.playlistUrl}`)
      const prefix = PeriscopeUtil.getChunkPrefix(this.playlistUrl)
      this.logger.debug(`Chunk prefix: ${prefix}`)
      const newData = data.replace(/^chunk/gm, `${prefix}chunk`)
      writeFileSync(this.playlistFile, newData)
      this.logger.verbose(`Playlist saved to "${this.playlistFile}"`)
    } catch (error: any) {
      this.logger.debug(`saveFinalPlaylist: ${error.message}`)
      const status = error.response?.status
      if (status === 404 && this.originUrl !== this.playlistUrl) {
        this.playlistUrl = null
      }
      throw error
    }
  }

  private async spawnFfmpeg(): Promise<void> {
    const cmd = 'ffmpeg'
    const args = [
      '-protocol_whitelist',
      'file,https,tls,tcp',
      '-i',
      this.playlistUrl,
      '-c',
      'copy',
    ]

    if (this.metadata) {
      this.logger.debug('Audio metadata', this.metadata)
      Object.keys(this.metadata).forEach((key) => {
        const value = this.metadata[key]
        if (!value) return
        args.push('-metadata', `${key}=${value}`)
      })
    }

    const { config } = configManager
    if (config?.ffmpegArgs?.length) {
      args.push(...config.ffmpegArgs)
    }

    args.push(this.audioFile)

    this.logger.verbose(`Audio is saving to "${this.audioFile}"`)
    this.logger.verbose(`${cmd} ${args.join(' ')}`)

    return new Promise((resolve, reject) => {
      const cp = process.platform === 'win32'
        ? spawn(process.env.comspec!, ['/c', cmd, ...args])
        : spawn(cmd, args)

      cp.stderr?.on('data', (data) => {
        this.logger.verbose(`[ffmpeg] ${data.toString()}`)
      })

      cp.on('error', (err) => {
        this.logger.error(`ffmpeg error: ${err.message}`)
        reject(err)
      })

      cp.on('close', async (code) => {
        this.logger.info(`ffmpeg exited with code ${code}`)
        if (code !== 0) {
          return reject(new Error(`ffmpeg exited with code ${code}`))
        }

        // Wait until file appears (max 10 seconds)
        const maxWait = 10000
        const interval = 500
        let waited = 0

        while (!existsSync(this.audioFile)) {
          if (waited >= maxWait) {
            return reject(new Error(`Output file not found after ffmpeg exit: ${this.audioFile}`))
          }
          await new Promise(resolve => setTimeout(resolve, interval))
          waited += interval
        }

        this.logger.info(`Audio file saved: ${this.audioFile}`)
        resolve()
      })
    })
  }
}
