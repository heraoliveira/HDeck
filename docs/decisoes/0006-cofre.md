# ADR 0006 · Cofre de logins

**Data:** 2026-11-26 · **Estado:** aceita

## Decisão
- Cada segredo: AES-256-GCM com uma chave de dados aleatória (`versão | iv | tag | dados`).
- A chave de dados é protegida pelo `safeStorage` (DPAPI, usuário do Windows).
- Com senha mestra, a chave de dados também é envolvida por uma chave `scrypt(N=2^17, r=8, p=1)` com sal aleatório. Tranca sozinho após 15 min sem uso (RN-141). Sem recuperação.
- Webhook do Discord e token do Telegram: só DPAPI, para os avisos funcionarem com o cofre trancado (RN-114). O app só aceita webhook do domínio do Discord e token no formato do Telegram.
- Backup do cofre: sempre cifrado com uma senha de backup (scrypt + AES-GCM, RN-160).
- "Preencher login" roda no mundo isolado, dispara `input`/`change` e nunca envia (RN-142).

Testes: `tests/integracao/adaptadores-node.test.ts` (ida e volta, senha errada, adulteração, outro usuário do Windows, tranca) e o E2E do cofre.
