import { Client } from 'ssh2';
import { query, queryOne } from '../db/query';
import { logger } from '../utils/logger';

/**
 * SSH service — manages SSH connections to user-provided AWS VMs.
 *
 * Why SSH instead of running containers locally?
 * The user owns the VM (AWS EC2). CloudForge connects to it via SSH
 * and runs commands on it. This means:
 * - User pays their own AWS bill (free tier = $0)
 * - CloudForge never touches user's production environment directly
 * - User can inspect, debug, or manage their VM independently
 * - Full isolation — each user's projects run on their own VM
 *
 * SSH key security:
 * The private key is provided by the user and stored in the database.
 * In production, encrypt it with AES-256 using a server-side key.
 * Never log the private key content.
 *
 * SSH connection flow:
 * 1. User creates EC2 instance → downloads .pem file
 * 2. User pastes .pem content into CloudForge settings
 * 3. CloudForge stores it, tests connection, marks status = 'connected'
 * 4. On deploy: SSH → run setup commands → start container → return URL
 */

export interface VMConnection {
  id: string;
  userId: string;
  host: string;
  port: number;
  username: string;
  status: 'pending' | 'connected' | 'failed';
  lastChecked: Date | null;
  createdAt: Date;
}

interface VMRow {
  id: string;
  user_id: string;
  host: string;
  port: number;
  username: string;
  private_key: string;
  status: 'pending' | 'connected' | 'failed';
  last_checked: Date | null;
  created_at: Date;
}

/**
 * Run a command on a remote VM via SSH.
 * Returns stdout as a string. Throws on non-zero exit.
 */
export async function runSSH(
  host: string,
  port: number,
  username: string,
  privateKey: string,
  command: string,
  onOutput?: (line: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let errorOutput = '';

    const timeout = setTimeout(() => {
      conn.destroy();
      reject(new Error('SSH connection timed out'));
    }, 30_000);

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            return reject(err);
          }

          stream
            .on('close', (code: number) => {
              clearTimeout(timeout);
              conn.end();
              if (code !== 0) {
                reject(new Error(`Command failed (exit ${code}): ${errorOutput.trim() || command}`));
              } else {
                resolve(output);
              }
            })
            .on('data', (data: Buffer) => {
              const text = data.toString();
              output += text;
              text.split('\n').filter(Boolean).forEach(line => onOutput?.(line));
            })
            .stderr.on('data', (data: Buffer) => {
              const text = data.toString();
              errorOutput += text;
              text.split('\n').filter(Boolean).forEach(line => onOutput?.(line));
            });
        });
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`SSH connection failed: ${err.message}`));
      })
      .connect({
        host,
        port,
        username,
        privateKey: privateKey.trim(),
        readyTimeout: 20_000,
        // Accept any host key (for dev; in prod use known_hosts)
        hostVerifier: () => true,
      });
  });
}

export const vmRepository = {
  async save(data: {
    userId: string;
    host: string;
    port: number;
    username: string;
    privateKey: string;
  }): Promise<void> {
    await query(
      `INSERT INTO vm_connections (user_id, host, port, username, private_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         host = EXCLUDED.host, port = EXCLUDED.port,
         username = EXCLUDED.username, private_key = EXCLUDED.private_key,
         status = 'pending', updated_at = NOW()`,
      [data.userId, data.host, data.port, data.username, data.privateKey]
    );
  },

  async get(userId: string): Promise<(VMConnection & { privateKey: string }) | null> {
    const row = await queryOne<VMRow>(
      'SELECT * FROM vm_connections WHERE user_id = $1', [userId]
    );
    if (!row) return null;
    return {
      id: row.id, userId: row.user_id, host: row.host, port: row.port,
      username: row.username, privateKey: row.private_key,
      status: row.status, lastChecked: row.last_checked, createdAt: row.created_at,
    };
  },

  async getPublic(userId: string): Promise<VMConnection | null> {
    const vm = await vmRepository.get(userId);
    if (!vm) return null;
    const { privateKey: _pk, ...pub } = vm;
    return pub as VMConnection;
  },

  async updateStatus(userId: string, status: 'pending' | 'connected' | 'failed'): Promise<void> {
    await query(
      `UPDATE vm_connections SET status = $2, last_checked = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId, status]
    );
  },

  async delete(userId: string): Promise<void> {
    await query('DELETE FROM vm_connections WHERE user_id = $1', [userId]);
  },
};

/**
 * Test SSH connection and mark status.
 */
export async function testVMConnection(userId: string): Promise<boolean> {
  const vm = await vmRepository.get(userId);
  if (!vm) return false;

  try {
    await runSSH(vm.host, vm.port, vm.username, vm.privateKey, 'echo "cloudforge-ok"');
    await vmRepository.updateStatus(userId, 'connected');
    logger.info('VM connection test passed', { userId, host: vm.host });
    return true;
  } catch (err) {
    await vmRepository.updateStatus(userId, 'failed');
    logger.warn('VM connection test failed', { userId, host: vm.host, error: (err as Error).message });
    return false;
  }
}

/**
 * Bootstrap a fresh EC2 instance — install Docker + Nginx.
 * Idempotent: safe to run multiple times.
 */
export async function bootstrapVM(
  userId: string,
  onLog: (msg: string) => void
): Promise<void> {
  const vm = await vmRepository.get(userId);
  if (!vm) throw new Error('No VM connected');

  const ssh = (cmd: string) => runSSH(vm.host, vm.port, vm.username, vm.privateKey, cmd, onLog);

  onLog('Checking Docker installation...');
  const dockerCheck = await ssh('docker --version 2>/dev/null || echo "not_installed"');

  if (dockerCheck.includes('not_installed')) {
    onLog('Installing Docker...');
    await ssh('curl -fsSL https://get.docker.com | sudo sh');
    await ssh(`sudo usermod -aG docker ${vm.username}`);
    onLog('Docker installed.');
  } else {
    onLog('Docker already installed.');
  }

  onLog('Checking Nginx installation...');
  const nginxCheck = await ssh('nginx -v 2>/dev/null || echo "not_installed"');
  if (nginxCheck.includes('not_installed')) {
    onLog('Installing Nginx...');
    await ssh('sudo apt-get update -qq && sudo apt-get install -y -qq nginx');
    await ssh('sudo systemctl enable nginx && sudo systemctl start nginx');
    onLog('Nginx installed.');
  } else {
    onLog('Nginx already installed.');
  }

  onLog('VM bootstrap complete.');
}
