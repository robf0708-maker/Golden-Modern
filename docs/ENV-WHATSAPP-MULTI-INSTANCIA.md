# Variáveis de ambiente — WhatsApp Multi-Instância (ETAPA 8)

Plano de implementação (contexto e arquitetura): [docs/plano/ETAPA-8-WHATSAPP-MULTI-INSTANCIA.md](../../docs/plano/ETAPA-8-WHATSAPP-MULTI-INSTANCIA.md) (a partir da pasta `Golden-Modern-main/docs/`, sobe para a raiz do repositório).

Para o painel de conexão WhatsApp funcionar, configure as seguintes variáveis:

## Local (.env)

```env
# URL base do UazAPI (ex: https://seudominio.uazapi.com)
UAZAPI_URL=https://api.uazapi.com

# Token master/admin (admintoken) para criar instâncias — obter no painel UazAPI
UAZAPI_MASTER_TOKEN=seu_token_master_aqui

# Token de instância global (fallback para notificações quando barbearia não tem token próprio)
UAZAPI_INSTANCE_TOKEN=seu_token_instancia_aqui
```

## Railway (produção)

1. Acesse o projeto no Railway
2. Vá em **Settings** → **Variables**
3. Adicione:
   - `UAZAPI_URL` — URL base do UazAPI
   - `UAZAPI_MASTER_TOKEN` — Token master (para criar instâncias)
   - `UAZAPI_INSTANCE_TOKEN` — (opcional) Token de fallback para notificações

## Webhook de status

O UazAPI deve chamar `POST /api/webhook/whatsapp-status/:barbershopId` quando o admin escanear o QR. Configure essa URL no painel do UazAPI para cada instância, se disponível.
