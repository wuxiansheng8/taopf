import crypto from 'crypto';
import { getSetting, setSetting } from '../services/settingsService.js';

function base64urlEncode(str: string | Buffer): string {
  const buf = typeof str === 'string' ? Buffer.from(str, 'utf-8') : str;
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export async function createToken(username: string): Promise<string> {
  const jwtSecret = await getSetting('jwt_secret');
  if (!jwtSecret) {
    const randomSecret = crypto.randomBytes(32).toString('hex');
    await setSetting('jwt_secret', randomSecret);
  }
  
  const secret = await getSetting('jwt_secret', 'taopf-secret-key-default');
  
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: username,
    exp: Math.floor(Date.now() / 1000) + 86400 * 7 // 7 days expiration
  };
  
  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(payload));
  
  const data = `${headerEncoded}.${payloadEncoded}`;
  const signature = crypto.createHmac('sha256', secret)
    .update(data)
    .digest();
    
  const signatureEncoded = base64urlEncode(signature);
  return `${data}.${signatureEncoded}`;
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    const secret = await getSetting('jwt_secret', 'taopf-secret-key-default');
    
    const data = `${headerEncoded}.${payloadEncoded}`;
    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(data)
      .digest();
      
    const expectedSignatureEncoded = base64urlEncode(expectedSignature);
    
    if (signatureEncoded !== expectedSignatureEncoded) return null;
    
    const payload = JSON.parse(base64urlDecode(payloadEncoded));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    
    return payload.sub;
  } catch (err) {
    return null;
  }
}
