with ordered_ementas as (
  select
    id,
    row_number() over (
      partition by materia_id
      order by coalesce(enviado_em, criado_em) desc, id desc
    ) as position
  from public.ementas
)
delete from public.ementas as ementa
using ordered_ementas
where ementa.id = ordered_ementas.id
  and ordered_ementas.position > 1;

create unique index if not exists ementas_materia_id_unico
  on public.ementas (materia_id);

create or replace function public.substituir_ementa_com_topicos(
  p_materia_id uuid,
  p_titulo text,
  p_periodo text,
  p_ano_letivo smallint,
  p_caminho_arquivo text,
  p_nome_arquivo text,
  p_tipo_mime text,
  p_tamanho_arquivo_bytes bigint,
  p_texto_extraido text,
  p_topicos jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_professor_id uuid := auth.uid();
  v_ementa_id uuid;
begin
  if v_professor_id is null then
    raise exception 'Sessão de professor inválida.';
  end if;

  if not exists (
    select 1
    from public.materias
    where public.materias.id = p_materia_id
      and public.materias.professor_id = v_professor_id
  ) then
    raise exception 'A matéria não pertence ao professor autenticado.';
  end if;

  if jsonb_typeof(p_topicos) is distinct from 'array' then
    raise exception 'A extração não retornou tópicos válidos.';
  end if;
  if jsonb_array_length(p_topicos) = 0 then
    raise exception 'A extração não retornou tópicos válidos.';
  end if;

  insert into public.ementas (
    professor_id,
    materia_id,
    titulo,
    periodo,
    ano_letivo,
    caminho_arquivo,
    nome_arquivo,
    tipo_mime,
    tamanho_arquivo_bytes,
    texto_extraido,
    situacao_extracao,
    erro_extracao,
    enviado_em
  ) values (
    v_professor_id,
    p_materia_id,
    p_titulo,
    p_periodo,
    p_ano_letivo,
    p_caminho_arquivo,
    p_nome_arquivo,
    p_tipo_mime,
    p_tamanho_arquivo_bytes,
    p_texto_extraido,
    'concluido',
    null,
    now()
  )
  on conflict (materia_id) do update set
    professor_id = excluded.professor_id,
    titulo = excluded.titulo,
    periodo = excluded.periodo,
    ano_letivo = excluded.ano_letivo,
    caminho_arquivo = excluded.caminho_arquivo,
    nome_arquivo = excluded.nome_arquivo,
    tipo_mime = excluded.tipo_mime,
    tamanho_arquivo_bytes = excluded.tamanho_arquivo_bytes,
    texto_extraido = excluded.texto_extraido,
    situacao_extracao = excluded.situacao_extracao,
    erro_extracao = null,
    enviado_em = excluded.enviado_em
  returning id into v_ementa_id;

  delete from public.topicos_ementa
  where public.topicos_ementa.ementa_id = v_ementa_id
    and public.topicos_ementa.professor_id = v_professor_id;

  insert into public.topicos_ementa (
    professor_id,
    ementa_id,
    materia_id,
    ordem,
    titulo,
    descricao,
    habilidades
  )
  select
    v_professor_id,
    v_ementa_id,
    p_materia_id,
    topic.ordinality::integer,
    topic.value ->> 'titulo',
    nullif(topic.value ->> 'descricao', ''),
    coalesce(topic.value -> 'habilidades', '[]'::jsonb)
  from jsonb_array_elements(p_topicos) with ordinality as topic(value, ordinality);

  return v_ementa_id;
end;
$$;

revoke all on function public.substituir_ementa_com_topicos(uuid, text, text, smallint, text, text, text, bigint, text, jsonb) from public;
grant execute on function public.substituir_ementa_com_topicos(uuid, text, text, smallint, text, text, text, bigint, text, jsonb) to authenticated;