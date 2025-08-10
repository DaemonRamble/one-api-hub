import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import { useToast } from '@/hooks/use-toast'
import {
  Download,
  Upload,
  FileJson,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react'
import type { ApiResponse } from '@/types'

export const ImportExportSettings: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { token } = useAuth()
  const { t } = useI18n()
  const { toast } = useToast()

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const response = await fetch('/api/export', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const result: ApiResponse<any> = await response.json()
        throw new Error(result.error || 'Export failed')
      }

      const data = await response.json()

      // Create and download file
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `one-api-hub-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: t('common.success'),
        description: t('toast.exportSuccess'),
      })
    } catch (error) {
      console.error('Export error:', error)
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description:
          error instanceof Error ? error.message : t('toast.exportFailed'),
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (file: File) => {
    if (!file.type.includes('json')) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('toast.invalidFileType'),
      })
      return
    }

    setIsImporting(true)
    try {
      const fileContent = await file.text()
      let data

      try {
        data = JSON.parse(fileContent)
      } catch {
        throw new Error(t('toast.invalidJsonFormat'))
      }

      const response = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      })

      const result: ApiResponse<any> = await response.json()
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('toast.importSuccess'),
        })
      } else {
        throw new Error(result.error || t('toast.importFailed'))
      }
    } catch (error) {
      console.error('Import error:', error)
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description:
          error instanceof Error ? error.message : t('toast.importFailed'),
      })
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleImport(file)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">
          {t('settings.importExport.heading')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('settings.importExport.subtitle')}
        </p>
      </div>

      {/* Export Section */}
      <div className="space-y-4">
        <div>
          <h4 className="text-base font-medium mb-2">
            {t('settings.importExport.exportTitle')}
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            {t('settings.importExport.exportDesc')}
          </p>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full sm:w-auto"
          >
            {isExporting ? (
              t('settings.importExport.exporting')
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t('settings.importExport.exportButton')}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="border-t pt-6">
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-medium mb-2">
              {t('settings.importExport.importTitle')}
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.importExport.importDesc')}
            </p>

            <div className="space-y-3">
              <Label
                htmlFor="import-file"
                className="block w-full cursor-pointer"
              >
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                  <FileJson className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                  <span className="text-sm font-medium">
                    {t('settings.importExport.selectFile')}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.importExport.jsonOnly')}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  id="import-file"
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  disabled={isImporting}
                  className="hidden"
                />
              </Label>

              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                variant="outline"
                className="w-full sm:w-auto"
              >
                {isImporting ? (
                  t('settings.importExport.importing')
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {t('settings.importExport.selectButton')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Section */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-yellow-900 mb-2">
              {t('settings.importExport.warningTitle')}
            </h4>
            <div className="text-xs text-yellow-800 space-y-2">
              <div className="flex items-start space-x-2">
                <X className="h-3 w-3 text-red-600 mt-0.5 flex-shrink-0" />
                <span>{t('settings.importExport.warning1')}</span>
              </div>
              <div className="flex items-start space-x-2">
                <X className="h-3 w-3 text-red-600 mt-0.5 flex-shrink-0" />
                <span>{t('settings.importExport.warning2')}</span>
              </div>
              <div className="flex items-start space-x-2">
                <Check className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                <span>{t('settings.importExport.tip1')}</span>
              </div>
              <div className="flex items-start space-x-2">
                <Check className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                <span>{t('settings.importExport.tip2')}</span>
              </div>
              <div className="mt-3 p-2 bg-yellow-100 rounded border border-yellow-300">
                <p className="font-medium">
                  {t('settings.importExport.overwriteWarning')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
