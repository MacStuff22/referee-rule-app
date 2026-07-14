'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function InviteForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setStatus('')

    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: name }),
    })

    const data = await res.json()
    if (res.ok) {
      setIsError(false)
      setStatus(`Invitation sent to ${email}`)
      setName('')
      setEmail('')
      router.refresh()
    } else {
      setIsError(true)
      setStatus(`Error: ${data.error}`)
    }

    setLoading(false)
  }

  return (
    <form onSubmit={sendInvite} className="space-y-4">
      {status && (
        <Alert variant={isError ? 'destructive' : 'default'}>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? 'Sending…' : 'Send Invitation'}
      </Button>
    </form>
  )
}
