import http from 'http'
import url from 'url'
import dotenv from 'dotenv'
import { mainManager } from './modules/MainManager'
import { TwitterUtil } from './utils/TwitterUtil'
import { SpaceDownloader } from './modules/SpaceDownloader'
import { Util } from './utils/Util'

dotenv.config()

const PORT = process.env.API_SERVER_PORT || 3000
const API_KEY = process.env.API_KEY || ''

const sendJsonResponse = (res: http.ServerResponse, statusCode: number, data: any) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

const authenticate = (req: http.IncomingMessage): boolean => {
  const apiKey = req.headers['x-api-key']
  if (!apiKey || apiKey !== API_KEY) {
    return false
  }
  return true
}

const server = http.createServer(async (req, res) => {
  if (!authenticate(req)) {
    sendJsonResponse(res, 401, { error: 'Unauthorized' })
    return
  }

  const parsedUrl = url.parse(req.url || '', true)

  if (req.method === 'GET' && parsedUrl.pathname === '/space') {
    const spaceUrl = parsedUrl.query.spaceUrl
    if (!spaceUrl) {
      sendJsonResponse(res, 400, { error: 'Missing spaceUrl query parameter' })
      return
    }
    const spaceId = TwitterUtil.getSpaceId(spaceUrl as string)
    if (!spaceId) {
      sendJsonResponse(res, 400, { error: 'Invalid spaceUrl parameter' })
      return
    }
    try {
      mainManager.addSpaceWatcher(spaceId)
      sendJsonResponse(res, 200, { message: 'Space watcher started', spaceId })
    } catch (error: any) {
      sendJsonResponse(res, 500, { error: 'Failed to start space watcher', details: error.message })
    }
  } else if (req.method === 'POST' && parsedUrl.pathname === '/space') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const spaceUrl = data.spaceUrl
        if (!spaceUrl) {
          sendJsonResponse(res, 400, { error: 'Missing spaceUrl in request body' })
          return
        }
        const spaceId = TwitterUtil.getSpaceId(spaceUrl)
        if (!spaceId) {
          sendJsonResponse(res, 400, { error: 'Invalid spaceUrl parameter' })
          return
        }
        mainManager.addSpaceWatcher(spaceId)
        sendJsonResponse(res, 200, { message: 'Space watcher started', spaceId })
      } catch (error: any) {
        sendJsonResponse(res, 400, { error: 'Invalid JSON body', details: error.message })
      }
    })
  } else if (req.method === 'GET' && parsedUrl.pathname === '/download') {
    const downloadUrl = parsedUrl.query.url
    if (!downloadUrl) {
      sendJsonResponse(res, 400, { error: 'Missing url query parameter' })
      return
    }
    try {
      if ((downloadUrl as string).includes('/i/spaces/')) {
        const spaceId = TwitterUtil.getSpaceId(downloadUrl as string)
        if (!spaceId) {
          sendJsonResponse(res, 400, { error: 'Invalid space URL' })
          return
        }
        mainManager.addSpaceWatcher(spaceId)
        sendJsonResponse(res, 200, { message: 'Space download started', spaceId })
      } else {
        const timestamp = Util.getDateTimeString()
        const downloader = new SpaceDownloader(downloadUrl as string, timestamp)
        downloader.download()
        sendJsonResponse(res, 200, { message: 'Playlist download started', url: downloadUrl })
      }
    } catch (error: any) {
      sendJsonResponse(res, 500, { error: 'Failed to start download', details: error.message })
    }
  } else if (req.method === 'POST' && parsedUrl.pathname === '/download') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const downloadUrl = data.url
        if (!downloadUrl) {
          sendJsonResponse(res, 400, { error: 'Missing url in request body' })
          return
        }
        if ((downloadUrl as string).includes('/i/spaces/')) {
          const spaceId = TwitterUtil.getSpaceId(downloadUrl as string)
          if (!spaceId) {
            sendJsonResponse(res, 400, { error: 'Invalid space URL' })
            return
          }
          mainManager.addSpaceWatcher(spaceId)
          sendJsonResponse(res, 200, { message: 'Space download started', spaceId })
        } else {
          const timestamp = Util.getDateTimeString()
          const downloader = new SpaceDownloader(downloadUrl as string, timestamp)
          downloader.download()
          sendJsonResponse(res, 200, { message: 'Playlist download started', url: downloadUrl })
        }
      } catch (error: any) {
        sendJsonResponse(res, 400, { error: 'Invalid JSON body', details: error.message })
      }
    })
  } else {
    sendJsonResponse(res, 404, { error: 'Not found' })
  }
})

server.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`)
})
