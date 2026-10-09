alter table public.artefatos
  drop constraint if exists artefatos_turma_materia_professor_fk;

drop index if exists public.artefatos_professor_turma_criado_idx;

alter table public.artefatos
  drop column if exists turma_id;

drop table if exists public.turmas;

alter table public.materias
  drop column if exists descricao;