import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getUserModels } from '@/lib/api'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { Button } from '@/components/ui/button'
import { ComboboxInput } from '@/components/ui/combobox-input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

type Lang = 'curl' | 'python' | 'typescript' | 'go'

function getServerAddress(): string {
  try {
    const raw = localStorage.getItem('status')
    if (raw) {
      const status = JSON.parse(raw)
      if (status.server_address) return status.server_address as string
    }
  } catch {
    /* empty */
  }
  return window.location.origin
}

function buildSnippet(
  lang: Lang,
  baseUrl: string,
  apiKey: string,
  model: string
): string {
  const chatEndpoint = `${baseUrl}/v1/chat/completions`

  if (lang === 'curl') {
    return `curl ${chatEndpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${model}",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`
  }

  if (lang === 'python') {
    return `# pip install openai
from openai import OpenAI

client = OpenAI(
    api_key="${apiKey}",
    base_url="${baseUrl}/v1",
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`
  }

  if (lang === 'typescript') {
    return `// npm install openai  (or: bun add openai)
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${apiKey}",
  baseURL: "${baseUrl}/v1",
});

const response = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`
  }

  // go
  return `// go get github.com/sashabaranov/go-openai
package main

import (
\t"context"
\t"fmt"

\topenai "github.com/sashabaranov/go-openai"
)

func main() {
\tcfg := openai.DefaultConfig("${apiKey}")
\tcfg.BaseURL = "${baseUrl}/v1"
\tclient := openai.NewClientWithConfig(cfg)

\tresp, err := client.CreateChatCompletion(context.Background(),
\t\topenai.ChatCompletionRequest{
\t\t\tModel: "${model}",
\t\t\tMessages: []openai.ChatCompletionMessage{
\t\t\t\t{Role: "user", Content: "Hello!"},
\t\t\t},
\t\t})
\tif err != nil {
\t\tpanic(err)
\t}
\tfmt.Println(resp.Choices[0].Message.Content)
}`
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tokenKey: string
}

export function UsageSnippetDialog(props: Props) {
  const { t } = useTranslation()
  const [model, setModel] = useState('gpt-3.5-turbo')
  const [lang, setLang] = useState<Lang>('curl')
  const [copied, setCopied] = useState(false)

  const baseUrl = getServerAddress()
  const apiKey = props.tokenKey.startsWith('sk-')
    ? props.tokenKey
    : `sk-${props.tokenKey}`

  const { data: modelsData } = useQuery({
    queryKey: ['user-models-snippet'],
    queryFn: getUserModels,
    enabled: props.open,
    staleTime: 5 * 60 * 1000,
  })

  const modelOptions = useMemo(() => {
    const items = modelsData?.data ?? []
    return items.map((m) => ({ value: m, label: m }))
  }, [modelsData?.data])

  useEffect(() => {
    const first = modelsData?.data?.[0]
    if (props.open && first && model === 'gpt-3.5-turbo') {
      setModel(first)
    }
  }, [props.open, modelsData?.data, model])

  const snippet = useMemo(
    () => buildSnippet(lang, baseUrl, apiKey, model),
    [lang, baseUrl, apiKey, model]
  )

  const handleCopy = async () => {
    const ok = await copyToClipboard(snippet)
    if (ok) {
      setCopied(true)
      toast.success(t('Copied'))
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('API call examples')}</DialogTitle>
          <DialogDescription>
            {t('Copy and paste these snippets to make your first call.')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label>{t('Model')}</Label>
            <ComboboxInput
              options={modelOptions}
              value={model}
              onValueChange={setModel}
              placeholder='gpt-3.5-turbo'
              emptyText={t('No models found')}
            />
          </div>

          <Tabs
            value={lang}
            onValueChange={(v) => v !== null && setLang(v as Lang)}
          >
            <TabsList>
              <TabsTrigger value='curl'>curl</TabsTrigger>
              <TabsTrigger value='python'>Python</TabsTrigger>
              <TabsTrigger value='typescript'>TypeScript</TabsTrigger>
              <TabsTrigger value='go'>Go</TabsTrigger>
            </TabsList>

            {(['curl', 'python', 'typescript', 'go'] as Lang[]).map((l) => (
              <TabsContent key={l} value={l}>
                <div className='relative'>
                  <pre className='bg-muted max-h-80 overflow-auto rounded-md p-3 pr-12 text-xs leading-relaxed'>
                    <code>{snippet}</code>
                  </pre>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    onClick={handleCopy}
                    aria-label={t('Copy')}
                    className='absolute top-2 right-2'
                  >
                    {copied ? (
                      <Check className='size-4 text-emerald-500' />
                    ) : (
                      <Copy className='size-4' />
                    )}
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
