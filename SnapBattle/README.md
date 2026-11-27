# SnapBattle
Competição diária de fotos entre amigos. HTML/CSS/JS puro + Supabase.

## 1. Supabase
1. Crie um projeto em supabase.com.
2. **SQL Editor → New query**: cole `schema.sql`, troque o código de convite (`FAMILIA2026`) e clique **Run**. Isso cria tabelas, RLS, funções, o bucket `daily-photos` e suas políticas.
3. **Authentication → Providers → Email**: deixe habilitado e desligue **Confirm email** (senão cada pessoa precisa confirmar o e-mail).
4. **Project Settings → API**: copie *Project URL* e *anon public key* para `config.js`.
5. **Authentication → URL Configuration**: coloque seu domínio em *Site URL*.
6. Para trocar o convite depois: `update settings set value='NOVO' where key='invite_code';`

## 2. GitHub Pages
1. Suba os arquivos na raiz de um repositório.
2. **Settings → Pages → Deploy from a branch → main / (root)**.

## 3. Domínio próprio
1. **Settings → Pages → Custom domain**: informe o domínio e marque *Enforce HTTPS*.
2. No DNS: subdomínio → `CNAME` para `SEU-USUARIO.github.io`; domínio raiz → registros `A` para 185.199.108.153, 185.199.109.153, 185.199.110.153 e 185.199.111.153.

## Notas
- Dia e cronômetro usam `America/Sao_Paulo`; o servidor aplica a mesma regra via `sp_today()`.
- Fotos de hoje só aparecem para quem postou ou entrou como espectador (RLS). As URLs do bucket são públicas, mas imprevisíveis.
