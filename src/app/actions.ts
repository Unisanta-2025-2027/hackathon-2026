"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gerarConteudoPedagogico } from "@/lib/ai/generate";
import { extrairTopicosDaEmenta } from "@/lib/ai/extract-topics";
import type { TipoMaterial } from "@/lib/ai/prompts";
import mammoth from "mammoth";

export type ActionResult<T = undefined> =
  | { data: T; error: null }
  | { data: null; error: string };

export type SubjectRecord = { id: string; nome: string; ano_letivo: number };
export type SyllabusRecord = {
  id: string;
  materia_id: string;
  titulo: string;
  nome_arquivo: string | null;
  criado_em: string;
  situacao_extracao: "pendente" | "processando" | "concluido" | "falhou";
  erro_extracao: string | null;
};
export type SubjectWithSyllabus = SubjectRecord & { ementa: SyllabusRecord | null };
export type SyllabusUploadResult = {
  topicosCriados: number;
  aviso: string | null;
};
export type SyllabusDeleteResult = { aviso: string | null };
export type TopicRecord = {
  id: string;
  ementa_id: string;
  materia_id: string;
  titulo: string;
  descricao: string | null;
  habilidades: string[];
  roteiro: "Feito" | "Pendente" | "Não iniciado";
  atividade: "Feito" | "Pendente" | "Não iniciado";
  prova: "Feito" | "Pendente" | "Não iniciado";
};
export type TemplateRecord = {
  id: string;
  materia_id: string | null;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  tipos_artefato: ("roteiro_aula" | "atividade" | "prova")[];
  nome_escola: string | null;
  nome_professor: string | null;
  instrucoes_fixas: string | null;
  colunas_layout: number;
  layout_compacto: boolean;
  familia_fonte: string;
  tamanho_fonte: number;
};
export type AppData = {
  professor: { id: string; nome_completo: string; nome_instituicao: string | null };
  materias: SubjectWithSyllabus[];
  topicos: TopicRecord[];
  prePromptos: TemplateRecord[];
  provas: { id: string; titulo: string }[];
};

function errorMessage(error: { message: string }) {
  return error.message;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizarNome(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("pt-BR");
}

export async function carregarDados(): Promise<ActionResult<AppData | null>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return { data: null, error: errorMessage(authError) };
  if (!user) return { data: null, error: null };

  const [
    profileResult,
    subjectsResult,
    syllabiResult,
    topicsResult,
    templatesResult,
    artifactsResult,
    linksResult,
  ] = await Promise.all([
    supabase.from("professores").select("id,nome_completo,nome_instituicao").eq("id", user.id).single(),
    supabase.from("materias").select("id,nome,ano_letivo").order("nome"),
    supabase.from("ementas").select("id,materia_id,titulo,nome_arquivo,criado_em,situacao_extracao,erro_extracao").order("criado_em", { ascending: false }),
    supabase.from("topicos_ementa").select("id,ementa_id,materia_id,titulo,descricao,habilidades,ordem").order("ordem"),
    supabase.from("pre_promptos").select("id,materia_id,nome,descricao,ativo,tipos_artefato,nome_escola,nome_professor,instrucoes_fixas,colunas_layout,layout_compacto,familia_fonte,tamanho_fonte").order("criado_em"),
    supabase.from("artefatos").select("id,titulo,tipo,situacao"),
    supabase.from("artefatos_topicos").select("artefato_id,topico_id"),
  ]);

  const firstError = [
    profileResult.error,
    subjectsResult.error,
    syllabiResult.error,
    topicsResult.error,
    templatesResult.error,
    artifactsResult.error,
    linksResult.error,
  ].find(Boolean);
  if (firstError) return { data: null, error: errorMessage(firstError) };
  if (!profileResult.data) return { data: null, error: "Não foi possível carregar o perfil do professor." };

  const syllabusBySubject = new Map((syllabiResult.data ?? []).map((syllabus) => [syllabus.materia_id, syllabus]));

  const artifactById = new Map(
    (artifactsResult.data ?? []).map((artifact) => [artifact.id, artifact]),
  );
  const progressByTopic = new Map<string, Partial<Record<"roteiro" | "atividade" | "prova", "Feito" | "Pendente">>>();

  for (const link of linksResult.data ?? []) {
    const artifact = artifactById.get(link.artefato_id);
    if (!artifact) continue;
    const key: "roteiro" | "atividade" | "prova" =
      artifact.tipo === "roteiro_aula"
        ? "roteiro"
        : artifact.tipo === "atividade"
          ? "atividade"
          : "prova";
    const progress = progressByTopic.get(link.topico_id) ?? {};
    progress[key] = artifact.situacao === "rascunho" ? "Pendente" : "Feito";
    progressByTopic.set(link.topico_id, progress);
  }

  return {
    data: {
      professor: profileResult.data,
      materias: (subjectsResult.data ?? []).map((subject) => ({
        ...subject,
        ementa: syllabusBySubject.get(subject.id) ?? null,
      })),
      topicos: (topicsResult.data ?? []).map((topic) => {
        const progress = progressByTopic.get(topic.id);
        return {
          id: topic.id,
          ementa_id: topic.ementa_id,
          materia_id: topic.materia_id,
          titulo: topic.titulo,
          descricao: topic.descricao,
          habilidades: Array.isArray(topic.habilidades)
            ? topic.habilidades.filter((habilidade): habilidade is string => typeof habilidade === "string")
            : [],
          roteiro: progress?.roteiro ?? "Não iniciado",
          atividade: progress?.atividade ?? "Não iniciado",
          prova: progress?.prova ?? "Não iniciado",
        };
      }),
      prePromptos: templatesResult.data ?? [],
      provas: (artifactsResult.data ?? [])
        .filter((artifact) => artifact.tipo === "prova")
        .map(({ id, titulo }) => ({ id, titulo })),
    },
    error: null,
  };
}

export async function entrar(formData: FormData): Promise<ActionResult> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return { data: null, error: "Informe o e-mail e a senha." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { data: null, error: errorMessage(error) };

  revalidatePath("/", "layout");
  return { data: undefined, error: null };
}

export async function cadastrar(formData: FormData): Promise<ActionResult<{ confirmationRequired: boolean }>> {
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("nome");
  if (!isNonEmptyString(email) || !isNonEmptyString(password) || !isNonEmptyString(name)) {
    return { data: null, error: "Preencha nome, e-mail e senha." };
  }
  if (password.length < 8) return { data: null, error: "A senha deve ter pelo menos 8 caracteres." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { nome_completo: name.trim() } },
  });
  if (error) return { data: null, error: errorMessage(error) };

  if (data.session) revalidatePath("/", "layout");
  return { data: { confirmationRequired: !data.session }, error: null };
}

export async function sair(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/", "layout");
  return { data: undefined, error: null };
}

async function usuarioAutenticado() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  return { supabase, user };
}

export async function criarMateria(input: { nome: string; anoLetivo: number }): Promise<ActionResult<SubjectRecord>> {
  if (!isNonEmptyString(input?.nome) || !Number.isInteger(input.anoLetivo) || input.anoLetivo < 2000 || input.anoLetivo > 2200) {
    return { data: null, error: "Informe o nome da matéria e um ano letivo válido." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { data, error } = await supabase
    .from("materias")
    .insert({ professor_id: user.id, nome: input.nome.trim(), ano_letivo: input.anoLetivo })
    .select("id,nome,ano_letivo")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data, error: null };
}

const maxUploadBytes = 25 * 1024 * 1024;
const allowedSourceTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function mensagemErroExtracao(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    IA_KEY_MISSING: "A chave da IA não está configurada no servidor.",
    IA_AUTH_FAILED: "A chave da IA foi recusada. Verifique a configuração do servidor.",
    IA_MODEL_NOT_FOUND: "O modelo de IA configurado não está disponível.",
    IA_QUOTA_EXCEEDED: "A cota da IA foi excedida. Tente novamente mais tarde.",
    IA_PROVIDER_UNAVAILABLE: "O serviço de IA está temporariamente indisponível. Tente novamente.",
    IA_BAD_REQUEST: "O serviço de IA não aceitou o documento. Verifique se o arquivo está íntegro.",
    IA_CONNECTION_FAILED: "Não foi possível conectar ao serviço de IA. Tente novamente.",
    IA_INVALID_JSON: "A IA não retornou uma resposta estruturada válida. Tente novamente.",
    IA_INVALID_TOPICS: "A IA não retornou tópicos em um formato válido. Tente novamente.",
    IA_NO_TOPICS: "Não foi possível identificar tópicos programáticos nesse documento.",
    IA_TOO_MANY_TOPICS: "O documento contém tópicos demais para uma única extração. Divida a ementa e envie novamente.",
    IA_EMPTY_RESPONSE: "A IA não retornou conteúdo. Tente novamente.",
  };
  return messages[code] ?? (code || "Ocorreu um erro inesperado durante a extração.");
}

export async function enviarEmenta(formData: FormData): Promise<ActionResult<SyllabusUploadResult>> {
  const file = formData.get("arquivo");
  const subjectId = formData.get("materiaId");
  const titleValue = formData.get("titulo");
  const periodValue = formData.get("periodo");
  const academicYearValue = Number(formData.get("anoLetivo"));
  if (!(file instanceof File) || file.size === 0 || !isNonEmptyString(subjectId)) {
    return { data: null, error: "Selecione uma matéria e um documento válido." };
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  const extensionTypes: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
  };
  const mimeType = extensionTypes[extension ?? ""];
  if (!mimeType || !allowedSourceTypes.has(mimeType)) {
    return { data: null, error: "Envie um arquivo PDF, DOCX ou TXT." };
  }
  if (file.size > maxUploadBytes) return { data: null, error: "O arquivo deve ter no máximo 25 MB." };
  if (!Number.isInteger(academicYearValue) || academicYearValue < 2000 || academicYearValue > 2200) {
    return { data: null, error: "Informe um ano letivo válido." };
  }

  const { supabase, user } = await usuarioAutenticado();
  const [subjectResult, existingSyllabusResult] = await Promise.all([
    supabase.from("materias").select("id,nome,ano_letivo").eq("id", subjectId).eq("professor_id", user.id).single(),
    supabase.from("ementas").select("id,caminho_arquivo").eq("materia_id", subjectId).eq("professor_id", user.id).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (subjectResult.error || !subjectResult.data) {
    return { data: null, error: errorMessage(subjectResult.error ?? { message: "A matéria não foi encontrada." }) };
  }
  if (existingSyllabusResult.error) return { data: null, error: errorMessage(existingSyllabusResult.error) };

  let extraction: Awaited<ReturnType<typeof extrairTopicosDaEmenta>>;
  try {
    extraction = await extrairTopicosDaEmenta(file, mimeType);
  } catch (extractionError) {
    return { data: null, error: mensagemErroExtracao(extractionError) };
  }

  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("documentos-base")
    .upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (uploadError) return { data: null, error: errorMessage(uploadError) };

  const { data: syllabusId, error: replaceError } = await supabase.rpc("substituir_ementa_com_topicos", {
    p_materia_id: subjectResult.data.id,
    p_titulo: isNonEmptyString(titleValue) ? titleValue.trim() : file.name,
    p_periodo: isNonEmptyString(periodValue) ? periodValue.trim() : null,
    p_ano_letivo: academicYearValue,
    p_caminho_arquivo: storagePath,
    p_nome_arquivo: file.name,
    p_tipo_mime: mimeType,
    p_tamanho_arquivo_bytes: file.size,
    p_texto_extraido: extraction.textoExtraido,
    p_topicos: extraction.topicos.map((topic) => ({
      titulo: topic.titulo,
      descricao: topic.descricao || null,
      habilidades: topic.habilidades,
    })),
  });
  if (replaceError || !syllabusId) {
    const { error: cleanupError } = await supabase.storage.from("documentos-base").remove([storagePath]);
    const message = errorMessage(replaceError ?? { message: "A ementa não foi salva." });
    return {
      data: null,
      error: cleanupError ? `${message} O arquivo temporário também não pôde ser removido: ${errorMessage(cleanupError)}` : message,
    };
  }

  let storageWarning: string | null = null;
  const previousPath = existingSyllabusResult.data?.caminho_arquivo;
  if (previousPath && previousPath !== storagePath) {
    const { error: cleanupError } = await supabase.storage.from("documentos-base").remove([previousPath]);
    if (cleanupError) storageWarning = `A nova ementa foi salva, mas o arquivo anterior não pôde ser removido: ${errorMessage(cleanupError)}`;
  }

  const { data: profile, error: profileError } = await supabase
    .from("professores")
    .select("nome_completo,nome_instituicao")
    .eq("id", user.id)
    .single();
  let headerWarning: string | null = null;
  let metadataWarning: string | null = null;
  if (profileError || !profile) {
    headerWarning = `A ementa foi salva, mas não foi possível preparar o cabeçalho padrão: ${errorMessage(profileError ?? { message: "perfil não encontrado" })}`;
  } else {
    const subject = subjectResult.data;
    const institution = (extraction.metadados.instituicao || profile.nome_instituicao || "").trim().slice(0, 160);
    const schoolLookup = supabase
      .from("pre_promptos")
      .select("id")
      .eq("professor_id", user.id)
      .eq("materia_id", subject.id);
    const { data: existingHeader, error: headerLookupError } = institution
      ? await schoolLookup.eq("nome_escola", institution).limit(1).maybeSingle()
      : await schoolLookup.is("nome_escola", null).limit(1).maybeSingle();
    if (headerLookupError) {
      headerWarning = `Os tópicos foram identificados, mas não foi possível verificar o cabeçalho padrão: ${errorMessage(headerLookupError)}`;
    } else if (!existingHeader) {
      const headerName = `Cabeçalho ${subject.nome.slice(0, 35)} (${subject.ano_letivo}) — ${(institution || "padrão").slice(0, 45)}`;
      const { error: headerInsertError } = await supabase.from("pre_promptos").insert({
        professor_id: user.id,
        materia_id: subject.id,
        nome: headerName,
        descricao: "Cabeçalho fixo para materiais desta matéria.",
        nome_escola: institution || null,
        nome_professor: profile.nome_completo || null,
        tipos_artefato: ["atividade", "prova"],
      });
      if (headerInsertError) {
        headerWarning = `Os tópicos foram identificados, mas o cabeçalho padrão não pôde ser salvo: ${errorMessage(headerInsertError)}`;
      }
    }
    if (
      extraction.metadados.materia &&
      normalizarNome(extraction.metadados.materia) !== normalizarNome(subject.nome)
    ) {
      metadataWarning = `O documento menciona “${extraction.metadados.materia}”, mas está vinculado à matéria “${subject.nome}”; o cabeçalho foi mantido vinculado à matéria selecionada.`;
    }
  }

  const aviso = [
    storageWarning,
    headerWarning,
    metadataWarning,
  ].filter((message): message is string => Boolean(message)).join(" ") || null;
  revalidatePath("/");
  return { data: { topicosCriados: extraction.topicos.length, aviso }, error: null };
}

export async function atualizarTopico(input: {
  topicoId: string;
  titulo: string;
  descricao: string;
  habilidades: string[];
}): Promise<ActionResult> {
  if (
    !isNonEmptyString(input?.topicoId) ||
    !isNonEmptyString(input?.titulo) ||
    input.titulo.trim().length > 200 ||
    typeof input.descricao !== "string" ||
    input.descricao.trim().length > 2000 ||
    !Array.isArray(input.habilidades) ||
    input.habilidades.length > 12 ||
    !input.habilidades.every((habilidade) => typeof habilidade === "string" && habilidade.trim().length <= 300)
  ) {
    return { data: null, error: "Confira o título, a descrição e as habilidades informadas para o tópico." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { error } = await supabase
    .from("topicos_ementa")
    .update({
      titulo: input.titulo.trim(),
      descricao: input.descricao.trim() || null,
      habilidades: input.habilidades.map((habilidade) => habilidade.trim()).filter(Boolean),
    })
    .eq("id", input.topicoId)
    .eq("professor_id", user.id);
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data: undefined, error: null };
}

export async function excluirTopico(topicoId: string): Promise<ActionResult> {
  if (!isNonEmptyString(topicoId)) return { data: null, error: "Selecione um tópico válido para excluir." };
  const { supabase, user } = await usuarioAutenticado();
  const { data, error } = await supabase
    .from("topicos_ementa")
    .delete()
    .eq("id", topicoId)
    .eq("professor_id", user.id)
    .select("id")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  if (!data) return { data: null, error: "O tópico não foi encontrado ou não pertence à sua conta." };
  revalidatePath("/");
  return { data: undefined, error: null };
}

export async function excluirEmenta(ementaId: string): Promise<ActionResult<SyllabusDeleteResult>> {
  if (!isNonEmptyString(ementaId)) return { data: null, error: "Selecione uma ementa válida para excluir." };
  const { supabase, user } = await usuarioAutenticado();
  const { data: ementa, error: lookupError } = await supabase
    .from("ementas")
    .select("id,caminho_arquivo")
    .eq("id", ementaId)
    .eq("professor_id", user.id)
    .single();
  if (lookupError) return { data: null, error: errorMessage(lookupError) };

  const { error: deleteError } = await supabase
    .from("ementas")
    .delete()
    .eq("id", ementa.id)
    .eq("professor_id", user.id);
  if (deleteError) return { data: null, error: errorMessage(deleteError) };

  let aviso: string | null = null;
  if (ementa.caminho_arquivo) {
    const { error: storageError } = await supabase.storage
      .from("documentos-base")
      .remove([ementa.caminho_arquivo]);
    if (storageError) {
      aviso = `A ementa e seus tópicos foram excluídos, mas o arquivo armazenado não pôde ser removido: ${errorMessage(storageError)}`;
    }
  }
  revalidatePath("/");
  return { data: { aviso }, error: null };
}

export async function criarPrePrompto(input: { nome: string }): Promise<ActionResult<TemplateRecord>> {
  if (!isNonEmptyString(input?.nome) || input.nome.trim().length > 120) {
    return { data: null, error: "Informe um nome de até 120 caracteres para o pré-prompto." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { data, error } = await supabase
    .from("pre_promptos")
    .insert({
      professor_id: user.id,
      nome: input.nome.trim(),
      tipos_artefato: ["roteiro_aula", "atividade", "prova"],
    })
    .select("id,materia_id,nome,descricao,ativo,tipos_artefato,nome_escola,nome_professor,instrucoes_fixas,colunas_layout,layout_compacto,familia_fonte,tamanho_fonte")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data, error: null };
}

export async function salvarCabecalho(input: {
  id?: string;
  materiaId: string;
  nome: string;
  nomeEscola: string;
  nomeProfessor: string;
}): Promise<ActionResult<TemplateRecord>> {
  if (
    !isNonEmptyString(input?.materiaId) ||
    !isNonEmptyString(input?.nome) ||
    input.nome.trim().length > 120 ||
    (typeof input.nomeEscola !== "string" || input.nomeEscola.trim().length > 160) ||
    (typeof input.nomeProfessor !== "string" || input.nomeProfessor.trim().length > 160)
  ) {
    return { data: null, error: "Confira o nome do cabeçalho e os campos de instituição e professor." };
  }
  if (input.id !== undefined && !isNonEmptyString(input.id)) {
    return { data: null, error: "O cabeçalho selecionado é inválido." };
  }

  const { supabase, user } = await usuarioAutenticado();
  const { data: subject, error: subjectError } = await supabase
    .from("materias")
    .select("id")
    .eq("id", input.materiaId)
    .eq("professor_id", user.id)
    .single();
  if (subjectError) return { data: null, error: errorMessage(subjectError) };
  if (!subject) return { data: null, error: "A matéria selecionada não pertence à sua conta." };

  const values = {
    materia_id: subject.id,
    nome: input.nome.trim(),
    nome_escola: input.nomeEscola.trim() || null,
    nome_professor: input.nomeProfessor.trim() || null,
  };
  const query = input.id
    ? supabase.from("pre_promptos").update(values).eq("id", input.id).eq("professor_id", user.id).eq("materia_id", subject.id)
    : supabase.from("pre_promptos").insert({
        professor_id: user.id,
        ...values,
        descricao: "Cabeçalho fixo para materiais desta matéria.",
        tipos_artefato: ["atividade", "prova"],
      });
  const { data, error } = await query
    .select("id,materia_id,nome,descricao,ativo,tipos_artefato,nome_escola,nome_professor,instrucoes_fixas,colunas_layout,layout_compacto,familia_fonte,tamanho_fonte")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data, error: null };
}

export async function alterarPrePromptoConteudo(input: {
  id: string;
  nome: string;
  descricao: string;
  instrucoesFixas: string;
}): Promise<ActionResult> {
  if (
    !isNonEmptyString(input?.id) ||
    !isNonEmptyString(input?.nome) ||
    input.nome.trim().length > 120 ||
    typeof input.descricao !== "string" ||
    input.descricao.trim().length > 500 ||
    typeof input.instrucoesFixas !== "string" ||
    input.instrucoesFixas.trim().length > 4000
  ) {
    return { data: null, error: "Confira o nome, a descrição e as instruções do pré-prompto." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { data, error } = await supabase
    .from("pre_promptos")
    .update({
      nome: input.nome.trim(),
      descricao: input.descricao.trim() || null,
      instrucoes_fixas: input.instrucoesFixas.trim() || null,
    })
    .eq("id", input.id)
    .eq("professor_id", user.id)
    .is("materia_id", null)
    .select("id")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  if (!data) return { data: null, error: "O pré-prompto não foi encontrado." };
  revalidatePath("/");
  return { data: undefined, error: null };
}

export async function excluirPrePrompto(id: string): Promise<ActionResult> {
  if (!isNonEmptyString(id)) return { data: null, error: "Selecione um pré-prompto válido para excluir." };
  const { supabase, user } = await usuarioAutenticado();
  const { data, error } = await supabase
    .from("pre_promptos")
    .delete()
    .eq("id", id)
    .eq("professor_id", user.id)
    .select("id")
    .single();
  if (error) return { data: null, error: errorMessage(error) };
  if (!data) return { data: null, error: "O pré-prompto não foi encontrado ou não pertence à sua conta." };
  revalidatePath("/");
  return { data: undefined, error: null };
}

export async function alterarPrePrompto(input: { id: string; ativo: boolean }): Promise<ActionResult> {
  if (!isNonEmptyString(input?.id) || typeof input.ativo !== "boolean") {
    return { data: null, error: "O pré-prompto selecionado é inválido." };
  }
  const { supabase, user } = await usuarioAutenticado();
  const { error } = await supabase
    .from("pre_promptos")
    .update({ ativo: input.ativo })
    .eq("id", input.id)
    .eq("professor_id", user.id)
    .is("materia_id", null);
  if (error) return { data: null, error: errorMessage(error) };
  revalidatePath("/");
  return { data: undefined, error: null };
}

export type MaterialGerado = {
  id: string;
  titulo: string;
  tipo: TipoMaterial;
  conteudo: Record<string, unknown>;
  cabecalho: {
    instituicao: string;
    materia: string;
    professor: string;
    topicos: string[];
  };
};

function textoDoMaterial(value: unknown, heading = ""): string {
  if (Array.isArray(value)) {
    return value.map((item, index) => textoDoMaterial(item, `${heading}${heading ? " " : ""}${index + 1}`)).join("\n\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => textoDoMaterial(item, key.replaceAll(/([A-Z])/g, " $1")))
      .join("\n\n");
  }
  const content = typeof value === "string" ? value : value == null ? "" : String(value);
  return heading ? `${heading.charAt(0).toUpperCase()}${heading.slice(1)}\n${content}` : content;
}

export async function gerarMaterialComIA(input: {
  materiaId: string;
  topicoIds: string[];
  prePromptoId: string | null;
  cabecalhoId: string | null;
  tipo: TipoMaterial;
}): Promise<ActionResult<MaterialGerado>> {
  if (
    !isNonEmptyString(input?.materiaId) ||
    !Array.isArray(input.topicoIds) ||
    input.topicoIds.length === 0 ||
    !input.topicoIds.every(isNonEmptyString) ||
    !["roteiro_aula", "atividade", "prova"].includes(input.tipo)
  ) {
    return { data: null, error: "Selecione a matéria, pelo menos um tópico e o tipo de material." };
  }
  const requiresHeader = input.tipo === "atividade" || input.tipo === "prova";
  if (requiresHeader && !isNonEmptyString(input.cabecalhoId)) {
    return { data: null, error: "Selecione um cabeçalho da matéria para gerar atividades ou provas." };
  }
  const topicIds = [...new Set(input.topicoIds)];
  const { supabase, user } = await usuarioAutenticado();

  const { data: topicRecords, error: topicError } = await supabase
    .from("topicos_ementa")
    .select("id,materia_id,ementa_id,titulo,descricao,habilidades")
    .in("id", topicIds)
    .eq("materia_id", input.materiaId)
    .eq("professor_id", user.id)
    .order("ordem");
  if (topicError) return { data: null, error: errorMessage(topicError) };
  if (!topicRecords || topicRecords.length !== topicIds.length) {
    return { data: null, error: "Um ou mais tópicos não pertencem à matéria selecionada." };
  }
  const topicById = new Map(topicRecords.map((item) => [item.id, item]));
  const selectedTopics = topicIds.map((id) => topicById.get(id)).filter((item) => item !== undefined);
  if (!selectedTopics.length) return { data: null, error: "Selecione pelo menos um tópico válido." };

  const syllabusId = selectedTopics[0].ementa_id;
  if (!selectedTopics.every((topic) => topic.ementa_id === syllabusId)) {
    return { data: null, error: "Os tópicos selecionados precisam pertencer à mesma ementa." };
  }
  const [subjectResult, syllabusResult, profileResult] = await Promise.all([
    supabase.from("materias").select("id,nome,ano_letivo").eq("id", input.materiaId).eq("professor_id", user.id).single(),
    supabase.from("ementas").select("id,titulo,texto_extraido,periodo,caminho_arquivo,tipo_mime,nome_arquivo").eq("id", syllabusId).eq("materia_id", input.materiaId).eq("professor_id", user.id).single(),
    supabase.from("professores").select("nome_completo,nome_instituicao").eq("id", user.id).single(),
  ]);
  const contextError = subjectResult.error ?? syllabusResult.error ?? profileResult.error;
  if (contextError) return { data: null, error: errorMessage(contextError) };
  if (!subjectResult.data || !profileResult.data || !syllabusResult.data) {
    return { data: null, error: "Não foi possível montar o contexto completo para a geração." };
  }
  const subject = subjectResult.data;
  const profile = profileResult.data;
  const syllabus = syllabusResult.data;
  const documentTexts: string[] = [];
  const documentsPdf: { mimeType: "application/pdf"; data: string }[] = [];
  if (syllabus.texto_extraido?.trim()) {
    documentTexts.push(`Ementa: ${syllabus.titulo}\n${syllabus.texto_extraido.slice(0, 60_000)}`);
  } else if (syllabus.caminho_arquivo) {
    const { data: sourceFile, error } = await supabase.storage
      .from("documentos-base")
      .download(syllabus.caminho_arquivo);
    if (error) return { data: null, error: `Não foi possível ler o documento-base “${syllabus.titulo}”: ${error.message}` };
    if (sourceFile.size > 20 * 1024 * 1024) {
      return { data: null, error: "O documento-base deve ter no máximo 20 MB para ser usado pela IA." };
    }

    const sourceBytes = Buffer.from(await sourceFile.arrayBuffer());
    if (syllabus.tipo_mime === "application/pdf") {
      if (sourceBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return { data: null, error: `O documento “${syllabus.titulo}” não parece ser um PDF válido.` };
      }
      documentsPdf.push({ mimeType: "application/pdf", data: sourceBytes.toString("base64") });
    } else if (syllabus.tipo_mime === "text/plain") {
      const text = new TextDecoder().decode(sourceBytes).slice(0, 60_000);
      if (text.trim()) documentTexts.push(`Ementa: ${syllabus.titulo}\n${text}`);
    } else if (syllabus.tipo_mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      let extractedText: string;
      try {
        extractedText = (await mammoth.extractRawText({ buffer: sourceBytes })).value;
      } catch {
        return { data: null, error: `Não foi possível extrair o texto do DOCX “${syllabus.titulo}”. Verifique se o arquivo está íntegro.` };
      }
      const text = extractedText.slice(0, 60_000);
      if (!text.trim()) {
        return { data: null, error: `O DOCX “${syllabus.titulo}” não contém texto legível para usar como referência da IA.` };
      }
      documentTexts.push(`Ementa: ${syllabus.titulo}\n${text}`);
    } else if (syllabus.tipo_mime === "application/msword") {
      return { data: null, error: `Para usar “${syllabus.titulo}” na geração por IA, salve o arquivo DOC como DOCX ou PDF.` };
    }
  }
  const trechoDocumento = documentTexts.join("\n\n").slice(0, 60_000);

  let preset: {
    id: string;
    nome: string;
    descricao: string | null;
    nome_escola: string | null;
    nome_professor: string | null;
    instrucoes_fixas: string | null;
    colunas_layout: number;
    layout_compacto: boolean;
    familia_fonte: string;
    tamanho_fonte: number;
  } | null = null;
  if (input.prePromptoId) {
    const { data, error } = await supabase
      .from("pre_promptos")
      .select("id,nome,descricao,nome_escola,nome_professor,instrucoes_fixas,colunas_layout,layout_compacto,familia_fonte,tamanho_fonte,ativo,tipos_artefato")
      .eq("id", input.prePromptoId)
      .eq("professor_id", user.id)
      .is("materia_id", null)
      .single();
    if (error) return { data: null, error: errorMessage(error) };
    if (!data.ativo || !data.tipos_artefato.includes(input.tipo)) {
      return { data: null, error: "O pré-prompto escolhido está inativo ou não se aplica a este material." };
    }
    preset = data;
  }

  let header: {
    id: string;
    nome: string;
    nome_escola: string | null;
    nome_professor: string | null;
  } | null = null;
  if (requiresHeader && input.cabecalhoId) {
    const { data, error } = await supabase
      .from("pre_promptos")
      .select("id,nome,nome_escola,nome_professor")
      .eq("id", input.cabecalhoId)
      .eq("professor_id", user.id)
      .eq("materia_id", subject.id)
      .single();
    if (error) return { data: null, error: errorMessage(error) };
    header = data;
  }
  const cabecalho = requiresHeader
    ? {
      instituicao: header?.nome_escola || profile.nome_instituicao || "",
      materia: subject.nome,
      professor: header?.nome_professor || profile.nome_completo,
    }
    : { instituicao: "", materia: "", professor: "" };

  let resultado: Awaited<ReturnType<typeof gerarConteudoPedagogico>>;
  try {
    resultado = await gerarConteudoPedagogico(input.tipo, {
      professor: cabecalho.professor,
      instituicao: cabecalho.instituicao,
      materia: `${subject.nome} (${subject.ano_letivo})`,
      topicos: selectedTopics.map((topic) => ({
        titulo: topic.titulo,
        descricao: topic.descricao ?? "",
        habilidades: Array.isArray(topic.habilidades)
          ? topic.habilidades.filter((item): item is string => typeof item === "string")
          : [],
      })),
      ementa: [syllabus.titulo, syllabus.periodo].filter(Boolean).join(" · "),
      trechoDocumento,
      documentoPdfAnexado: documentsPdf.length > 0,
      instrucoesProfessor: preset?.instrucoes_fixas ?? "",
      layout: preset
        ? `${preset.colunas_layout} coluna(s), ${preset.layout_compacto ? "compacto" : "padrão"}, fonte ${preset.familia_fonte} ${preset.tamanho_fonte}pt`
        : "padrão legível, adequado para impressão escolar",
    }, documentsPdf);
  } catch (error) {
    if (error instanceof Error && error.message === "IA_KEY_MISSING") {
      return { data: null, error: "A IA ainda não foi configurada. Adicione GEMINI_API_KEY às variáveis de ambiente do servidor e reinicie o app." };
    }
    if (error instanceof Error && error.message === "IA_AUTH_FAILED") {
      return { data: null, error: "O Gemini recusou a chave de API. Confira GEMINI_API_KEY no ambiente do servidor e reinicie o app." };
    }
    if (error instanceof Error && error.message === "IA_QUOTA_EXCEEDED") {
      return { data: null, error: "A cota do Gemini foi excedida ou o faturamento não está habilitado. Confira o uso e os limites no Google AI Studio." };
    }
    if (error instanceof Error && error.message === "IA_MODEL_NOT_FOUND") {
      return { data: null, error: "Nenhum dos modelos de geração configurados foi encontrado na API de interações do Gemini. Confira GEMINI_MODEL no ambiente do servidor." };
    }
    if (error instanceof Error && error.message === "IA_BAD_REQUEST") {
      return { data: null, error: "O Gemini rejeitou a solicitação. Verifique se o modelo aceita JSON estruturado e PDFs, e se o documento não é grande demais." };
    }
    if (error instanceof Error && error.message === "IA_PROVIDER_UNAVAILABLE") {
      return { data: null, error: "Os modelos Gemini estão temporariamente indisponíveis. O sistema tentou o modelo principal e uma alternativa; aguarde um instante e tente novamente." };
    }
    if (error instanceof Error && error.message === "IA_CONNECTION_FAILED") {
      return { data: null, error: "Não foi possível conectar ao Gemini. Verifique a conexão do servidor e tente novamente." };
    }
    if (error instanceof Error && error.message === "IA_EMPTY_RESPONSE") {
      return { data: null, error: "O Gemini não gerou conteúdo para esta solicitação. Revise o tópico ou documento-base e tente novamente." };
    }
    if (error instanceof Error && error.message === "IA_INVALID_JSON") {
      return { data: null, error: "A IA retornou uma resposta fora do formato esperado. Tente gerar novamente." };
    }
    if (error instanceof Error && error.message.startsWith("IA_INVALID_CONTENT:")) {
      return { data: null, error: `A resposta não passou pela validação pedagógica: ${error.message.slice("IA_INVALID_CONTENT:".length)}` };
    }
    throw error;
  }

  const conteudo = resultado.conteudo;
  const titulo = typeof conteudo.titulo === "string" ? conteudo.titulo : "Material didático";
  const { data: artifact, error: artifactError } = await supabase
    .from("artefatos")
    .insert({
      professor_id: user.id,
      materia_id: input.materiaId,
      ementa_id: syllabusId,
      pre_prompto_id: header?.id ?? preset?.id ?? null,
      tipo: input.tipo,
      situacao: "gerado",
      titulo,
      conteudo,
      texto_formatado: textoDoMaterial(conteudo),
      gabarito: conteudo.gabaritoComentado ?? null,
      rubrica: conteudo.rubrica ?? null,
      snapshot_pre_prompto: {
        ...(preset
          ? {
            nome: preset.nome,
            descricao: preset.descricao,
            instrucoes_fixas: preset.instrucoes_fixas,
            colunas_layout: preset.colunas_layout,
            layout_compacto: preset.layout_compacto,
            familia_fonte: preset.familia_fonte,
            tamanho_fonte: preset.tamanho_fonte,
          }
          : {}),
        cabecalho: {
          id: header?.id ?? null,
          nome: header?.nome ?? null,
          ...cabecalho,
        },
        topicos: selectedTopics.map((topic) => ({ id: topic.id, titulo: topic.titulo })),
      },
      versao: null,
      modelo_geracao: resultado.modelo,
      metadados_geracao: { provedor: "Google Gemini", ...resultado.uso },
      gerado_em: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (artifactError) return { data: null, error: errorMessage(artifactError) };

  const { error: linkError } = await supabase.from("artefatos_topicos").insert(
    selectedTopics.map((topic) => ({
      professor_id: user.id,
      artefato_id: artifact.id,
      topico_id: topic.id,
      materia_id: subject.id,
    })),
  );
  if (linkError) {
    const { error: cleanupError } = await supabase
      .from("artefatos")
      .delete()
      .eq("id", artifact.id)
      .eq("professor_id", user.id);
    if (cleanupError) {
      return { data: null, error: `${linkError.message} O artefato criado também não pôde ser removido: ${cleanupError.message}` };
    }
    return { data: null, error: errorMessage(linkError) };
  }
  return {
    data: {
      id: artifact.id,
      titulo,
      tipo: input.tipo,
      conteudo,
      cabecalho: { ...cabecalho, topicos: selectedTopics.map((topic) => topic.titulo) },
    },
    error: null,
  };
}

const allowedResponseTypes = new Set([
  ...allowedSourceTypes,
  "image/jpeg",
  "image/png",
]);

export async function criarCorrecao(formData: FormData): Promise<ActionResult> {
  const artifactId = formData.get("artefatoId");
  const studentLabel = formData.get("identificacaoAluno");
  const responseText = formData.get("textoResposta");
  const file = formData.get("arquivo");
  if (!isNonEmptyString(artifactId)) return { data: null, error: "Selecione a prova que deseja corrigir." };
  const response = isNonEmptyString(responseText) ? responseText.trim() : null;
  const hasFile = file instanceof File && file.size > 0;
  if (!response && !hasFile) return { data: null, error: "Informe as respostas ou envie um arquivo." };

  const { supabase, user } = await usuarioAutenticado();
  let storagePath: string | null = null;
  if (hasFile && file instanceof File) {
    if (file.size > maxUploadBytes) return { data: null, error: "O arquivo deve ter no máximo 25 MB." };
    if (!allowedResponseTypes.has(file.type)) {
      return { data: null, error: "Envie um PDF, DOC, DOCX, TXT, JPG ou PNG." };
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("respostas-avaliacao")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) return { data: null, error: errorMessage(uploadError) };
  }

  const { error } = await supabase.from("correcoes").insert({
    professor_id: user.id,
    artefato_id: artifactId,
    identificacao_aluno: isNonEmptyString(studentLabel) ? studentLabel.trim() : null,
    texto_resposta: response,
    caminho_resposta: storagePath,
  });
  if (error) {
    if (storagePath) {
      const { error: cleanupError } = await supabase.storage.from("respostas-avaliacao").remove([storagePath]);
      if (cleanupError) {
        return { data: null, error: `${error.message} O arquivo temporário também não pôde ser removido: ${cleanupError.message}` };
      }
    }
    return { data: null, error: errorMessage(error) };
  }
  revalidatePath("/");
  return { data: undefined, error: null };
}
