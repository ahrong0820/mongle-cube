import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const port = Number(process.env.MONGLE_MOBILE_PORT || 4174)
const accessKey = process.env.MONGLE_MOBILE_KEY || randomBytes(12).toString('hex')
const cookieName = 'mongle_mobile_preview'
const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
const expiresAfterMs = 2 * 60 * 60 * 1000

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function getDisplayAddress() {
  for (const connections of Object.values(networkInterfaces())) {
    for (const connection of connections ?? []) {
      if (connection.family === 'IPv4' && !connection.internal) return connection.address
    }
  }
  return 'PC-IP-주소'
}

function keysMatch(candidate) {
  if (!candidate) return false
  const expected = Buffer.from(accessKey)
  const received = Buffer.from(candidate)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function hasAccess(request) {
  return (request.headers.cookie ?? '')
    .split(';')
    .some((part) => part.trim() === `${cookieName}=${accessKey}`)
}

function sendNotFound(response) {
  response.writeHead(404, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  })
  response.end('페이지를 찾지 못했어요.')
}

if (!existsSync(resolve(distDirectory, 'index.html'))) {
  console.error('dist 폴더가 없습니다. 먼저 pnpm build를 실행해 주세요.')
  process.exit(1)
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost')
  const suppliedKey = requestUrl.searchParams.get('key')

  if (keysMatch(suppliedKey)) {
    response.writeHead(302, {
      'Cache-Control': 'no-store',
      'Set-Cookie': `${cookieName}=${accessKey}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200`,
      Location: '/',
    })
    response.end()
    return
  }

  if (!hasAccess(request)) {
    sendNotFound(response)
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(requestUrl.pathname)
  } catch {
    sendNotFound(response)
    return
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const filePath = resolve(distDirectory, relativePath)
  if (!filePath.startsWith(`${resolve(distDirectory)}${sep}`) || !existsSync(filePath)) {
    sendNotFound(response)
    return
  }

  const stats = statSync(filePath)
  if (!stats.isFile()) {
    sendNotFound(response)
    return
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': stats.size,
    'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  })
  createReadStream(filePath).pipe(response)
})

server.listen(port, '0.0.0.0', () => {
  const address = getDisplayAddress()
  console.log(`모바일 주소: http://${address}:${port}/?key=${accessKey}`)
  console.log('이 주소를 가진 기기만 열 수 있으며 2시간 뒤 서버가 자동 종료됩니다.')
})

const expiryTimer = setTimeout(() => {
  console.log('2시간이 지나 모바일 미리보기 서버를 종료합니다.')
  server.close()
}, expiresAfterMs)

server.on('close', () => clearTimeout(expiryTimer))

process.on('SIGINT', () => server.close())
process.on('SIGTERM', () => server.close())
