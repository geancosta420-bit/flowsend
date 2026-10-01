# FlowSend

CRM, prospecção e campanhas com WhatsApp para transformar contatos em oportunidades.

**Transforme contatos em oportunidades de vendas pelo WhatsApp.**

> MVP local de workspace único. Contatos, campanhas, conversas, usuários e fila ficam persistidos no arquivo `.data/flowsend.json`. O dashboard ainda usa indicadores demonstrativos. A Evolution API recebe credenciais somente no servidor.

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS 3, Recharts, Lucide React e Zod.

## Instalação e execução

```bash
cd flowsend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Antes de iniciar, defina `FLOWSEND_AUTH_SECRET` em `.env.local` com um valor aleatório privado de pelo menos 32 bytes. No primeiro acesso, abra http://localhost:3000/login e crie a conta administradora inicial. Depois, use **Usuários** no menu para cadastrar contas e definir o perfil. Senhas iniciais devem ser compartilhadas manualmente. Todos os usuários pertencem ao mesmo workspace local. Em outro terminal, execute `npm run worker` para processar campanhas. O worker exige Evolution configurada e arquivo local inicializado pela aplicação. Para validar: `npm run lint` e `npm run build`.

## Evolution API

Defina no `.env.local`:

```env
EVOLUTION_API_URL=http://localhost:8081
EVOLUTION_API_KEY=sua-chave
EVOLUTION_INSTANCE_NAME=flowsend-comercial
EVOLUTION_WEBHOOK_SECRET=segredo-opcional
EVOLUTION_CREATE_UNKNOWN_CONTACTS=false
FLOWSEND_DATA_DIR=.data
```

A URL pode apontar para uma instalação local ou outro endereço acessível pelo processo Node do FlowSend. Reinicie o servidor depois de alterar variáveis. Em **Integrações**, teste a conexão, crie/selecione a instância, solicite QR Code e consulte o status. Rotas server-side fazem chamadas para a API e a chave nunca segue ao navegador. O adapter usa rotas comuns da Evolution API v2: `instance/create`, `instance/connect`, `instance/connectionState` e `message/sendText`; instalações com versão/configuração diferentes podem exigir ajuste do adapter.

Configure o webhook da Evolution para `POST /api/webhooks/evolution`. O handler valida o segredo opcional, persiste mensagens recebidas, atualiza o CRM e respeita opt-out. Para criar contato ao receber mensagem de número desconhecido, use `EVOLUTION_CREATE_UNKNOWN_CONTACTS=true`.

A integração Baileys é não oficial e pode sofrer desconexões ou limitações do WhatsApp. Faça contato somente com consentimento, respeite opt-outs e políticas aplicáveis. O FlowSend exclui opt-outs da fila e verifica novamente antes de cada envio e não implementa técnicas de evasão.

## Funcionalidades atuais

- Dashboard com métricas, funil, gráfico e campanhas demonstrativas.
- Contatos: busca, criação/edição, seleção e exclusão, bloqueio de mensagens, importação CSV com descarte de duplicados/números inválidos, exportação; armazenamento JSON local no servidor.
- Campanhas: wizard de cinco etapas para objetivo, público, mensagem/variáveis, configuração e revisão. Campanhas são persistidas e enfileiradas no arquivo local; worker separado envia, limita, agenda, pausa e cancela mensagens.
- CRM kanban ligado aos contatos persistidos, com mudança de estágio por arrastar e soltar e timeline de mensagens.
- Acesso: primeiro login cria o administrador; administradores cadastram, redefinem senhas e desativam usuários em **Usuários**. As senhas são derivadas com scrypt e sessões usam cookie HTTP-only assinado.
- Inbox envia pela Evolution API e recebe atualizações em tempo real via Server-Sent Events após os webhooks `MESSAGES_UPSERT` e `MESSAGES_UPDATE`. Para o ambiente local com Docker Desktop, o webhook usa `http://host.docker.internal:3000/api/webhooks/evolution`; as instâncias locais foram configuradas. Respostas iniciais são marcadas como demonstração.
- Agendamentos consultam e cancelam campanhas salvas. Listas com tags segmentam contatos e podem ser usadas na criação de campanhas; templates podem ser criados, editados e reutilizados. Configurações do workspace são persistidas no servidor.
- Provider `MessagingProvider` com implementação `EvolutionProvider`; worker local consome fila fora de requests HTTP; Redis/BullMQ seguem como evolução para multiinstância/produção.
- Planos Starter, Pro e Scale com preços e cotas mensais no workspace, contagem de mensagens enviadas/prospects adicionados e instâncias conectadas, bloqueios no backend, aviso de upgrade e ativação manual restrita a administradores após confirmação do pagamento. A cobrança online ainda não está integrada.

## Estrutura

```text
src/app/                 Páginas e rotas server-side
src/app/api/evolution/   Teste, instância, QR, status e envio
src/app/api/webhooks/    Entrada de eventos Evolution
src/components/layout/   Sidebar e shell responsivos
src/lib/providers/       Interface de mensageria e Evolution
src/lib/queue/           Contrato futuro para BullMQ/Redis
src/lib/data.ts          Dados demonstrativos claramente separados
src/types/               Tipos compartilhados
```

## Próximas fases

1. Integrar um provedor de cobrança para assinatura e renovação automáticas; a ativação de plano hoje é manual pelo administrador após confirmação do pagamento.
2. Migrar o armazenamento local para PostgreSQL/Prisma e implementar workspaces separados, convites por e-mail e recuperação de senha.
3. Migrar o worker/armazenamento JSON local para Redis/BullMQ e PostgreSQL com auditoria para uso concorrente/produção.
4. Usar Redis Pub/Sub para distribuir eventos da inbox entre múltiplos processos/instâncias e ampliar a reconciliação de eventos de entrega.
5. Adicionar auditoria de acessos e administração segura de múltiplos workspaces e instâncias.
