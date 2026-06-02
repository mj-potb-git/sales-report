import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react'
import { fetchMetaAccount } from '../../api/meta'

// Tests the Meta connection by hitting the account endpoint.
// Surfaces token expiry warnings + provides one-click regenerate links.
export default function MetaConnectionStatus() {
  const [state, setState] = useState({ status: 'idle' })

  async function test() {
    setState({ status: 'testing' })
    try {
      const acct = await fetchMetaAccount()
      setState({
        status: 'ok',
        account: acct,
        at: new Date(),
      })
    } catch (err) {
      const msg = err.message || String(err)
      const isExpired = /expire|invalid|decrypted|OAuth/i.test(msg)
      setState({
        status: 'error',
        error: msg,
        isExpired,
        at: new Date(),
      })
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { test() }, [])

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">Meta Ads Connection</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Powers spend, leads, ROAS, CPL, CAC. Token lives in <code className="px-1 bg-gray-100 rounded">.env</code>.
          </p>
        </div>
        <button
          onClick={test}
          disabled={state.status === 'testing'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {state.status === 'testing' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Test
        </button>
      </div>

      {state.status === 'testing' && (
        <div className="text-sm text-gray-500">Testing…</div>
      )}

      {state.status === 'ok' && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800">
          <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Connected to "{state.account.name}"</p>
            <p className="text-xs mt-0.5 text-emerald-700/80">
              Currency: <b>{state.account.currency}</b> · Status: <b>{state.account.account_status === 1 ? 'Active' : 'Inactive'}</b>
              {state.account.amount_spent && <> · Lifetime spend: <b>₱{Number(state.account.amount_spent).toLocaleString('en-PH')}</b></>}
            </p>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
            <XCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{state.isExpired ? 'Token expired or invalid' : 'Connection failed'}</p>
              <p className="text-xs mt-0.5 text-red-700/80 break-all">{state.error}</p>
            </div>
          </div>

          {state.isExpired && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
              <p className="font-semibold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Fix in 3 minutes
              </p>
              <ol className="text-xs text-amber-800 mt-2 list-decimal list-inside space-y-1">
                <li>
                  Go to{' '}
                  <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer"
                     className="underline font-semibold inline-flex items-center gap-0.5">
                    Business Settings → System Users <ExternalLink size={10} />
                  </a>
                </li>
                <li>Generate New Token → select <b>POTB DASHBOARD</b> app → set <b>Expiration: Never</b></li>
                <li>Permissions: <code className="px-1 bg-amber-100 rounded">ads_read</code></li>
                <li>Copy token → paste into <code className="px-1 bg-amber-100 rounded">.env</code> at <code className="px-1 bg-amber-100 rounded">META_ACCESS_TOKEN</code></li>
                <li>Restart Vite dev server (Ctrl+C, then <code className="px-1 bg-amber-100 rounded">npm run dev</code>)</li>
                <li>Click <b>Test</b> here again</li>
              </ol>
              <p className="text-[11px] text-amber-700 mt-2">
                <b>Tip:</b> System User tokens never expire (unlike short-lived user tokens from the Graph Explorer).
              </p>
            </div>
          )}
        </div>
      )}

      {state.at && (
        <p className="text-[11px] text-gray-400">
          Last checked: {state.at.toLocaleTimeString('en-PH')}
        </p>
      )}
    </section>
  )
}
