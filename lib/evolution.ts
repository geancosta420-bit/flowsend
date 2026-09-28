const BASE_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8081';
const API_KEY = process.env.EVOLUTION_API_KEY || '';

export async function createInstance(instanceName: string) {
  const response = await fetch(`${BASE_URL}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
    },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });
  return response.json();
}

export async function sendTextMessage(instanceName: string, number: string, text: string) {
  const response = await fetch(`${BASE_URL}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
    },
    body: JSON.stringify({
      number,
      text,
    }),
  });
  return response.json();
}