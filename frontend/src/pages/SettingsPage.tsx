import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { vmService } from '../services/vmService';
import type { VMConnection } from '../services/vmService';

/**
 * Settings page — VM connection configuration.
 *
 * User flow:
 * 1. Create EC2 t2.micro on AWS Free Tier
 * 2. Download .pem key file
 * 3. Copy public IP from AWS console
 * 4. Paste here — CloudForge connects via SSH
 * 5. We install Docker + Nginx on their VM (once)
 * 6. Every project Deploy button now deploys to their VM
 */
export default function SettingsPage() {
  const [vm, setVm] = useState<VMConnection | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('ubuntu');
  const [privateKey, setPrivateKey] = useState('');

  useEffect(() => {
    vmService.getStatus()
      .then(v => {
        setVm(v);
        if (v) { setHost(v.host); setPort(String(v.port)); setUsername(v.username); }
      })
      .catch(() => {});
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      await vmService.connect({ host, port: parseInt(port), username, privateKey });
      const updated = await vmService.getStatus();
      setVm(updated);
      setSuccess('VM connection saved. Testing connection...');
      setPrivateKey(''); // Clear from UI after save
      // Run test
      const result = await vmService.test();
      setVm(result.vm);
      if (result.connected) setSuccess('✓ VM connected successfully! You can now deploy projects.');
      else setError('VM saved but connection test failed. Check your IP, username, and SSH key.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true); setError(''); setSuccess('');
    try {
      const result = await vmService.test();
      setVm(result.vm);
      if (result.connected) setSuccess('✓ Connection successful!');
      else setError('Connection failed. Check your VM is running and SSH key is correct.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    await vmService.disconnect();
    setVm(null); setHost(''); setPort('22'); setUsername('ubuntu'); setPrivateKey('');
    setSuccess('VM disconnected.');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <Link to="/dashboard" className="text-gray-500 hover:text-white text-sm transition-colors">
          ← Dashboard
        </Link>
        <span className="text-gray-700">·</span>
        <span className="font-semibold">Settings</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">VM Connection</h1>
          <p className="text-gray-400 text-sm">
            Connect your AWS EC2 instance to enable one-click deployments.
          </p>
        </div>

        {/* How it works */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <span>📋</span> How to set up AWS EC2 (Free Tier)
          </h2>
          <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
            <li>Go to <a href="https://aws.amazon.com/free" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">aws.amazon.com/free</a> → sign up (requires credit card, won't charge on free tier)</li>
            <li>Open <strong className="text-gray-300">EC2</strong> → <strong className="text-gray-300">Launch Instance</strong></li>
            <li>Choose <strong className="text-gray-300">Ubuntu Server 22.04 LTS</strong> (Free tier eligible)</li>
            <li>Instance type: <strong className="text-gray-300">t2.micro</strong> (free tier)</li>
            <li>Create a new key pair → download <code className="text-green-400">.pem</code> file</li>
            <li>Security group: allow <strong className="text-gray-300">SSH (22)</strong> and <strong className="text-gray-300">Custom TCP 4000-4999</strong> from anywhere</li>
            <li>Launch → copy the <strong className="text-gray-300">Public IPv4 address</strong></li>
            <li>Paste the IP, username (<code className="text-green-400">ubuntu</code>), and .pem contents below</li>
          </ol>
        </div>

        {/* Current status */}
        {vm && (
          <div className={`border rounded-xl p-4 flex items-center justify-between ${
            vm.status === 'connected' ? 'bg-green-950 border-green-800' :
            vm.status === 'failed' ? 'bg-red-950 border-red-800' :
            'bg-gray-900 border-gray-800'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${
                vm.status === 'connected' ? 'bg-green-400' :
                vm.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
              }`} />
              <div>
                <p className="font-medium text-sm">{vm.host}:{vm.port}</p>
                <p className="text-xs text-gray-400">
                  {vm.username} · {vm.status === 'connected' ? 'Connected' : vm.status === 'failed' ? 'Connection failed' : 'Pending test'}
                  {vm.lastChecked && ` · Last checked ${new Date(vm.lastChecked).toLocaleTimeString()}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleTest} disabled={testing}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50">
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              <button onClick={handleDisconnect}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300 transition-colors">
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* Connection form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">{vm ? 'Update VM Connection' : 'Connect AWS VM'}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-gray-400">Public IP Address</label>
                <input value={host} onChange={e => setHost(e.target.value)} required
                  placeholder="54.123.45.67"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">SSH Port</label>
                <input value={port} onChange={e => setPort(e.target.value)} type="number"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} required
                placeholder="ubuntu"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              <p className="text-xs text-gray-600">Ubuntu AMI = <code>ubuntu</code> · Amazon Linux = <code>ec2-user</code></p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">SSH Private Key (.pem contents)</label>
              <textarea
                value={privateKey}
                onChange={e => setPrivateKey(e.target.value)}
                required={!vm}
                placeholder={vm ? '(leave blank to keep existing key)' : '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----'}
                rows={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-green-400 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono resize-none"
              />
              <p className="text-xs text-gray-600">Open your .pem file in a text editor and paste the full contents here.</p>
            </div>

            {error && <p className="text-sm text-red-400 bg-red-950 border border-red-800 px-3 py-2 rounded-lg">{error}</p>}
            {success && <p className="text-sm text-green-400 bg-green-950 border border-green-800 px-3 py-2 rounded-lg">{success}</p>}

            <button type="submit" disabled={saving}
              className="w-full py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 20px rgba(79,70,229,0.3)' }}>
              {saving ? 'Connecting…' : vm ? 'Update Connection' : 'Connect VM'}
            </button>
          </form>
        </div>

        {/* What happens after connecting */}
        {vm?.status === 'connected' && (
          <div className="bg-gray-900 border border-green-800 rounded-xl p-5">
            <h3 className="font-semibold text-green-400 mb-2">✓ Ready to Deploy</h3>
            <p className="text-sm text-gray-400">
              Your VM is connected. Go to any project → click <strong className="text-white">🚀 Deploy</strong> in the dashboard.
              CloudForge will automatically install Docker on your VM and deploy your project to a live URL.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Your deployed apps will be accessible at: <code className="text-green-400">http://{vm.host}:PORT</code>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
