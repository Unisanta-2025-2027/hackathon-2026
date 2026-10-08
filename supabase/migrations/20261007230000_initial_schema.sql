create type public.tipo_artefato as enum (
  'roteiro_aula',
  'atividade',
  'prova'
);

create type public.situacao_artefato as enum (
  'rascunho',
  'gerado',
  'editado',
  'arquivado'
);

create type public.situacao_topico as enum (
  'pendente',
  'planejado',
  'praticado',
  'avaliado'
);

create type public.situacao_extracao as enum (
  'pendente',
  'processando',
  'concluido',
  'falhou'
);

create type public.situacao_correcao as enum (
  'pendente',
  'concluido',
  'falhou'
);

create table public.professores (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_completo text not null default '',
  nome_instituicao text,
  preferencias jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint professores_preferencias_objeto check (jsonb_typeof(preferencias) = 'object')
);

create table public.materias (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores (id) on delete cascade,
  nome text not null,
  descricao text,
  ano_letivo smallint not null default extract(year from now())::smallint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint materias_nome_obrigatorio check (length(btrim(nome)) > 0),
  constraint materias_ano_letivo_valido check (ano_letivo between 2000 and 2200),
  constraint materias_id_professor_unico unique (id, professor_id),
  constraint materias_professor_nome_ano_unico unique (professor_id, nome, ano_letivo)
);

create table public.turmas (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores (id) on delete cascade,
  materia_id uuid not null,
  nome text not null,
  turno text,
  semestre smallint,
  ano_letivo smallint not null default extract(year from now())::smallint,
  quantidade_alunos integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint turmas_materia_professor_fk
    foreign key (materia_id, professor_id)
    references public.materias (id, professor_id) on delete cascade,
  constraint turmas_nome_obrigatorio check (length(btrim(nome)) > 0),
  constraint turmas_semestre_valido check (semestre is null or semestre between 1 and 12),
  constraint turmas_ano_letivo_valido check (ano_letivo between 2000 and 2200),
  constraint turmas_quantidade_alunos_valida check (quantidade_alunos is null or quantidade_alunos >= 0),
  constraint turmas_id_materia_professor_unico unique (id, materia_id, professor_id),
  constraint turmas_materia_nome_ano_unico unique (materia_id, nome, ano_letivo)
);

create table public.ementas (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores (id) on delete cascade,
  materia_id uuid not null,
  titulo text not null,
  periodo text,
  ano_letivo smallint not null default extract(year from now())::smallint,
  caminho_arquivo text,
  nome_arquivo text,
  tipo_mime text,
  tamanho_arquivo_bytes bigint,
  texto_extraido text,
  situacao_extracao public.situacao_extracao not null default 'pendente',
  erro_extracao text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ementas_materia_professor_fk
    foreign key (materia_id, professor_id)
    references public.materias (id, professor_id) on delete cascade,
  constraint ementas_titulo_obrigatorio check (length(btrim(titulo)) > 0),
  constraint ementas_ano_letivo_valido check (ano_letivo between 2000 and 2200),
  constraint ementas_tamanho_arquivo_valido check (
    tamanho_arquivo_bytes is null or tamanho_arquivo_bytes between 1 and 26214400
  ),
  constraint ementas_tipo_arquivo_valido check (
    tipo_mime is null or tipo_mime in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    )
  ),
  constraint ementas_metadados_arquivo_consistentes check (
    (caminho_arquivo is null and nome_arquivo is null and tipo_mime is null and tamanho_arquivo_bytes is null)
    or
    (caminho_arquivo is not null and nome_arquivo is not null and tipo_mime is not null and tamanho_arquivo_bytes is not null)
  ),
  constraint ementas_caminho_arquivo_professor check (
    caminho_arquivo is null or caminho_arquivo ~ ('^' || professor_id::text || '/.+')
  ),
  constraint ementas_caminho_arquivo_unico unique (caminho_arquivo),
  constraint ementas_id_materia_professor_unico unique (id, materia_id, professor_id)
);

create table public.topicos_ementa (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores (id) on delete cascade,
  ementa_id uuid not null,
  materia_id uuid not null,
  ordem integer not null,
  titulo text not null,
  descricao text,
  habilidades jsonb not null default '[]'::jsonb,
  situacao public.situacao_topico not null default 'pendente',
  situacao_atualizada_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint topicos_ementa_ementa_materia_professor_fk
    foreign key (ementa_id, materia_id, professor_id)
    references public.ementas (id, materia_id, professor_id) on delete cascade,
  constraint topicos_ementa_ordem_valida check (ordem > 0),
  constraint topicos_ementa_titulo_obrigatorio check (length(btrim(titulo)) > 0),
  constraint topicos_ementa_habilidades_lista check (jsonb_typeof(habilidades) = 'array'),
  constraint topicos_ementa_id_materia_professor_unico unique (id, materia_id, professor_id),
  constraint topicos_ementa_ementa_ordem_unica unique (ementa_id, ordem)
);

create table public.pre_promptos (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores (id) on delete cascade,
  nome text not null,
  descricao text,
  nome_escola text,
  nome_professor text,
  instrucoes_fixas text,
  colunas_layout smallint not null default 1,
  layout_compacto boolean not null default false,
  familia_fonte text not null default 'Arial',
  tamanho_fonte numeric(4, 1) not null default 11,
  tipos_artefato public.tipo_artefato[] not null default array[
    'roteiro_aula'::public.tipo_artefato,
    'atividade'::public.tipo_artefato,
    'prova'::public.tipo_artefato
  ],
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pre_promptos_nome_obrigatorio check (length(btrim(nome)) > 0),
  constraint pre_promptos_colunas_validas check (colunas_layout in (1, 2)),
  constraint pre_promptos_tamanho_fonte_valido check (tamanho_fonte between 6 and 36),
  constraint pre_promptos_tipos_artefato_obrigatorios check (cardinality(tipos_artefato) > 0),
  constraint pre_promptos_professor_nome_unico unique (professor_id, nome),
  constraint pre_promptos_id_professor_unico unique (id, professor_id)
);

create table public.artefatos (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores (id) on delete cascade,
  materia_id uuid not null,
  turma_id uuid,
  ementa_id uuid,
  pre_prompto_id uuid,
  tipo public.tipo_artefato not null,
  situacao public.situacao_artefato not null default 'rascunho',
  titulo text not null,
  conteudo jsonb not null default '{}'::jsonb,
  texto_formatado text,
  gabarito jsonb,
  rubrica jsonb,
  snapshot_pre_prompto jsonb not null default '{}'::jsonb,
  versao text,
  modelo_geracao text,
  metadados_geracao jsonb not null default '{}'::jsonb,
  gerado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint artefatos_materia_professor_fk
    foreign key (materia_id, professor_id)
    references public.materias (id, professor_id) on delete cascade,
  constraint artefatos_turma_materia_professor_fk
    foreign key (turma_id, materia_id, professor_id)
    references public.turmas (id, materia_id, professor_id) on delete set null (turma_id),
  constraint artefatos_ementa_materia_professor_fk
    foreign key (ementa_id, materia_id, professor_id)
    references public.ementas (id, materia_id, professor_id) on delete set null (ementa_id),
  constraint artefatos_pre_prompto_professor_fk
    foreign key (pre_prompto_id, professor_id)
    references public.pre_promptos (id, professor_id) on delete set null (pre_prompto_id),
  constraint artefatos_titulo_obrigatorio check (length(btrim(titulo)) > 0),
  constraint artefatos_conteudo_objeto check (jsonb_typeof(conteudo) = 'object'),
  constraint artefatos_snapshot_pre_prompto_objeto check (jsonb_typeof(snapshot_pre_prompto) = 'object'),
  constraint artefatos_metadados_geracao_objeto check (jsonb_typeof(metadados_geracao) = 'object'),
  constraint artefatos_versao_valida check (versao is null or versao in ('A', 'B')),
  constraint artefatos_versao_apenas_prova check (versao is null or tipo = 'prova'),
  constraint artefatos_id_professor_unico unique (id, professor_id),
  constraint artefatos_id_materia_professor_unico unique (id, materia_id, professor_id)
);

create table public.artefatos_topicos (
  professor_id uuid not null references public.professores (id) on delete cascade,
  artefato_id uuid not null,
  topico_id uuid not null,
  materia_id uuid not null,
  criado_em timestamptz not null default now(),
  primary key (artefato_id, topico_id),
  constraint artefatos_topicos_artefato_materia_professor_fk
    foreign key (artefato_id, materia_id, professor_id)
    references public.artefatos (id, materia_id, professor_id) on delete cascade,
  constraint artefatos_topicos_topico_materia_professor_fk
    foreign key (topico_id, materia_id, professor_id)
    references public.topicos_ementa (id, materia_id, professor_id) on delete cascade
);

create table public.correcoes (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professores (id) on delete cascade,
  artefato_id uuid not null,
  identificacao_aluno text,
  texto_resposta text,
  caminho_resposta text,
  nota numeric(7, 2),
  nota_maxima numeric(7, 2),
  devolutiva text,
  resultados_rubrica jsonb not null default '[]'::jsonb,
  situacao public.situacao_correcao not null default 'pendente',
  modelo_correcao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint correcoes_artefato_professor_fk
    foreign key (artefato_id, professor_id)
    references public.artefatos (id, professor_id) on delete cascade,
  constraint correcoes_resposta_obrigatoria check (texto_resposta is not null or caminho_resposta is not null),
  constraint correcoes_caminho_resposta_professor check (
    caminho_resposta is null or caminho_resposta ~ ('^' || professor_id::text || '/.+')
  ),
  constraint correcoes_nota_nao_negativa check (nota is null or nota >= 0),
  constraint correcoes_nota_maxima_positiva check (nota_maxima is null or nota_maxima > 0),
  constraint correcoes_nota_dentro_do_maximo check (nota is null or nota_maxima is null or nota <= nota_maxima),
  constraint correcoes_resultados_rubrica_lista check (jsonb_typeof(resultados_rubrica) = 'array'),
  constraint correcoes_caminho_resposta_unico unique (caminho_resposta)
);

create index turmas_professor_id_idx on public.turmas (professor_id);
create index turmas_materia_id_idx on public.turmas (materia_id);
create index turmas_materia_professor_idx on public.turmas (materia_id, professor_id);
create index ementas_professor_materia_criado_idx on public.ementas (professor_id, materia_id, criado_em desc);
create index ementas_materia_professor_idx on public.ementas (materia_id, professor_id);
create index ementas_situacao_extracao_idx on public.ementas (situacao_extracao) where situacao_extracao in ('pendente', 'processando');
create index topicos_ementa_professor_materia_ordem_idx on public.topicos_ementa (professor_id, materia_id, ordem);
create index topicos_ementa_ementa_materia_professor_idx on public.topicos_ementa (ementa_id, materia_id, professor_id);
create index topicos_ementa_situacao_idx on public.topicos_ementa (professor_id, situacao);
create index pre_promptos_professor_ativo_idx on public.pre_promptos (professor_id, ativo);
create index artefatos_professor_materia_criado_idx on public.artefatos (professor_id, materia_id, criado_em desc);
create index artefatos_materia_professor_idx on public.artefatos (materia_id, professor_id);
create index artefatos_professor_turma_criado_idx on public.artefatos (professor_id, turma_id, criado_em desc);
create index artefatos_ementa_id_idx on public.artefatos (ementa_id);
create index artefatos_topicos_artefato_materia_professor_idx on public.artefatos_topicos (artefato_id, materia_id, professor_id);
create index artefatos_topicos_topico_materia_professor_idx on public.artefatos_topicos (topico_id, materia_id, professor_id);
create index correcoes_professor_artefato_criado_idx on public.correcoes (professor_id, artefato_id, criado_em desc);
create index correcoes_artefato_professor_criado_idx on public.correcoes (artefato_id, professor_id, criado_em desc);

create function public.atualizar_data_modificacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create function public.criar_perfil_professor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.professores (id, nome_completo)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nome_completo'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Professor(a)'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create function public.atualizar_data_situacao_topico()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.situacao is distinct from old.situacao then
    new.situacao_atualizada_em = now();
  end if;
  return new;
end;
$$;

create function public.validar_correcao_de_prova()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tipo_artefato_alvo public.tipo_artefato;
begin
  select tipo
    into tipo_artefato_alvo
    from public.artefatos
    where id = new.artefato_id
      and professor_id = new.professor_id;

  if tipo_artefato_alvo is distinct from 'prova'::public.tipo_artefato then
    raise exception 'Correções só podem ser vinculadas a provas'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function public.impedir_alteracao_tipo_artefato_corrigido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo is distinct from 'prova'::public.tipo_artefato
    and exists (
      select 1
        from public.correcoes
        where artefato_id = old.id
          and professor_id = old.professor_id
    )
  then
    raise exception 'Um artefato com correções deve continuar sendo uma prova'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_professor();

create trigger professores_atualizar_data_modificacao before update on public.professores
  for each row execute function public.atualizar_data_modificacao();
create trigger materias_atualizar_data_modificacao before update on public.materias
  for each row execute function public.atualizar_data_modificacao();
create trigger turmas_atualizar_data_modificacao before update on public.turmas
  for each row execute function public.atualizar_data_modificacao();
create trigger ementas_atualizar_data_modificacao before update on public.ementas
  for each row execute function public.atualizar_data_modificacao();
create trigger topicos_ementa_atualizar_data_modificacao before update on public.topicos_ementa
  for each row execute function public.atualizar_data_modificacao();
create trigger topicos_ementa_atualizar_data_situacao before update on public.topicos_ementa
  for each row execute function public.atualizar_data_situacao_topico();
create trigger pre_promptos_atualizar_data_modificacao before update on public.pre_promptos
  for each row execute function public.atualizar_data_modificacao();
create trigger artefatos_atualizar_data_modificacao before update on public.artefatos
  for each row execute function public.atualizar_data_modificacao();
create trigger artefatos_impedir_alteracao_tipo_corrigido before update of tipo on public.artefatos
  for each row execute function public.impedir_alteracao_tipo_artefato_corrigido();
create trigger correcoes_atualizar_data_modificacao before update on public.correcoes
  for each row execute function public.atualizar_data_modificacao();
create trigger correcoes_validar_artefato_prova before insert or update of artefato_id, professor_id on public.correcoes
  for each row execute function public.validar_correcao_de_prova();

alter table public.professores enable row level security;
alter table public.materias enable row level security;
alter table public.turmas enable row level security;
alter table public.ementas enable row level security;
alter table public.topicos_ementa enable row level security;
alter table public.pre_promptos enable row level security;
alter table public.artefatos enable row level security;
alter table public.artefatos_topicos enable row level security;
alter table public.correcoes enable row level security;

create policy "Professores gerenciam proprio perfil"
  on public.professores for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Professores gerenciam suas materias"
  on public.materias for all to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

create policy "Professores gerenciam suas turmas"
  on public.turmas for all to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

create policy "Professores gerenciam suas ementas"
  on public.ementas for all to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

create policy "Professores gerenciam seus topicos"
  on public.topicos_ementa for all to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

create policy "Professores gerenciam seus pre promptos"
  on public.pre_promptos for all to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

create policy "Professores gerenciam seus artefatos"
  on public.artefatos for all to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

create policy "Professores gerenciam seus vinculos de topicos"
  on public.artefatos_topicos for all to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

create policy "Professores gerenciam suas correcoes"
  on public.correcoes for all to authenticated
  using ((select auth.uid()) = professor_id)
  with check ((select auth.uid()) = professor_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documentos-base',
    'documentos-base',
    false,
    26214400,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]
  ),
  (
    'respostas-avaliacao',
    'respostas-avaliacao',
    false,
    26214400,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png'
    ]
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Professores leem seus documentos base"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos-base'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Professores enviam seus documentos base"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos-base'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Professores atualizam seus documentos base"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documentos-base'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'documentos-base'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Professores excluem seus documentos base"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos-base'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Professores leem suas respostas de avaliacao"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'respostas-avaliacao'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Professores enviam suas respostas de avaliacao"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'respostas-avaliacao'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Professores atualizam suas respostas de avaliacao"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'respostas-avaliacao'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'respostas-avaliacao'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Professores excluem suas respostas de avaliacao"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'respostas-avaliacao'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
