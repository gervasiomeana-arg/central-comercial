import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction } from 'express';
import type { AdminUser } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin_account.json');
const SETUP_TOKEN_FILE = path.join(DATA_DIR, '.admin_setup_token');

export interface StoredAdmin {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  lastLoginAt?: string;
  usedRecoveryKeyHash?: string;
}

export interface SessionRecord {
  token: string;
  adminId: string;
  email: string;
  name: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory active sessions store
const activeSessions = new Map<string, SessionRecord>();
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class AuthManager {
  private admin: StoredAdmin | null = null;
  private setupToken: string;

  constructor() {
    this.ensureDirectory();
    this.setupToken = this.initializeSetupToken();
    this.admin = this.loadAdmin();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private initializeSetupToken(): string {
    if (process.env.ADMIN_SETUP_KEY && process.env.ADMIN_SETUP_KEY.trim().length >= 8) {
      return process.env.ADMIN_SETUP_KEY.trim();
    }

    try {
      if (fs.existsSync(SETUP_TOKEN_FILE)) {
        const existing = fs.readFileSync(SETUP_TOKEN_FILE, 'utf-8').trim();
        if (existing.length >= 16) return existing;
      }
    } catch {
      // ignore
    }

    const generated = crypto.randomBytes(24).toString('hex');
    try {
      fs.writeFileSync(SETUP_TOKEN_FILE, generated, { mode: 0o600 });
      console.log('============================================================');
      console.log(' [SEGURIDAD] TOKEN MAESTRO DE CONFIGURACIÓN ADMINISTRATIVA:');
      console.log(` ${generated}`);
      console.log(' Utilice este token para dar de alta al administrador inicial.');
      console.log('============================================================');
    } catch (err) {
      console.error('No se pudo guardar el token de configuración:', err);
    }
    return generated;
  }

  private loadAdmin(): StoredAdmin | null {
    try {
      if (fs.existsSync(ADMIN_FILE)) {
        const raw = fs.readFileSync(ADMIN_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error al leer cuenta administrativa:', err);
    }
    return null;
  }

  private saveAdmin(admin: StoredAdmin) {
    this.admin = admin;
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2), { mode: 0o600 });
  }

  public isConfigured(): boolean {
    return this.admin !== null;
  }

  public getAdminPublic(): { id: string; email: string; name: string } | undefined {
    if (!this.admin) return undefined;
    return {
      id: this.admin.id,
      email: this.admin.email,
      name: this.admin.name
    };
  }

  public getSetupTokenHint(): string {
    // Only return first and last 3 characters as hint, never expose full key publicly
    return `${this.setupToken.substring(0, 4)}...${this.setupToken.substring(this.setupToken.length - 4)}`;
  }

  public setupFirstAdmin(email: string, password: string, name: string, setupKey: string): { sessionToken: string; admin: AdminUser } {
    if (this.isConfigured()) {
      throw new Error('El administrador ya se encuentra configurado. Esta acción está bloqueada.');
    }

    if (!setupKey || setupKey.trim() !== this.setupToken) {
      throw new Error('Clave maestra de configuración (setup key) inválida o ausente. Verifique la clave en el servidor.');
    }

    if (!email || !email.includes('@')) {
      throw new Error('Debe proporcionar un correo electrónico válido.');
    }

    if (!password || password.length < 8) {
      throw new Error('La contraseña debe contener al menos 8 caracteres seguros.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');

    const newAdmin: StoredAdmin = {
      id: `admin-${Date.now()}`,
      email: email.trim().toLowerCase(),
      name: name?.trim() || 'Administrador Central',
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: new Date().toISOString()
    };

    this.saveAdmin(newAdmin);

    // Create initial session
    const sessionToken = this.createSession(newAdmin);

    return {
      sessionToken,
      admin: {
        id: newAdmin.id,
        email: newAdmin.email,
        name: newAdmin.name,
        role: 'admin',
        createdAt: newAdmin.createdAt
      }
    };
  }

  // Recovery is disabled until the owner configures a NEW private server secret.
  // Never accept ADMIN_SETUP_KEY or a key shipped in the repository.
  public recoverPassword(email: string, password: string, recoveryKey: string): void {
    const expected = process.env.ADMIN_RECOVERY_KEY?.trim();
    const rejected = () => new Error('Recuperación no disponible o datos inválidos. Verifique la clave privada y el correo.');
    if (!this.admin || !expected || expected.length < 32 ||
        typeof recoveryKey !== 'string' || recoveryKey.length > 512 ||
        typeof email !== 'string' || email.trim().toLowerCase() !== this.admin.email) {
      throw rejected();
    }
    const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
    const keyHash = digest(expected).toString('hex');
    if (this.admin.usedRecoveryKeyHash === keyHash ||
        !crypto.timingSafeEqual(digest(recoveryKey.trim()), digest(expected))) {
      throw rejected();
    }
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new Error('La nueva contraseña debe tener entre 12 y 128 caracteres.');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    this.saveAdmin({ ...this.admin, passwordSalt: salt, passwordHash: hash,
      usedRecoveryKeyHash: keyHash });
    activeSessions.clear();
  }

  public login(email: string, password: string): { sessionToken: string; admin: AdminUser } {
    if (!this.admin) {
      throw new Error('No hay administrador configurado. Debe realizar la configuración inicial.');
    }

    if (!email || !password) {
      throw new Error('Email y contraseña son obligatorios.');
    }

    if (email.trim().toLowerCase() !== this.admin.email.toLowerCase()) {
      throw new Error('Credenciales inválidas.');
    }

    const computedHash = crypto.scryptSync(password, this.admin.passwordSalt, 64).toString('hex');
    const match = crypto.timingSafeEqual(
      Buffer.from(computedHash, 'utf-8'),
      Buffer.from(this.admin.passwordHash, 'utf-8')
    );

    if (!match) {
      throw new Error('Credenciales inválidas.');
    }

    this.admin.lastLoginAt = new Date().toISOString();
    this.saveAdmin(this.admin);

    const sessionToken = this.createSession(this.admin);

    return {
      sessionToken,
      admin: {
        id: this.admin.id,
        email: this.admin.email,
        name: this.admin.name,
        role: 'admin',
        createdAt: this.admin.createdAt,
        lastLoginAt: this.admin.lastLoginAt
      }
    };
  }

  private createSession(admin: StoredAdmin): string {
    const token = crypto.randomBytes(48).toString('hex');
    const record: SessionRecord = {
      token,
      adminId: admin.id,
      email: admin.email,
      name: admin.name,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION_MS
    };
    activeSessions.set(token, record);
    return token;
  }

  public validateSession(token: string | undefined): SessionRecord | null {
    if (!token) return null;
    const session = activeSessions.get(token);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      activeSessions.delete(token);
      return null;
    }

    return session;
  }

  public logout(token: string | undefined) {
    if (token) {
      activeSessions.delete(token);
    }
  }
}

export const authManager = new AuthManager();

// Express Middleware for backend protection
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']).trim();
  }

  const session = authManager.validateSession(token);
  if (!session) {
    return res.status(401).json({
      error: 'Acceso no autorizado. Se requiere autenticación de administrador.',
      code: 'UNAUTHORIZED'
    });
  }

  // Attach authenticated admin to request
  (req as any).admin = {
    id: session.adminId,
    email: session.email,
    name: session.name
  };

  next();
}
