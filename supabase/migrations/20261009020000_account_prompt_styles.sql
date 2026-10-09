alter table public.pre_promptos
  add column modelo_pontuacao text not null default 'igualitaria';

alter table public.pre_promptos
  add constraint pre_promptos_modelo_pontuacao_valido
  check (modelo_pontuacao in ('igualitaria', 'ponderada'));

insert into public.pre_promptos (
  professor_id,
  nome,
  descricao,
  colunas_layout,
  layout_compacto,
  familia_fonte,
  tamanho_fonte,
  modelo_pontuacao,
  tipos_artefato
)
select
  professor.id,
  style.nome,
  style.descricao,
  style.colunas_layout,
  style.layout_compacto,
  style.familia_fonte,
  11,
  style.modelo_pontuacao,
  array['roteiro_aula', 'atividade', 'prova']::public.tipo_artefato[]
from public.professores as professor
cross join (values
  ('Modelo Oficial Bimestral', '2 colunas compactas · Times New Roman · Pontuação igualitária 10 pts', 2, true, 'Times New Roman', 'igualitaria'),
  ('Modelo Compacto', '1 coluna · Arial · Pontuação igualitária 10 pts', 1, true, 'Arial', 'igualitaria'),
  ('Modelo Dissertativo', '2 colunas compactas · Times New Roman · Pontuação ponderada por questão', 2, true, 'Times New Roman', 'ponderada')
) as style(nome, descricao, colunas_layout, layout_compacto, familia_fonte, modelo_pontuacao)
on conflict (professor_id, nome) do nothing;

create function public.criar_estilos_padrao_ao_criar_professor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pre_promptos (
    professor_id,
    nome,
    descricao,
    colunas_layout,
    layout_compacto,
    familia_fonte,
    tamanho_fonte,
    modelo_pontuacao,
    tipos_artefato
  ) values
    (
      new.id,
      'Modelo Oficial Bimestral',
      '2 colunas compactas · Times New Roman · Pontuação igualitária 10 pts',
      2,
      true,
      'Times New Roman',
      11,
      'igualitaria',
      array['roteiro_aula', 'atividade', 'prova']::public.tipo_artefato[]
    ),
    (
      new.id,
      'Modelo Compacto',
      '1 coluna · Arial · Pontuação igualitária 10 pts',
      1,
      true,
      'Arial',
      11,
      'igualitaria',
      array['roteiro_aula', 'atividade', 'prova']::public.tipo_artefato[]
    ),
    (
      new.id,
      'Modelo Dissertativo',
      '2 colunas compactas · Times New Roman · Pontuação ponderada por questão',
      2,
      true,
      'Times New Roman',
      11,
      'ponderada',
      array['roteiro_aula', 'atividade', 'prova']::public.tipo_artefato[]
    )
  on conflict (professor_id, nome) do nothing;
  return new;
end;
$$;

create trigger professores_criar_estilos_padrao
  after insert on public.professores
  for each row execute function public.criar_estilos_padrao_ao_criar_professor();
