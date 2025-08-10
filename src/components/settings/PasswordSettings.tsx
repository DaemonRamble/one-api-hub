import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import { useToast } from '@/hooks/use-toast'
import { useApiError } from '@/hooks/useApiError'
import { KeyRound, Shield, Eye, EyeOff } from 'lucide-react'
import type { ApiResponse, ChangePasswordRequest } from '@/types'

export const PasswordSettings: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { token } = useAuth()
  const { t } = useI18n()
  const { toast } = useToast()
  const { handleApiError } = useApiError()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('toast.fillAllFields'),
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('toast.passwordMismatch'),
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('toast.passwordTooShort'),
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        } as ChangePasswordRequest),
      })

      const result: ApiResponse<any> = await response.json()
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('toast.passwordChanged'),
        })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast({
          variant: 'destructive',
          title: t('common.error'),
          description: handleApiError(result),
        })
      }
    } catch (error) {
      console.error('Error changing password:', error)
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('toast.networkError'),
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">
          {t('settings.password.heading')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('settings.password.subtitle')}
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-blue-900">
              {t('settings.password.guidelines')}
            </h4>
            <ul className="mt-2 text-xs text-blue-700 space-y-1">
              <li>• {t('settings.password.rule1')}</li>
              <li>• {t('settings.password.rule2')}</li>
              <li>• {t('settings.password.rule3')}</li>
              <li>• {t('settings.password.rule4')}</li>
            </ul>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">
            {t('settings.password.current')}
          </Label>
          <div className="relative">
            <Input
              id="currentPassword"
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('settings.password.currentPlaceholder')}
              disabled={isLoading}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              disabled={isLoading}
            >
              {showCurrentPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">{t('settings.password.new')}</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('settings.password.newPlaceholder')}
              disabled={isLoading}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowNewPassword(!showNewPassword)}
              disabled={isLoading}
            >
              {showNewPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">
            {t('settings.password.confirm')}
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('settings.password.confirmPlaceholder')}
              disabled={isLoading}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isLoading}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              t('settings.password.changing')
            ) : (
              <>
                <KeyRound className="mr-2 h-4 w-4" />
                {t('settings.password.change')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
