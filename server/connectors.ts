import net from 'net';
import https from 'https';
import http from 'http';
import type { ConnectorInfo } from '../src/types.js';

export interface ConnectorTestResult {
  success: boolean;
  message: string;
  providerResponse?: any;
  errorDetails?: string;
}

export async function testConnectorReal(connector: ConnectorInfo): Promise<ConnectorTestResult> {
  switch (connector.type) {
    case 'email_smtp': {
      const host = connector.configSummary.host;
      const port = parseInt(connector.configSummary.port || '587', 10);

      if (!host || host === 'No configurado' || host.includes('ejemplo') || host.includes('internal')) {
        return {
          success: false,
          message: 'Verificación fallida: Servidor SMTP no configurado.',
          errorDetails: 'Debe especificar un host SMTP real (ej. smtp.resend.com, smtp.sendgrid.net, etc.) y credenciales válidas.'
        };
      }

      return new Promise<ConnectorTestResult>((resolve) => {
        const socket = new net.Socket();
        let receivedGreeting = false;

        socket.setTimeout(5000);

        socket.connect(port, host, () => {
          // Connected TCP handshake succeeded, wait for SMTP 220 banner
        });

        socket.on('data', (data) => {
          const banner = data.toString();
          if (banner.startsWith('220')) {
            receivedGreeting = true;
            try {
              socket.write('QUIT\r\n');
              socket.end();
            } catch {
              // ignore
            }
            resolve({
              success: true,
              message: `Conexión TCP y protocolo SMTP verificados exitosamente con ${host}:${port}.`,
              providerResponse: { banner: banner.trim().substring(0, 100) }
            });
          }
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve({
            success: false,
            message: `Tiempo de espera agotado al conectar a ${host}:${port}. Verifique firewall y puerto.`,
            errorDetails: 'ETIMEDOUT: El servidor de correo no respondió en 5000ms.'
          });
        });

        socket.on('error', (err: any) => {
          socket.destroy();
          resolve({
            success: false,
            message: `Fallo de conexión al servidor SMTP ${host}:${port}: ${err.message}`,
            errorDetails: `${err.code || 'ERR_SOCKET'}: ${err.message}`
          });
        });
      });
    }

    case 'whatsapp_cloud': {
      const phoneNumberId = connector.configSummary.phoneNumberId;
      const token = process.env.WHATSAPP_ACCESS_TOKEN || connector.configSummary.token;

      if (!phoneNumberId || phoneNumberId === 'No configurado' || !token) {
        return {
          success: false,
          message: 'Verificación fallida: Falta Phone Number ID o Access Token de Meta Business.',
          errorDetails: 'Requiere System User Permanent Token y Phone Number ID verificados en developers.facebook.com.'
        };
      }

      try {
        const url = `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=verified_name,code_verification_status,quality_rating`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json();

        if (res.ok && data.id) {
          return {
            success: true,
            message: `Número de WhatsApp Business validado: ${data.verified_name || data.id} (Calidad: ${data.quality_rating || 'GREEN'}).`,
            providerResponse: data
          };
        } else {
          return {
            success: false,
            message: `Meta API rechazó la autenticación: ${data.error?.message || 'Error desconocido'}`,
            errorDetails: data.error ? JSON.stringify(data.error) : 'Respuesta HTTP no exitosa'
          };
        }
      } catch (err: any) {
        return {
          success: false,
          message: `Error de red al consultar Meta Graph API: ${err.message}`,
          errorDetails: String(err)
        };
      }
    }

    case 'telegram': {
      const token = process.env.TELEGRAM_BOT_TOKEN || connector.configSummary.botToken;

      if (!token || token === 'No configurado') {
        return {
          success: false,
          message: 'Verificación fallida: Token de Telegram Bot no configurado.',
          errorDetails: 'Debe obtener un bot token desde @BotFather.'
        };
      }

      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();

        if (data.ok && data.result) {
          return {
            success: true,
            message: `Bot de Telegram autenticado: @${data.result.username} (${data.result.first_name}).`,
            providerResponse: data.result
          };
        } else {
          return {
            success: false,
            message: `Telegram API rechazó el token: ${data.description || 'Token inválido'}`,
            errorDetails: JSON.stringify(data)
          };
        }
      } catch (err: any) {
        return {
          success: false,
          message: `Error de red al consultar Telegram API: ${err.message}`,
          errorDetails: String(err)
        };
      }
    }

    case 'webhook': {
      const urlStr = connector.configSummary.webhookUrl;
      if (!urlStr || urlStr === 'No configurado' || (!urlStr.startsWith('http://') && !urlStr.startsWith('https://'))) {
        return {
          success: false,
          message: 'Verificación fallida: URL de webhook no válida o no pública.',
          errorDetails: 'Debe ser una URL HTTPS accesible públicamente.'
        };
      }

      try {
        const res = await fetch(urlStr, { method: 'OPTIONS' }).catch(() => fetch(urlStr, { method: 'GET' }));
        return {
          success: res.ok || res.status === 404 || res.status === 405,
          message: `Endpoint de webhook respondió con código HTTP ${res.status}.`,
          providerResponse: { status: res.status }
        };
      } catch (err: any) {
        return {
          success: false,
          message: `No se pudo conectar al endpoint de webhook: ${err.message}`,
          errorDetails: String(err)
        };
      }
    }

    default:
      return {
        success: false,
        message: 'Tipo de conector desconocido.'
      };
  }
}
