const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const conversations = {};
const lastActivity  = {};
const TTL_MS = 2 * 60 * 60 * 1000;

function getHistory(contactId) {
  const now = Date.now();
  if (lastActivity[contactId] && now - lastActivity[contactId] > TTL_MS) {
    delete conversations[contactId];
  }
  lastActivity[contactId] = now;
  if (!conversations[contactId]) conversations[contactId] = [];
  return conversations[contactId];
}

// ─── Extract message from ANY ManyChat payload format ─────────────────────────
function extractMessage(body) {
  // Full Contact Data format (what ManyChat sends with "Encode to JSON")
  // ManyChat sends the full subscriber object directly as the body
  if (body.last_input_text) return String(body.last_input_text).trim();
  
  // Also try nested formats
  if (body.subscriber && body.subscriber.last_input_text)
    return String(body.subscriber.last_input_text).trim();
  
  // Simple message field
  if (body.message && typeof body.message === "string") return body.message.trim();
  if (body.text   && typeof body.text   === "string") return body.text.trim();
  
  // ManyChat nested message object
  if (body.message && body.message.text) return String(body.message.text).trim();

  return null;
}

function extractContactId(body) {
  // Full Contact Data has id at top level
  if (body.id) return String(body.id);
  if (body.contact_id) return String(body.contact_id);
  if (body.subscriber && body.subscriber.id) return String(body.subscriber.id);
  if (body.user_id) return String(body.user_id);
  if (body.phone) return String(body.phone);
  return "unknown_" + Date.now();
}

const SYSTEM_PROMPT = `Eres Pepe, el asistente virtual oficial de Pizza Nostra Bolivia. 
Atiendes consultas de clientes por WhatsApp con amabilidad, eficiencia y siguiendo 
estrictamente los protocolos de la cadena.

Tu personalidad:
- Cálido, amable y profesional
- Nunca usas palabras como "enseguida", "ratito", "ahorita" ni similares
- Dices el tiempo de espera en minutos exactos: "Su pedido estará en XXX minutos"
- Usas "para llevar" o "para comer aquí", nunca palabras ambiguas
- Siempre ofreces tarjeta de sellos virtuales cuando corresponde

MENÚ PRINCIPAL (precios en Bs):
PIZZAS: Personal (15cm), Mediana, Grande, Jumbo
Clásicas: Margarita, Napolitana, Pollo BBQ, Americana, Pepperoni, Hawaiana, 4 Quesos
Gourmet y Combos disponibles

PASTAS: Lasagna, Fettuccine, Canelones, Spaghetti, Ravioles
MILANESAS y MATAMBRES
CALZONES y EMPANADAS
POSTRES: Panakota italiana, Arroz con leche
ENSALADAS | MENÚ PARA NIÑOS | BEBIDAS

PROTOCOLOS CLAVE:
1. Saludo: "¡Hola! Soy Pepe, el asistente virtual de Pizza Nostra. ¿En qué puedo ayudarte?"
2. Siempre pregunta si el pedido es para llevar o para comer en el local
3. Horario pasta express (L-V 12:00-15:00): ofrece jugo natural Bs5 y postre Bs10
4. Siempre ofrece Tarjeta de Sellos Virtual al comprar porciones, empanadas, calzones o pastas
5. Para delivery: solicita nombre, dirección, WhatsApp y forma de pago
6. Formas de pago: Efectivo, Tarjeta, QR, Transferencia

RESOLUCIÓN DE CONFLICTOS:
- Escucha con empatía, sin ponerte defensivo
- Ofrece: reemplazo del producto, reembolso parcial, cortesía adicional
- Si la situación es grave, indica que se comunicará con el encargado

Contacto: WhatsApp/Tel 76763089 | @pizzanostrabolivia
Responde siempre de forma concisa y conversacional.`;

app.get("/", (req, res) => {
  res.json({ status: "ok", bot: "Pepe - Pizza Nostra Bolivia" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/webhook", async (req, res) => {
  console.log("=== WEBHOOK ===");
  console.log("Body:", JSON.stringify(req.body, null, 2));

  try {
    const body      = req.body || {};
    const contactId = extractContactId(body);
    const userMsg   = extractMessage(body);

    console.log(`Contact: ${contactId} | Message: "${userMsg}"`);

    if (!userMsg) {
      return res.json({
        version: "v2",
        content: { messages: [{ type: "text", text: "¡Hola! Soy Pepe, el asistente de Pizza Nostra. ¿En qué puedo ayudarte? 🍕" }] }
      });
    }

    const history = getHistory(contactId);
    history.push({ role: "user", content: userMsg });
    const recentHistory = history.slice(-20);

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: recentHistory,
    });

    const replyText = response.content[0]?.text || "Disculpa, ocurrió un error. Intenta de nuevo.";
    history.push({ role: "assistant", content: replyText });

    console.log(`Pepe: ${replyText}`);

    return res.json({
      version: "v2",
      content: { messages: [{ type: "text", text: replyText }] }
    });

  } catch (err) {
    console.error("ERROR:", err.message);
    return res.status(200).json({
      version: "v2",
      content: { messages: [{ type: "text", text: "Disculpa, tuve un problema técnico. Escríbeme en un momento. 🙏" }] }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🍕 Pepe Bot en puerto ${PORT}`));
