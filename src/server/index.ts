import { Hono } from 'hono'
import 'dotenv/config'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { DatabaseFactory } from './DatabaseFactory'
import { SiteApiService } from './siteapi'
import { authMiddleware, generateToken } from './auth'
import fs from 'fs'
import path from 'path'
import { createLogger } from './logger'
import { ERROR_CODES, createErrorResponse } from './errorCodes'
import type {
  LoginRequest,
  ApiResponse,
  ApiKeyInfo,
  ChangePasswordRequest,
  Site,
  UserInfo,
  LoginResponse,
} from '../types'
import { SITE_TYPES } from '../types'

// Define Hono environment types
type Env = {
  Variables: {
    user: {
      userId: string
      username: string
    }
  }
}

const app = new Hono<Env>()
const db = DatabaseFactory.createDatabase()
const siteApiService = new SiteApiService()
const logger = createLogger('server')

app.use('/*', cors())

app.post('/api/login', async (c) => {
  try {
    const { password }: LoginRequest = await c.req.json()

    const adminUsername = 'admin'
    const isValid = await db.verifyPassword(adminUsername, password)
    if (!isValid) {
      logger.warn('Login attempt with invalid password', {
        ip: c.req.header('x-forwarded-for') || 'unknown',
      })
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(
          ERROR_CODES.AUTH_INVALID_PASSWORD,
          'Invalid password'
        ),
        401
      )
    }

    const user = (await db.getUser(adminUsername))!
    const token = generateToken(user.id, user.username)

    logger.info('User logged in successfully', { username: user.username })

    return c.json<ApiResponse<LoginResponse>>({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    })
  } catch (error: unknown) {
    logger.error('Login error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Internal server error'
      ),
      500
    )
  }
})

app.use('/api/*', authMiddleware)

app.post('/api/change-password', async (c) => {
  try {
    const { currentPassword, newPassword }: ChangePasswordRequest =
      await c.req.json()
    const user = c.get('user')

    if (!currentPassword || !newPassword) {
      logger.warn('Password change attempt with missing fields', {
        username: user.username,
      })
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(
          ERROR_CODES.AUTH_PASSWORD_REQUIRED,
          'Current password and new password cannot be empty'
        ),
        400
      )
    }

    if (newPassword.length < 6) {
      logger.warn('Password change attempt with weak password', {
        username: user.username,
      })
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(
          ERROR_CODES.AUTH_PASSWORD_TOO_SHORT,
          'New password must be at least 6 characters'
        ),
        400
      )
    }

    const isCurrentPasswordValid = await db.verifyPassword(
      user.username,
      currentPassword
    )
    if (!isCurrentPasswordValid) {
      logger.warn('Password change attempt with invalid current password', {
        username: user.username,
        ip: c.req.header('x-forwarded-for') || 'unknown',
      })
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(
          ERROR_CODES.AUTH_CURRENT_PASSWORD_INCORRECT,
          'Current password is incorrect'
        ),
        400
      )
    }

    const success = await db.updatePassword(user.username, newPassword)
    if (!success) {
      logger.error('Failed to update password in database', {
        username: user.username,
      })
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(
          ERROR_CODES.AUTH_PASSWORD_UPDATE_FAILED,
          'Password update failed, please try again later'
        ),
        500
      )
    }

    logger.info('Password changed successfully', {
      username: user.username,
      ip: c.req.header('x-forwarded-for') || 'unknown',
    })

    return c.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: 'Password changed successfully' },
    })
  } catch (error: unknown) {
    logger.error('Password change error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      username: c.get('user')?.username,
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Internal server error'
      ),
      500
    )
  }
})

app.get('/api/export', async (c) => {
  try {
    const sites = await db.getAllSites()

    // Export data structure
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: {
        sites: sites.map((site) => ({
          ...site,
          // Convert dates to ISO strings for JSON serialization
          createdAt: site.createdAt.toISOString(),
          updatedAt: site.updatedAt.toISOString(),
        })),
      },
    }

    logger.info('Data exported', {
      sitesCount: sites.length,
      exportTimestamp: exportData.timestamp,
    })

    return c.json(exportData)
  } catch (error: unknown) {
    logger.error('Export error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.DATA_EXPORT_FAILED,
        'Failed to export data'
      ),
      500
    )
  }
})

app.post('/api/import', async (c) => {
  try {
    const importData = await c.req.json()

    // Validate import data structure
    if (
      !importData.data ||
      !importData.data.sites ||
      !Array.isArray(importData.data.sites)
    ) {
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Invalid import data format'
        ),
        400
      )
    }

    const sites = importData.data.sites

    logger.info('Starting data import', {
      sitesCount: sites.length,
      importVersion: importData.version,
    })

    // Clear existing sites (this will overwrite all data)
    const existingSites = await db.getAllSites()
    for (const site of existingSites) {
      await db.deleteSite(site.id)
    }

    logger.info('Cleared existing sites', { count: existingSites.length })

    // Import new sites
    let importedCount = 0
    for (const siteData of sites) {
      try {
        // Validate required fields
        if (
          !siteData.name ||
          !siteData.accessToken ||
          !siteData.url ||
          !siteData.userId
        ) {
          logger.warn('Skipping invalid site data', { siteName: siteData.name })
          continue
        }

        await db.addSite({
          name: siteData.name,
          accessToken: siteData.accessToken,
          url: siteData.url,
          description: siteData.description || '',
          userId: siteData.userId,
          type: siteData.type || SITE_TYPES.NEW_API,
          username: siteData.username,
          usedQuota: siteData.usedQuota,
          quota: siteData.quota,
        })

        importedCount++
      } catch (error) {
        logger.warn('Failed to import site', {
          siteName: siteData.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    logger.info('Data import completed', {
      totalSites: sites.length,
      importedSites: importedCount,
      skippedSites: sites.length - importedCount,
    })

    return c.json<
      ApiResponse<{ message: string; imported: number; total: number }>
    >({
      success: true,
      data: {
        message: `Successfully imported ${importedCount} out of ${sites.length} sites`,
        imported: importedCount,
        total: sites.length,
      },
    })
  } catch (error: unknown) {
    logger.error('Import error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.DATA_IMPORT_FAILED,
        'Failed to import data'
      ),
      500
    )
  }
})

app.get('/api/sites', async (c) => {
  try {
    const sites = await db.getAllSites()
    logger.debug('Retrieved all sites', { count: sites.length })
    return c.json<ApiResponse<Site[]>>({ success: true, data: sites })
  } catch (error: unknown) {
    logger.error('Failed to fetch sites', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.DATA_FETCH_FAILED,
        'Failed to fetch sites'
      ),
      500
    )
  }
})

app.post('/api/sites', async (c) => {
  try {
    logger.info('Creating new site', { endpoint: 'POST /api/sites' })
    const requestBody = await c.req.json()
    logger.debug('Site creation request data', {
      name: requestBody.name,
      url: requestBody.url,
      type: requestBody.type,
    })

    const { name, accessToken, url, description, userId, type } = requestBody

    if (!name || !accessToken || !url) {
      logger.warn('Site creation failed - missing required fields', {
        missingFields: {
          name: !name,
          accessToken: !accessToken,
          url: !url,
        },
      })
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(
          ERROR_CODES.INVALID_REQUEST,
          'Name, access token, and URL are required'
        ),
        400
      )
    }

    logger.info('Validating site credentials', { siteName: name, siteUrl: url })
    // Validate site and fetch initial data
    const tempSite = { name, accessToken, url, description, userId, type }
    const isValid = await siteApiService.validateSite(tempSite)
    logger.debug('Site validation result', { siteName: name, isValid })

    if (!isValid) {
      logger.warn('Site validation failed', { siteName: name, siteUrl: url })
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(
          ERROR_CODES.SITE_INVALID_CREDENTIALS,
          'Invalid site credentials or connection failed'
        ),
        400
      )
    }

    logger.info('Fetching user info for new site', { siteName: name })
    // Fetch user info and API keys immediately
    const { userInfo } = await siteApiService.refreshSiteData({
      ...tempSite,
      id: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    logger.debug('User info fetched', {
      siteName: name,
      username: userInfo?.username,
    })

    logger.info('Adding site to database', { siteName: name })
    // Add site with user info
    const site = await db.addSite({
      name,
      accessToken,
      url,
      description,
      userId,
      type,
      username: userInfo?.username,
      usedQuota: userInfo?.usedQuota,
      quota: userInfo?.quota,
    })
    logger.info('Site created successfully', {
      siteId: site.id,
      siteName: name,
    })

    return c.json<ApiResponse<Site>>({ success: true, data: site })
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error('Site creation failed', { error: errorMessage })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(ERROR_CODES.SITE_CREATE_FAILED, errorMessage),
      500
    )
  }
})

app.put('/api/sites/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { name, accessToken, url, description, userId, type } =
      await c.req.json()

    logger.info('Updating site', { siteId: id, siteName: name })

    const existingSite = await db.getSite(id)
    if (!existingSite) {
      logger.warn('Site update failed - site not found', { siteId: id })
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(ERROR_CODES.SITE_NOT_FOUND, 'Site not found'),
        404
      )
    }

    if (accessToken && url && userId) {
      logger.debug('Validating updated site credentials', { siteId: id })
      const isValid = await siteApiService.validateSite({
        name: name || existingSite.name,
        accessToken,
        url,
        description: description || existingSite.description,
        userId,
        type: type || existingSite.type,
      })
      if (!isValid) {
        logger.warn('Site update failed - invalid credentials', { siteId: id })
        return c.json<ApiResponse<unknown>>(
          createErrorResponse(
            ERROR_CODES.SITE_INVALID_CREDENTIALS,
            'Invalid site credentials or connection failed'
          ),
          400
        )
      }
    }

    await db.updateSite(id, { name, accessToken, url, description, userId, type })
    logger.info('Site updated successfully', { siteId: id })
    const updatedSite = await db.getSite(id)
    return c.json<ApiResponse<Site | null>>({
      success: true,
      data: updatedSite,
    })
  } catch (error: unknown) {
    logger.error('Site update failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      siteId: c.req.param('id'),
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.SITE_UPDATE_FAILED,
        'Failed to update site'
      ),
      500
    )
  }
})

app.delete('/api/sites/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await db.deleteSite(id)
    return c.json<ApiResponse<unknown>>({ success: true })
  } catch (error) {
    logger.error('Failed to delete site', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.SITE_DELETE_FAILED,
        'Failed to delete site'
      ),
      500
    )
  }
})

app.get('/api/sites/:id/user', async (c) => {
  try {
    const id = c.req.param('id')
    const site = await db.getSite(id)

    if (!site) {
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(ERROR_CODES.SITE_NOT_FOUND, 'Site not found'),
        404
      )
    }

    const userInfo = await siteApiService.getUserInfo(site)

    if (userInfo) {
      await db.updateSite(id, {
        username: userInfo.username,
        usedQuota: userInfo.usedQuota,
        quota: userInfo.quota,
      })
    }

    return c.json<ApiResponse<UserInfo | null>>({
      success: true,
      data: userInfo,
    })
  } catch (error) {
    logger.error('Failed to delete site', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.SITE_USER_QUERY_FAILED,
        'Failed to query user info'
      ),
      500
    )
  }
})

app.get('/api/sites/:id/tokens', async (c) => {
  try {
    const id = c.req.param('id')
    const site = await db.getSite(id)

    if (!site) {
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(ERROR_CODES.SITE_NOT_FOUND, 'Site not found'),
        404
      )
    }

    const apiKeys = await siteApiService.getApiKeys(site)

    return c.json<ApiResponse<ApiKeyInfo[]>>({
      success: true,
      data: apiKeys,
    })
  } catch (error) {
    logger.error('Failed to query API keys', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(
        ERROR_CODES.SITE_TOKENS_QUERY_FAILED,
        'Failed to query API keys'
      ),
      500
    )
  }
})

app.post('/api/sites/:id/checkin', async (c) => {
  try {
    const id = c.req.param('id')
    const site = await db.getSite(id)

    if (!site) {
      return c.json<ApiResponse<unknown>>(
        createErrorResponse(ERROR_CODES.SITE_NOT_FOUND, 'Site not found'),
        404
      )
    }

    const result = await siteApiService.checkIn(site)

    return c.json<ApiResponse<{ message: string }>>({
      success: result.success,
      data: { message: result.message },
      error: result.success ? undefined : result.message,
    })
  } catch (error) {
    logger.error('Failed to check in', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return c.json<ApiResponse<unknown>>(
      createErrorResponse(ERROR_CODES.CHECKIN_FAILED, 'Failed to check in'),
      500
    )
  }
})

app.get('/api/health', (c) => {
  return c.json<ApiResponse<{ status: string }>>({
    success: true,
    data: { status: 'ok' },
  })
})

// Serve static assets for client build and enable SPA fallback
const clientRoot = path.join(process.cwd(), 'dist', 'client')

const getContentType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'application/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.map':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.ttf':
      return 'font/ttf'
    case '.eot':
      return 'application/vnd.ms-fontobject'
    default:
      return 'application/octet-stream'
  }
}

app.get('/*', (c) => {
  const url = new URL(c.req.url)
  const urlPath = url.pathname

  // Resolve target path within client root
  const resolvedPath = path.resolve(clientRoot, '.' + urlPath)
  const isInsideRoot = resolvedPath.startsWith(clientRoot)

  let filePath = isInsideRoot
    ? resolvedPath
    : path.join(clientRoot, 'index.html')

  try {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null
    if (!stat || stat.isDirectory()) {
      filePath = path.join(clientRoot, 'index.html')
    }
    const data = fs.readFileSync(filePath)
    const contentType = getContentType(filePath)
    return new Response(data, { headers: { 'Content-Type': contentType } })
  } catch {
    return c.text('Not Found', 404)
  }
})

const port = process.env.PORT || 8000

logger.info('Starting One API Hub server', {
  port: Number(port),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
})

serve({
  fetch: app.fetch,
  port: Number(port),
})

logger.info('Server is running successfully', { port: Number(port) })

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, gracefully shutting down')
  db.close()
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('Received SIGINT, gracefully shutting down')
  db.close()
  process.exit(0)
})
