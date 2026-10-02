import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const inputSchema = z.object({
  objective: z.string().trim().min(2).max(120),
  tone: z.string().trim().min(2).max(80),
  product: z.string().trim().min(3).max(800),
});

type GeneratedOption = { title: string; text: string };

export async function POST(request: NextRequest) {
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "Confira os dados informados." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "O gerador de IA ainda não está configurado. Adicione OPENAI_API_KEY ao ambiente do servidor." }, { status: 503 });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: "Você é um redator de mensagens comerciais claras, humanas e honestas em português brasileiro. Crie conteúdo para comunicação individual com pessoas que consentiram em receber mensagens. Não crie alegações não verificadas, urgência falsa ou promessas garantidas. Gere exatamente três opções distintas, curtas e naturais, sem spintax, sem listas de alternativas dentro do texto e sem conteúdo de prospecção fria não solicitada. Use variáveis literais {{nome}} e {{empresa}} quando forem adequadas. Retorne JSON com a propriedade options, um array de três objetos {title, text}.",
        input: `Objetivo: ${input.objective}\nTom de voz: ${input.tone}\nProduto ou serviço: ${input.product}`,
        text: { format: { type: "json_object" } },
        max_output_tokens: 800,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      console.error("OpenAI template generation error:", response.status, detail?.error?.message);
      return NextResponse.json({ error: response.status === 429 ? "Limite de uso da IA atingido. Tente novamente em instantes." : "Não foi possível gerar ideias agora. Tente novamente." }, { status: response.status === 429 ? 429 : 502 });
    }

    const result = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const outputText = result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("A resposta da IA veio vazia.");

    const parsed = JSON.parse(outputText) as { options?: unknown };
    const options = z.array(z.object({ title: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(1200) })).length(3).parse(parsed.options) as GeneratedOption[];
    return NextResponse.json({ options });
  } catch (error) {
    console.error("Template AI generation failed:", error);
    return NextResponse.json({ error: "Não foi possível gerar ideias agora. Verifique a conexão e tente novamente." }, { status: 502 });
  }
}
