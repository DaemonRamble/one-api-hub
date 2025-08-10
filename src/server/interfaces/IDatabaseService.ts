import { Site, User } from '../../types'

export interface IDatabaseService {
  // User operations
  getUser(username: string): Promise<User | null>
  verifyPassword(username: string, password: string): Promise<boolean>
  updatePassword(username: string, newPassword: string): Promise<boolean>

  // Site operations
  getAllSites(): Promise<Site[]>
  getSite(id: string): Promise<Site | null>
  addSite(site: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>): Promise<Site>
  updateSite(
    id: string,
    updates: Partial<Pick<Site, 'name' | 'accessToken' | 'url' | 'description' | 'userId' | 'type' | 'username' | 'usedQuota' | 'quota'>>
  ): Promise<void>
  deleteSite(id: string): Promise<void>

  // Connection management
  close(): void
}
