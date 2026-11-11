import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.js';
import type { Application, MessageClassification } from '../src/types.js';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (aiClient) return aiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
  return aiClient;
}

export interface AiSuggestionResult {
  classification: MessageClassification;
  suggestedResponse: string;
  confidence: number;
  requiresHumanIntervention: boolean;
  interventionReason?: string;
  sourceFaqsUsed: string[];
}

export async function analyzeAndSuggestResponse(
  app: Application,
  contactName: string,
  incomingMessage: string,
  conversationHistory: { direction: string; content: string }[] = []
): Promise<AiSuggestionResult> {
  // Guardrail check: Funeraria or in-development apps
  if (app.status === 'en_desarrollo' || !app.campaignsAllowed) {
    return {
      classification: 'requiere_intervencion',
      suggestedResponse: `Hola ${contactName || 'estimado/a'}, gracias por contactarnos. El software se encuentra en etapa activa de desarrollo. Tu consulta ha sido derivada al equipo técnico para brindarte información cuando esté disponible.`,
      confidence: 1.0,
      requiresHumanIntervention: true,
      interventionReason: `La aplicación ${app.name} está en desarrollo y requiere atención manual del administrador.`,
      sourceFaqsUsed: []
    };
  }

  // Build the strict knowledge base from verified app details only
  const knowledgeBase = `
--- FICHA COMERCIAL OFICIAL DE ${app.name.toUpperCase()} ---
Descripción: ${app.description}
Sitio Web Oficial: ${app.website}
Público Objetivo: ${app.targetAudience}
Funciones Verificadas en Producción:
${app.verifiedFeatures.map(f => `- ${f}`).join('\n')}

Período de Prueba: ${app.trialAvailable ? `Disponible (${app.trialDurationDays} días de prueba)` : 'No disponible'}
Planes y Precios Oficiales (NO OFRECER OTROS PRECIOS NI DESCUENTOS):
${app.plans.length > 0 ? app.plans.map(p => `- Plan ${p.name}: ${p.currency} ${p.price} / ${p.interval}. Características: ${p.features.join(', ')}`).join('\n') : 'Precios no configurados aún. Derivar a cotización personalizada.'}

Enlace de Registro: ${app.registerUrl}
${app.medicalDisclaimer ? `AVISO LEGAL OBLIGATORIO: ${app.medicalDisclaimer}` : ''}

Preguntas Frecuentes y Respuestas Comerciales Aprobadas:
${app.faqs.filter(f => f.approved).map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n\n')}
`;

  const ai = getAiClient();
  if (!ai) {
    // Graceful rule-based fallback if no Gemini API key is configured
    const lower = incomingMessage.toLowerCase();
    let classification: MessageClassification = 'solicita_informacion';
    let requiresIntervention = false;
    let interventionReason: string | undefined;

    if (lower.includes('baja') || lower.includes('cancelar') || lower.includes('no me interesa') || lower.includes('remover')) {
      classification = 'solicita_baja';
    } else if (lower.includes('pago') || lower.includes('pagué') || lower.includes('transferí') || lower.includes('comprobante')) {
      classification = 'informa_pago';
      requiresIntervention = true;
      interventionReason = 'El prospecto informa un pago. Por política de seguridad, la verificación de pagos es estrictamente manual.';
    } else if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuanto') || lower.includes('cuánto') || lower.includes('valor')) {
      classification = 'consulta_precio';
    } else if (lower.includes('demo') || lower.includes('prueba') || lower.includes('probar')) {
      classification = 'solicita_demostracion';
    }

    const firstFaq = app.faqs.find(f => f.approved);
    const suggested = `Hola ${contactName || ''},\n\nGracias por tu mensaje sobre ${app.name}. ${firstFaq ? firstFaq.answer : `Podés conocer todos los detalles en nuestro sitio oficial: ${app.website}`}\n\n¿Te gustaría que coordinemos una llamada de demostración de 10 minutos?`;

    return {
      classification,
      suggestedResponse: suggested,
      confidence: 0.7,
      requiresHumanIntervention: requiresIntervention,
      interventionReason,
      sourceFaqsUsed: firstFaq ? [firstFaq.question] : []
    };
  }

  const systemInstruction = `
Sos el Asistente Comercial Estricto de la plataforma "Central Comercial" para la aplicación "${app.name}".
Tu única misión es analizar el mensaje del prospecto y preparar un borrador de respuesta profesional, sobrio y directo.

REGLAS DE ORO INFRANQUEABLES:
1. INFORMACIÓN APROBADA EXCLUSIVA: Respondé ÚNICAMENTE utilizando los datos de la ficha comercial y las FAQ aprobadas que se te proveen a continuación. Si el usuario pregunta algo que no está en la ficha oficial, NO inventes funciones, características, descuentos ni promesas técnicas. Marcá "requiresHumanIntervention: true" con el motivo.
2. PAGOS: NUNCA afirmes que un pago fue recibido o acreditado. En esta fase la confirmación de pagos es 100% manual por auditoría humana. Si el prospecto informa un pago o adjunta un comprobante, clasificá como "informa_pago", activá "requiresHumanIntervention: true" y agradecé informando que el equipo administrativo revisará el comprobante manualmente.
3. PRECIOS Y DESCUENTOS: Ofrecé únicamente los planes y precios explícitamente listados. Prohibido inventar promociones, descuentos no configurados o cuotas personalizadas.
4. SALUD / NEUROPLANETA: Si la app es NeuroPlaneta, NUNCA la describas como herramienta médica, clínica, de diagnóstico ni de tratamiento de TDAH/TEA o trastornos. Es pura y exclusivamente estimulación lúdica acompañada con adultos.
5. CLASIFICACIÓN DE INTENCIÓN: Clasificá con precisión en una de estas categorías:
   - "interesado": Muestra interés general positivo.
   - "solicita_informacion": Pregunta sobre características o funcionamiento.
   - "solicita_demostracion": Pide ver la app, tour o agendar demo.
   - "consulta_precio": Pregunta por tarifas, planes o costos.
   - "quiere_suscribirse": Desea contratar o activar un plan.
   - "informa_pago": Menciona haber transferido, pagado o enviado comprobante.
   - "no_interesado": Rechaza la propuesta cordialmente.
   - "solicita_baja": Pide no ser contactado más o desuscribirse.
   - "requiere_intervencion": Caso complejo, duda fuera de catálogo, queja o solicitud especial.

KNOWLEDGE BASE AUTORIZADA:
${knowledgeBase}
`;

  try {
    const prompt = `
Historial reciente de la conversación:
${conversationHistory.map(m => `${m.direction === 'inbound' ? 'Prospecto' : 'Comercial'}: ${m.content}`).join('\n')}

Último mensaje recibido del prospecto (${contactName}):
"${incomingMessage}"

Analizá el mensaje y devolvé tu clasificación y borrador de respuesta siguiendo estrictamente el esquema JSON requerido.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            classification: {
              type: Type.STRING,
              description: 'Clasificación de intención comercial'
            },
            suggestedResponse: {
              type: Type.STRING,
              description: 'Borrador de respuesta comercial sugerida para que el administrador la revise antes de enviar'
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Nivel de confianza de 0 a 1'
            },
            requiresHumanIntervention: {
              type: Type.BOOLEAN,
              description: 'Verdadero si requiere revisión o intervención manual obligatoria'
            },
            interventionReason: {
              type: Type.STRING,
              description: 'Motivo por el que se requiere intervención humana, si aplica'
            },
            sourceFaqsUsed: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Preguntas aprobadas de las que se extrajo la respuesta'
            }
          },
          required: ['classification', 'suggestedResponse', 'requiresHumanIntervention', 'sourceFaqsUsed']
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    const validClassifications: MessageClassification[] = [
      'interesado',
      'solicita_informacion',
      'solicita_demostracion',
      'consulta_precio',
      'quiere_suscribirse',
      'informa_pago',
      'no_interesado',
      'solicita_baja',
      'requiere_intervencion'
    ];

    const classification = validClassifications.includes(parsed.classification)
      ? (parsed.classification as MessageClassification)
      : 'solicita_informacion';

    // If classification informs payment, force human intervention!
    const requiresHuman = classification === 'informa_pago' || Boolean(parsed.requiresHumanIntervention);

    return {
      classification,
      suggestedResponse: parsed.suggestedResponse || 'Gracias por tu contacto. Hemos derivado tu consulta al equipo comercial.',
      confidence: parsed.confidence || 0.9,
      requiresHumanIntervention: requiresHuman,
      interventionReason: classification === 'informa_pago'
        ? 'El prospecto informa un pago. Requiere revisión manual y comprobante.'
        : parsed.interventionReason,
      sourceFaqsUsed: parsed.sourceFaqsUsed || []
    };
  } catch (err: any) {
    db.addLog('warning', 'ia', `Aviso temporal en Gemini API (${err.message}). Utilizando correspondencia directa con catálogo de FAQ aprobadas.`, { error: String(err) });
    
    // Check if an approved FAQ matches keywords in the incoming message
    const lower = incomingMessage.toLowerCase();
    const matchedFaq = app.faqs.find(f => {
      if (!f.approved) return false;
      const qWords = f.question.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      return qWords.some(w => lower.includes(w));
    });

    let classification: MessageClassification = 'solicita_informacion';
    let requiresHuman = false;
    let reason: string | undefined;

    if (lower.includes('baja') || lower.includes('cancelar') || lower.includes('no me interesa')) {
      classification = 'solicita_baja';
    } else if (lower.includes('pago') || lower.includes('pagué') || lower.includes('transferí') || lower.includes('comprobante')) {
      classification = 'informa_pago';
      requiresHuman = true;
      reason = 'El prospecto informa un pago. Por política de seguridad, la verificación de pagos es estrictamente manual.';
    } else if (lower.includes('precio') || lower.includes('costo') || lower.includes('cuanto') || lower.includes('cuánto') || lower.includes('valor')) {
      classification = 'consulta_precio';
    } else if (lower.includes('demo') || lower.includes('prueba') || lower.includes('probar')) {
      classification = 'solicita_demostracion';
    }

    if (matchedFaq) {
      return {
        classification,
        suggestedResponse: `Hola ${contactName || 'estimado/a'},\n\nGracias por contactarnos sobre ${app.name}.\n\n${matchedFaq.answer}\n\nPodés consultar más información en nuestro sitio oficial: ${app.website}\n\n¿Te gustaría que coordinemos una demostración de 10 minutos para ver la plataforma en acción?`,
        confidence: 0.85,
        requiresHumanIntervention: requiresHuman,
        interventionReason: reason,
        sourceFaqsUsed: [matchedFaq.question]
      };
    }

    return {
      classification: requiresHuman ? classification : 'solicita_informacion',
      suggestedResponse: `Hola ${contactName || 'estimado/a'},\n\nGracias por comunicarte con ${app.name}.\n\nHemos recibido tu consulta y un asesor comercial revisará los detalles para responderte a la brevedad.\n\nSitio oficial: ${app.website}`,
      confidence: 0.6,
      requiresHumanIntervention: true,
      interventionReason: reason || 'Consulta no encontrada en el catálogo de FAQ aprobadas. Requiere atención de un asesor.',
      sourceFaqsUsed: []
    };
  }
}
