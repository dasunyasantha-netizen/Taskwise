import React, { useState } from 'react'
import { companyApi } from '../services/apiService'

interface Props {
  onClose: () => void
}

const initialCompany = {
  legalName: '', displayName: '', registrationNumber: '', address: '', industry: '',
  website: '', expectedUsers: '', reason: '',
}

const initialApplicant = {
  firstName: '', middleName: '', lastName: '', phone: '', email: '', password: '', confirmPassword: '',
}

export default function CompanyRequestModal({ onClose }: Props) {
  const [company, setCompany] = useState(initialCompany)
  const [applicant, setApplicant] = useState(initialApplicant)
  const [document, setDocument] = useState<{ name: string; mimeType: string; data: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ reference: string; status: string; statusToken: string; message: string } | null>(null)

  const updateCompany = (key: string, value: string) => setCompany(prev => ({ ...prev, [key]: value }))
  const updateApplicant = (key: string, value: string) => setApplicant(prev => ({ ...prev, [key]: value }))

  const handleFile = async (file?: File) => {
    setError('')
    if (!file) { setDocument(null); return }
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
      setError('Supporting document must be PDF, PNG, or JPG.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Supporting document must be 2 MB or smaller.')
      return
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    setDocument({ name: file.name, mimeType: file.type, data })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        company: {
          ...company,
          expectedUsers: company.expectedUsers ? Number(company.expectedUsers) : undefined,
          supportingDocument: document || undefined,
        },
        applicant,
      }
      const res = await companyApi.submitRequest(payload)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request could not be submitted')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-tw-border flex items-center justify-between">
          <div>
            <h2 className="font-bold text-tw-text text-lg">Create a New Company</h2>
            <p className="text-xs text-tw-text-secondary">Submission creates a pending request only. Syswise approval is required.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-red-100 text-red-600 font-bold">×</button>
        </div>

        {result ? (
          <div className="p-6 space-y-4">
            <div className="rounded-xl bg-green-50 border border-green-200 p-4">
              <div className="text-sm font-bold text-green-700">Request submitted</div>
              <div className="mt-2 grid md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-tw-text-secondary">Reference:</span> <span className="font-mono font-semibold">{result.reference}</span></div>
                <div><span className="text-tw-text-secondary">Status:</span> <span className="font-semibold">{result.status}</span></div>
              </div>
              <p className="text-sm text-tw-text mt-3">{result.message}</p>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm">
              Save this status token privately: <span className="font-mono break-all">{result.statusToken}</span>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="btn-primary">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="overflow-y-auto p-5 space-y-6">
            <section>
              <h3 className="text-sm font-bold text-tw-text mb-3">Company details</h3>
              <div className="grid md:grid-cols-2 gap-3">
                <input className="input" placeholder="Legal company name *" value={company.legalName} onChange={e => updateCompany('legalName', e.target.value)} required />
                <input className="input" placeholder="Display or trading name" value={company.displayName} onChange={e => updateCompany('displayName', e.target.value)} />
                <input className="input" placeholder="Company registration number *" value={company.registrationNumber} onChange={e => updateCompany('registrationNumber', e.target.value)} required />
                <input className="input" placeholder="Industry or business type *" value={company.industry} onChange={e => updateCompany('industry', e.target.value)} required />
                <input className="input" placeholder="Website" value={company.website} onChange={e => updateCompany('website', e.target.value)} />
                <input className="input" type="number" min="1" placeholder="Expected number of users" value={company.expectedUsers} onChange={e => updateCompany('expectedUsers', e.target.value)} />
                <textarea className="input md:col-span-2 resize-none" rows={2} placeholder="Address *" value={company.address} onChange={e => updateCompany('address', e.target.value)} required />
                <textarea className="input md:col-span-2 resize-none" rows={3} placeholder="Reason for requesting Syswise access *" value={company.reason} onChange={e => updateCompany('reason', e.target.value)} required />
                <label className="md:col-span-2 border border-dashed border-tw-border rounded-xl p-3 text-sm text-tw-text-secondary cursor-pointer hover:bg-tw-hover">
                  Supporting registration document, optional
                  <input type="file" className="hidden" accept=".pdf,image/png,image/jpeg" onChange={e => handleFile(e.target.files?.[0])} />
                  {document && <div className="mt-1 font-medium text-tw-primary">{document.name}</div>}
                </label>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-tw-text mb-3">First company administrator</h3>
              <div className="grid md:grid-cols-3 gap-3">
                <input className="input" placeholder="First name *" value={applicant.firstName} onChange={e => updateApplicant('firstName', e.target.value)} required />
                <input className="input" placeholder="Middle name" value={applicant.middleName} onChange={e => updateApplicant('middleName', e.target.value)} />
                <input className="input" placeholder="Last name *" value={applicant.lastName} onChange={e => updateApplicant('lastName', e.target.value)} required />
                <input className="input" placeholder="Phone number *" value={applicant.phone} onChange={e => updateApplicant('phone', e.target.value)} required />
                <input className="input" type="email" placeholder="Email *" value={applicant.email} onChange={e => updateApplicant('email', e.target.value)} required />
                <div />
                <input className="input" type="password" placeholder="Password *" value={applicant.password} onChange={e => updateApplicant('password', e.target.value)} required />
                <input className="input" type="password" placeholder="Confirm password *" value={applicant.confirmPassword} onChange={e => updateApplicant('confirmPassword', e.target.value)} required />
              </div>
            </section>

            {error && <div className="bg-red-50 border border-red-200 text-tw-danger text-sm px-3 py-2 rounded-lg">{error}</div>}

            <div className="flex justify-end gap-2 border-t border-tw-border pt-4">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button disabled={loading} className="btn-primary">{loading ? 'Submitting...' : 'Submit Request'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
