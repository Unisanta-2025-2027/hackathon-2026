import { ApiError, GoogleGenAI } from "@google/genai";
import { criarPromptPedagogico, type ContextoPedagogico, type TipoMaterial } from "./prompts";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type ConteudoGerado = { [key: string]: JsonValue };
export type DocumentoPdf = { mimeType: "application/pdf"; data: string };

const modeloPadrao = "gemini-3-flash-preview";
const modelosReserva = ["gemini-3-flash-preview", "gemini-3.8-flash"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is ConteudoGerado {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function listOfRecords(value: unknown, min: number, max = Number.POSITIVE_INFINITY) {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every(isRecord);
}

function questionsHaveValidPoints(questions: unknown, expectedTotal: number) {
  if (!Array.isArray(questions) || !questions.every((question) => isRecord(question) && typeof question.pontos === "number")) {
    return false;
  }
  const total = questions.reduce(
    (sum, question) => sum + (isRecord(question) && typeof question.pontos === "number" ? question.pontos : 0),
    0,
  );
  return Math.abs(total - expectedTotal) < 0.01;
}

function validateConteudo(tipo: TipoMaterial, value: unknown): string[] {
  if (!isRecord(value) || !isNonEmptyString(value.titulo)) {
    return ["O objeto precisa ter título."];
  }

  if (tipo === "roteiro_aula") {
    if (!stringArray(value.objetivosAprendizagem)) return ["Inclua objetivos de aprendizagem observáveis."];
    if (!listOfRecords(value.etapas, 4)) return ["O roteiro precisa ter pelo menos quatro etapas de aula."];
    const etapas = value.etapas as Array<Record<string, unknown>>;
    const durationsValid = etapas.every((step) =>
      typeof step.duracaoMinutos === "number" &&
      isNonEmptyString(step.acaoDocente) &&
      isNonEmptyString(step.acaoEstudantes) &&
      isNonEmptyString(step.checagemCompreensao),
    );
    const totalDuration = etapas.reduce((sum, step) => sum + (typeof step.duracaoMinutos === "number" ? step.duracaoMinutos : 0), 0);
    if (!durationsValid || typeof value.duracaoMinutos !== "number" || totalDuration !== value.duracaoMinutos) {
      return ["Cada etapa precisa ter docente, estudantes, checagem e duração; a soma deve fechar a duração da aula."];
    }
    if (!listOfRecords(value.avaliacaoFormativa, 1)) return ["Inclua evidências de avaliação formativa."];
    if (!stringArray(value.materiais) || !stringArray(value.diferenciacaoEInclusao)) {
      return ["Inclua materiais e estratégias de diferenciação e inclusão."];
    }
    return [];
  }

  if (tipo === "atividade") {
    if (!listOfRecords(value.questoes, 4, 6)) return ["A atividade precisa ter de quatro a seis questões."];
    if (!listOfRecords(value.gabaritoComentado, 4)) return ["Inclua um gabarito comentado para cada questão."];
    const questions = value.questoes as unknown[];
    const answerKey = value.gabaritoComentado as unknown[];
    if (answerKey.length !== questions.length) {
      return ["Inclua um gabarito comentado para cada questão."];
    }
    if (!stringArray(value.instrucoesAoEstudante)) return ["Inclua instruções claras para os estudantes."];
    return [];
  }

  if (
    typeof value.totalPontos !== "number" ||
    !isRecord(value.versoes) ||
    !isRecord(value.versoes.A) ||
    !isRecord(value.versoes.B) ||
    !isRecord(value.gabaritoComentado)
  ) {
    return ["A prova precisa incluir duas versões e gabaritos comentados."];
  }
  const versionA = value.versoes.A.questoes;
  const versionB = value.versoes.B.questoes;
  if (!listOfRecords(versionA, 5, 8) || !listOfRecords(versionB, 5, 8)) {
    return ["Cada versão da prova precisa conter de cinco a oito questões."];
  }
  const questionsA = versionA as unknown[];
  const questionsB = versionB as unknown[];
  if (!questionsHaveValidPoints(questionsA, value.totalPontos) || !questionsHaveValidPoints(questionsB, value.totalPontos)) {
    return ["A soma dos pontos das questões das versões A e B precisa corresponder ao total da prova."];
  }
  const answerA = value.gabaritoComentado.A;
  const answerB = value.gabaritoComentado.B;
  if (
    !Array.isArray(answerA) ||
    !Array.isArray(answerB) ||
    answerA.length !== questionsA.length ||
    answerB.length !== questionsB.length
  ) {
    return ["Inclua o gabarito comentado de cada questão das duas versões."];
  }
  if (
    !Array.isArray(value.rubrica) ||
    value.rubrica.length === 0 ||
    !value.rubrica.every((criterion) => isRecord(criterion) && typeof criterion.maximoPontos === "number")
  ) {
    return ["Inclua uma rubrica de correção."];
  }
  const rubricTotal = value.rubrica.reduce(
    (sum, criterion) => sum + (isRecord(criterion) && typeof criterion.maximoPontos === "number" ? criterion.maximoPontos : 0),
    0,
  );
  if (Math.abs(rubricTotal - value.totalPontos) >= 0.01) return ["A soma máxima da rubrica deve corresponder ao total da prova."];
  if (!stringArray(value.instrucoesAoEstudante)) return ["Inclua instruções claras para a avaliação."];
  return [];
}

function parseConteudo(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A resposta da IA não contém um objeto JSON.");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export async function gerarConteudoPedagogico(
  tipo: TipoMaterial,
  contexto: ContextoPedagogico,
  documentoPdf?: DocumentoPdf | DocumentoPdf[],
): Promise<{ conteudo: ConteudoGerado; modelo: string; uso: Record<string, number> }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("IA_KEY_MISSING");

  let modelName = process.env.GEMINI_MODEL?.trim() || modeloPadrao;
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 1 } },
  });
  const prompt = criarPromptPedagogico(tipo, contexto);
  const documentosPdf = documentoPdf
    ? Array.isArray(documentoPdf) ? documentoPdf : [documentoPdf]
    : [];
  const gerarInteracao = (model: string, userPrompt: string) => ai.interactions.create({
    model,
    input: documentosPdf.length
      ? [
          { type: "text" as const, text: userPrompt },
          ...documentosPdf.map((documento) => ({
            type: "document" as const,
            data: documento.data,
            mime_type: documento.mimeType,
          })),
        ]
      : userPrompt,
    system_instruction: prompt.systemInstruction,
    store: false,
    response_format: { type: "text", mime_type: "application/json" },
    generation_config: {
      max_output_tokens: 12000,
      thinking_level: "low",
    },
    stream: false,
  });

  const extrairConteudoValidado = (text: string) => {
    let conteudo: unknown;
    try {
      conteudo = parseConteudo(text);
    } catch {
      throw new Error("IA_INVALID_JSON");
    }
    const validationErrors = validateConteudo(tipo, conteudo);
    if (validationErrors.length) {
      throw new Error(`IA_INVALID_CONTENT:${validationErrors.join(" ")}`);
    }
    if (!isJsonObject(conteudo)) throw new Error("IA_INVALID_CONTENT: resposta contém tipos inválidos");
    return conteudo;
  };

  let usage = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
  };
  const traduzirErroApi = (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.status === 400) return new Error("IA_BAD_REQUEST");
      if (error.status === 401 || error.status === 403) return new Error("IA_AUTH_FAILED");
      if (error.status === 404) return new Error("IA_MODEL_NOT_FOUND");
      if (error.status === 429) return new Error("IA_QUOTA_EXCEEDED");
      if (error.status >= 500) return new Error("IA_PROVIDER_UNAVAILABLE");
    }
    return new Error("IA_CONNECTION_FAILED");
  };

  try {
    const modelos = [...new Set([modelName, ...modelosReserva])];
    let interaction: Awaited<ReturnType<typeof gerarInteracao>> | undefined;
    let lastModelError: unknown;
    for (const model of modelos) {
      try {
        interaction = await gerarInteracao(model, prompt.userPrompt);
        modelName = model;
        break;
      } catch (error) {
        if (!(error instanceof ApiError) || (error.status !== 404 && error.status < 500)) {
          throw traduzirErroApi(error);
        }
        lastModelError = error;
      }
    }
    if (!interaction) throw traduzirErroApi(lastModelError);

    const adicionarUso = (metadata: typeof interaction.usage) => {
      if (!metadata) return;
      usage = {
        promptTokenCount: usage.promptTokenCount + (metadata.total_input_tokens ?? 0),
        candidatesTokenCount: usage.candidatesTokenCount + (metadata.total_output_tokens ?? 0),
        totalTokenCount: usage.totalTokenCount + (metadata.total_tokens ?? 0),
      };
    };
    adicionarUso(interaction.usage);

    let conteudo: ConteudoGerado | undefined;
    let respostaAtual = interaction.output_text ?? "";
    const limiteCorrecoes = 2;
    const regrasDeCorrecao = tipo === "prova"
      ? "Confira especialmente: versões A e B com 5 a 8 questões cada; um gabarito em lista para cada questão de cada versão; soma dos pontos das questões de cada versão igual a totalPontos; soma de rubrica[].maximoPontos exatamente igual a totalPontos; instruções ao estudante."
      : tipo === "atividade"
        ? "Confira especialmente: 4 a 6 questões e exatamente um item de gabaritoComentado para cada questão; instruções ao estudante."
        : "Confira especialmente: objetivos de aprendizagem, pelo menos quatro etapas completas, soma das durações igual à duração total, avaliação formativa, materiais e diferenciação/inclusão.";

    for (let tentativa = 0; tentativa <= limiteCorrecoes; tentativa += 1) {
      if (!respostaAtual.trim()) throw new Error("IA_EMPTY_RESPONSE");
      try {
        conteudo = extrairConteudoValidado(respostaAtual);
        break;
      } catch (error) {
        const podeCorrigir =
          error instanceof Error &&
          (error.message.startsWith("IA_INVALID_CONTENT:") || error.message === "IA_INVALID_JSON");
        if (!podeCorrigir || tentativa === limiteCorrecoes) throw error;

        const problemas = error.message === "IA_INVALID_JSON"
          ? "A resposta anterior não era um JSON válido."
          : error.message.slice("IA_INVALID_CONTENT:".length);
        const promptCorrecao = `${prompt.userPrompt}

CORREÇÃO OBRIGATÓRIA DA RESPOSTA ANTERIOR (tentativa ${tentativa + 1} de ${limiteCorrecoes})
A tentativa anterior falhou nestas validações: ${problemas}
${regrasDeCorrecao}
Corrija todos os problemas e devolva o objeto JSON COMPLETO. Preserve o conteúdo correto, não omita campos e confira os totais numéricos antes de responder.`;
        const interactionCorrigida = await gerarInteracao(modelName, promptCorrecao);
        adicionarUso(interactionCorrigida.usage);
        respostaAtual = interactionCorrigida.output_text ?? "";
      }
    }

    if (!conteudo) throw new Error("IA_INVALID_CONTENT: não foi possível corrigir a resposta após duas tentativas.");

    return {
      conteudo,
      modelo: modelName,
      uso: usage,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "IA_BAD_REQUEST",
        "IA_AUTH_FAILED",
        "IA_EMPTY_RESPONSE",
        "IA_INVALID_JSON",
        "IA_MODEL_NOT_FOUND",
        "IA_QUOTA_EXCEEDED",
        "IA_PROVIDER_UNAVAILABLE",
        "IA_CONNECTION_FAILED",
      ].includes(error.message) ||
      (error instanceof Error && error.message.startsWith("IA_INVALID_CONTENT:"))
    ) {
      throw error;
    }
    throw traduzirErroApi(error);
  }
}
