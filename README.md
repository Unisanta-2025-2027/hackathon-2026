# PréPrompto

Aplicação para organizar o planejamento docente, acompanhar tópicos da ementa e preparar materiais didáticos.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Conexão Supabase

Copie `.env.example` para `.env.local` e configure a URL do projeto e sua chave pública `sb_publishable_...` (ou chave `anon` legada). Essas chaves são destinadas ao cliente; nunca configure ou exponha uma chave `service_role`/`sb_secret` no frontend.

O acesso ao Supabase é feito por Server Actions com sessão em cookies HTTP-only. Cada ação verifica o usuário autenticado; o banco aplica RLS e deriva `professor_id` da sessão, não dos dados enviados pelo navegador.

## Banco de dados Supabase

A estrutura inicial está em `supabase/migrations/20261007230000_initial_schema.sql`. Os nomes de entidades, campos, tipos, políticas e funções criados pelo projeto estão em português:

- `professores`, `materias` e `turmas` para a gestão acadêmica;
- `ementas` e `topicos_ementa` para documentos-base, extração e acompanhamento do conteúdo;
- `pre_promptos` para cabeçalhos, instruções e layouts reutilizáveis;
- `artefatos` e `artefatos_topicos` para roteiros, atividades e provas relacionados aos tópicos;
- `correcoes` para respostas, notas e devolutivas vinculadas às provas;
- buckets privados `documentos-base` e `respostas-avaliacao`.

As tabelas usam Row Level Security (RLS) para limitar o acesso aos dados do professor autenticado. Os caminhos dos arquivos devem começar com o UUID do usuário autenticado:

```text
<uuid-do-professor>/<uuid-da-ementa>.pdf
<uuid-do-professor>/<uuid-da-correcao>.pdf
```

Os nomes de colunas das tabelas internas do Supabase Storage, como `storage.objects.name`, permanecem conforme a API oficial do Supabase. Os uploads pelo servidor aceitam arquivos de até 25 MB; o limite de corpo das Server Actions foi ajustado para 26 MB.

### Aplicar em um projeto Supabase

Autentique-se, vincule o projeto remoto e aplique as migrations:

```bash
npx supabase login
npx supabase link --project-ref <referencia-do-projeto>
npx supabase db push
```

Para desenvolvimento local, inicie o Supabase com Docker e aplique a migration:

```bash
npx supabase start
npx supabase migration up
```

O perfil do professor é criado automaticamente a partir do Supabase Auth. Cadastro, login, matérias, turmas, upload de ementas, tópicos, pré-promptos, rascunhos de artefatos e registros de respostas de provas usam o banco. A extração de tópicos e a geração/correção por IA ainda precisam ser implementadas; por enquanto, o material criado é salvo como rascunho.
