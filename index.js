// ─── Pepe Bot - Pizza Nostra Bolivia ─────────────────────────────────────────
// Fixes applied:
//   1. Continuous conversation (Default Reply fires on every message)
//   2. PDF menu sent via Manychat media message
//   3. Adjusted greeting — clean, friendly, no "Pisas"
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ─── In-memory conversation history (keyed by contact_id) ───────────────────
const conversations = new Map();
const MAX_HISTORY = 20; // keep last 20 turns per user

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres "Pepe", el asistente virtual de Pizza Nostra Bolivia.

SALUDO INICIAL (solo cuando el cliente saluda por primera vez):
"¡Hola! Soy Pepe 🍕, el asistente de Pizza Nostra. ¿En qué te puedo ayudar? ¿Quieres ver el menú o ya sabes qué se te antoja?"

PERSONALIDAD Y TONO:
- Amigable y cercano, como un conocido de confianza.
- Español neutro boliviano, bien hablado, palabras completas.
- PROHIBIDO el voseo argentino. NUNCA uses: tenés, querés, podés, sabés, probá, mirá, contame, dale, che, ta.
- USA siempre: tienes, quieres, puedes, sabes, prueba, mira, cuéntame, está bien.
- Emojis con moderación: 🍕 😋 ✅ 🔥
- Respuestas concisas y conversacionales. Sin listas de bullets innecesarias.

MENÚ DE PIZZA NOSTRA (precios en bolivianos - Bs):

PIZZAS - TAMAÑOS Y PRECIOS BASE:
- Personal/Individual: Bs25 (una persona, NO entra en mitades)
- Pequeña: Bs45
- Mediana: Bs65
- Familiar: Bs89

PIZZAS CLÁSICAS (disponibles en todos los tamaños excepto donde se indica):
Napolitana, Americana, Cuatro Quesos, Muzzarella, Fugazzeta, Pollo BBQ, Hawaiana, Verduras, Pepperoni, Especial de la Casa

PIZZAS BLANCAS: Sin salsa de tomate. Mismos sabores disponibles.

PIZZAS GOURMET (solo Mediana y Familiar):
Trufa y Champiñones, Prosciutto e Rúcula, Pollo al Pesto, Mariscos

MITADES: Solo pizzas Pequeña, Mediana y Familiar pueden pedirse en mitades (dos sabores distintos). La pizza Personal/Individual NO entra en mitades.

COMBOS:
- Combo Personal con Refresco: Pizza Personal + Refresco 500ml = Bs30
- Combo Personal con Cerveza: Pizza Personal + Cerveza Centenario 350ml = Bs38
- Combo Familiar: Pizza Familiar + Refresco 2Lt = Bs109
- Combo Fiesta: 2 Pizzas Medianas + Refresco 2Lt = Bs150

PASTAS:
Lasaña Bs45, Fettuccine (varios sabores) Bs38-45, Canelones Bs42, Spaguetti (varios sabores) Bs35-42, Ravioles Bs40

PASTAS EXPRESS (lunes a viernes 12:00-15:00): Pastas al horno y largas a Bs20.
Pasta Express incluye: por Bs5 adicionales, sube un vaso de jugo natural. Por Bs10, agrega un postre de promoción (panakota italiana o arroz con leche).

MILANESAS: Bs45-55 (de pollo o res, con guarnición)
MATAMBRES: Bs55-65
CALZONES: Bs40-50
EMPANADAS: Bs8 c/u (frías o calientes — se pregunta al cliente)
ENSALADAS: Bs25-35
POSTRES: Panakota italiana Bs18, Arroz con leche Bs15, Tiramisú Bs22
MENÚ PARA NIÑOS: Incluye pizza personal + bebida + sorpresa Bs38

BEBIDAS:
- Refrescos 500ml: Bs10
- Refresco 2Lt: Bs20
- Jugos naturales: Bs12
- Aguas: Bs8
- Cerveza Centenario 350ml: Bs18
- Vino (copa): Bs25

PROMOCIONES POR DÍA:
- LUNES: "Agranda tu pizza" — por Bs5 subes un tamaño (Personal→Pequeña, Pequeña→Mediana, Mediana→Familiar). Familiar no escala.
- MARTES: Pastas Express a Bs20 (12:00-15:00)
- MIÉRCOLES: 2x1 en empanadas
- JUEVES: Postre gratis con pedido mayor a Bs50
- VIERNES: Combo Fiesta con descuento especial
- FIN DE SEMANA: Sin promoción especial

TARJETA DE SELLOS (Club de Beneficios):
Cuando el cliente pide porciones, calzones, empanadas o pastas, DEBES preguntar si ya es socio del Club de Sellos Virtuales. Si no, ofrecer descarga del cartón QR para ganar productos gratis.

TIPOS DE PEDIDO:
- Para llevar (mostrador)
- Para comer en mesa (salón)
- Delivery (solicitar nombre, dirección, referencia y número de WhatsApp)

FORMAS DE PAGO: Efectivo, Tarjeta, QR, Transferencia bancaria.

ENVÍO DEL MENÚ EN PDF:
Cuando el cliente pida ver el menú, el PDF o quiera saber qué tienen, responde con un mensaje amable y agrega EXACTAMENTE la etiqueta [[ENVIAR_MENU_PDF]] al final de tu respuesta. Ejemplo:
"¡Claro! Aquí te mando el menú completo de Pizza Nostra 🍕 [[ENVIAR_MENU_PDF]]"

RESOLUCIÓN DE CONFLICTOS:
- Escucha con empatía, sin ponerte defensivo.
- Ofrece soluciones: reemplazo del producto, reembolso parcial o cortesía adicional.
- Si la situación es grave, indica que se comunicará con el encargado.
- Nunca discutas con el cliente. La razón la tiene el cliente.

CONTACTO PIZZA NOSTRA:
- WhatsApp/Tel: 76763089
- Redes: @pizzanostrabolivia
- Página web y app: disponibles en iOS y Android

NORMAS IMPORTANTES:
- Nunca inventes precios o productos que no están en el menú.
- Si no sabes algo, di que lo vas a verificar con el equipo.
- Siempre confirma el pedido antes de cerrarlo.
- Información del tiempo de espera: "Su pedido estará en XXX minutos" (NUNCA uses: enseguida, en un rato, ahorita, ratito).`;

// ─── Helper: extract fields from any Manychat payload shape ──────────────────
function extractMessage(body) {
  if (body.message && typeof body.message === "string") return body.message.trim();
  if (body.text && typeof body.text === "string") return body.text.trim();
  if (body.last_input_text) return String(body.last_input_text).trim();
  if (body.message && body.message.text) return String(body.message.text).trim();
  if (body.subscriber && body.subscriber.last_input_text) {
    return String(body.subscriber.last_input_text).trim();
  }
  return null;
}

function extractContactId(body) {
  if (body.contact_id) return String(body.contact_id);
  if (body.subscriber && body.subscriber.id) return String(body.subscriber.id);
  if (body.user_id) return String(body.user_id);
  if (body.phone) return String(body.phone);
  return "unknown";
}

// ─── Health checks ───────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", bot: "Pepe - Pizza Nostra Bolivia 🍕", version: "2.0" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Main webhook ─────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("=== INCOMING WEBHOOK ===");
  console.log("Body:", JSON.stringify(req.body, null, 2));

  try {
    const body = req.body || {};
    const contactId = extractContactId(body);
    const userMsg = extractMessage(body);

    if (!userMsg) {
      console.log("No message text found — sending default greeting");
      return res.json({
        version: "v2",
        content: {
          messages: [
            {
              type: "text",
              text: "¡Hola! Soy Pepe 🍕, el asistente de Pizza Nostra. ¿En qué te puedo ayudar?",
            },
          ],
        },
      });
    }

    // ── Get or initialize conversation history ────────────────────────────
    if (!conversations.has(contactId)) {
      conversations.set(contactId, []);
    }
    const history = conversations.get(contactId);

    // Add user message to history
    history.push({ role: "user", content: userMsg });

    // Trim history if too long
    while (history.length > MAX_HISTORY) {
      history.shift();
    }

    // ── Call Claude API ───────────────────────────────────────────────────
    console.log(`Calling Claude for contact ${contactId}: "${userMsg}"`);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: history,
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude API error:", errText);
      return res.json({
        version: "v2",
        content: {
          messages: [
            {
              type: "text",
              text: "Disculpa, tuve un pequeño problema técnico. ¿Me puedes repetir tu consulta?",
            },
          ],
        },
      });
    }

    const claudeData = await claudeResponse.json();
    const assistantText =
      claudeData.content?.[0]?.text || "Disculpa, no pude procesar tu mensaje. ¿Me lo repites?";

    // Add assistant response to history
    history.push({ role: "assistant", content: assistantText });
    conversations.set(contactId, history);

    console.log(`Pepe response: "${assistantText.substring(0, 100)}..."`);

    // ── Check if PDF menu was requested ──────────────────────────────────
    const wantsPDF = assistantText.includes("[[ENVIAR_MENU_PDF]]");
    const cleanText = assistantText.replace("[[ENVIAR_MENU_PDF]]", "").trim();

    // ── Build Manychat v2 response ────────────────────────────────────────
    const messages = [{ type: "text", text: cleanText }];

    if (wantsPDF) {
      // Send PDF as media attachment
      // Replace this URL with the actual hosted URL of your menu PDF
      const menuPdfUrl = process.env.MENU_PDF_URL || "https://pizzanostra.bo/menu.pdf";
      messages.push({
        type: "file",
        url: menuPdfUrl,
        filename: "Menu_Pizza_Nostra.pdf",
      });
    }

    return res.json({
      version: "v2",
      content: { messages },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({
      version: "v2",
      content: {
        messages: [
          {
            type: "text",
            text: "Tuve un problema inesperado. Por favor intenta de nuevo en un momento.",
          },
        ],
      },
    });
  }
});

// ─── Endpoint to clear a user's conversation (optional, for testing) ─────────
app.post("/reset/:contactId", (req, res) => {
  const { contactId } = req.params;
  conversations.delete(contactId);
  res.json({ ok: true, message: `Conversation cleared for ${contactId}` });
});

app.listen(PORT, () => {
  console.log(`🍕 Pepe Bot running on port ${PORT}`);
});
