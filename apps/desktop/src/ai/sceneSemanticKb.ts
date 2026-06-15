import type { SceneDraftEntityKind } from "./sceneDraft";

export type SceneSemanticMatchType =
  | "entity-kind"
  | "material-property"
  | "relationship"
  | "relationship-pattern"
  | "scene-template"
  | "support"
  | "unsupported";

export type SceneSemanticMatch = {
  canonical: Record<string, unknown>;
  confidence: number;
  id: string;
  matchStrategy: "alias" | "vector";
  matchedAlias: string;
  priority: number;
  similarity?: number;
  type: SceneSemanticMatchType;
};

export type SceneSemanticContext = {
  embedding: {
    dimensions: number;
    provider: "local-hash-ngram";
    version: 1;
  };
  matches: SceneSemanticMatch[];
  version: 1;
};

type SceneSemanticEntry = {
  aliases: string[];
  canonical: Record<string, unknown>;
  confidence: number;
  id: string;
  priority: number;
  type: SceneSemanticMatchType;
  vectorExamples?: string[];
  vectorThreshold?: number;
};

const LOCAL_EMBEDDING_DIMENSIONS = 64;

const SEMANTIC_ENTRIES: SceneSemanticEntry[] = [
  {
    aliases: ["小球", "圆球", "球体", "钢球", "小钢球", "球"],
    canonical: { kind: "ball" satisfies SceneDraftEntityKind },
    confidence: 0.96,
    id: "entity.ball",
    priority: 100,
    type: "entity-kind",
    vectorExamples: [
      "圆形小物体从高处释放",
      "圆形物体在空中运动",
      "光滑圆形物体沿轨道运动",
    ],
    vectorThreshold: 0.72,
  },
  {
    aliases: ["木块", "滑块", "物块", "小车", "方块"],
    canonical: { kind: "block" satisfies SceneDraftEntityKind },
    confidence: 0.94,
    id: "entity.block",
    priority: 95,
    type: "entity-kind",
    vectorExamples: ["滑动物体沿斜面下滑", "矩形物体在水平面上运动", "运动小车连接弹簧"],
    vectorThreshold: 0.72,
  },
  {
    aliases: ["斜面", "斜坡", "倾斜轨道", "斜轨道"],
    canonical: {
      entity: {
        kind: "board" satisfies SceneDraftEntityKind,
        locked: true,
      },
      role: "incline",
    },
    confidence: 0.93,
    id: "support.incline",
    priority: 92,
    type: "support",
    vectorExamples: ["倾斜支撑面", "坡面轨道", "物体沿坡面下滑"],
    vectorThreshold: 0.7,
  },
  {
    aliases: ["地面", "水平地面", "水平面", "地板", "水平地板", "水平轨道", "水平桌面"],
    canonical: {
      entity: {
        angleDegrees: 0,
        kind: "board" satisfies SceneDraftEntityKind,
        locked: true,
      },
      role: "ground",
    },
    confidence: 0.95,
    id: "support.ground",
    priority: 90,
    type: "support",
    vectorExamples: ["水平支撑面", "底部承托平面", "平直承载轨道"],
    vectorThreshold: 0.7,
  },
  {
    aliases: ["光滑", "无摩擦", "摩擦不计", "忽略摩擦"],
    canonical: { friction: 0 },
    confidence: 0.96,
    id: "property.smooth",
    priority: 86,
    type: "material-property",
    vectorExamples: ["没有摩擦阻力", "接触面不计摩擦", "表面非常光滑"],
    vectorThreshold: 0.74,
  },
  {
    aliases: ["粗糙", "有摩擦", "摩擦因数", "动摩擦因数"],
    canonical: { friction: "nonzero" },
    confidence: 0.9,
    id: "property.rough",
    priority: 82,
    type: "material-property",
    vectorExamples: ["接触面存在阻力", "表面不光滑", "摩擦作用明显"],
    vectorThreshold: 0.74,
  },
  {
    aliases: ["在水平面上", "在光滑水平面", "在水平轨道上", "在地面上", "放在", "置于", "在斜面上", "沿斜面", "从斜面滑下"],
    canonical: { relationship: "place-on" },
    confidence: 0.9,
    id: "relationship.place_on",
    priority: 87,
    type: "relationship",
    vectorExamples: ["物体放在支撑面上", "木块沿斜面滑下", "小车在水平面上运动"],
    vectorThreshold: 0.74,
  },
  {
    aliases: ["用弹簧连接", "弹簧连接两个", "之间用弹簧连接", "之间连接弹簧", "两端连接弹簧", "弹簧连接"],
    canonical: { relationship: "spring-between" },
    confidence: 0.92,
    id: "relationship.spring_between",
    priority: 86,
    type: "relationship",
    vectorExamples: ["两个物体之间用弹簧连接", "木块之间连接弹簧", "小车和物块由弹簧相连"],
    vectorThreshold: 0.74,
  },
  {
    aliases: ["弹簧一端固定", "一端固定另一端连接", "一端固定，另一端连接", "固定端弹簧", "弹簧固定端"],
    canonical: { relationship: "contact-spring-end" },
    confidence: 0.93,
    id: "relationship.fixed_spring_end",
    priority: 89,
    type: "relationship",
    vectorExamples: ["弹簧一端固定另一端连接小车", "固定端弹簧拉着物体运动", "一端固定的弹簧连接滑块"],
    vectorThreshold: 0.74,
  },
  {
    aliases: ["自由落体", "落体", "下落", "落下", "从高处释放", "从高处由静止释放"],
    canonical: { template: "free-fall" },
    confidence: 0.92,
    id: "template.free_fall",
    priority: 84,
    type: "scene-template",
    vectorExamples: ["从高处释放后竖直下落", "物体在重力作用下落下", "从空中静止释放"],
    vectorThreshold: 0.72,
  },
  {
    aliases: ["弹性碰撞", "完全弹性碰撞", "弹性正碰", "完全弹性正碰", "正碰"],
    canonical: {
      restitution: 1,
      template: "elastic-collision",
    },
    confidence: 0.92,
    id: "template.elastic_collision",
    priority: 84,
    type: "scene-template",
    vectorExamples: ["两个物体发生完全弹性正碰", "两球碰后动能守恒", "质量相同的小球正碰"],
    vectorThreshold: 0.72,
  },
  {
    aliases: ["弹簧连接", "连接弹簧", "弹簧一端固定", "弹簧振子", "简谐运动"],
    canonical: { template: "spring-cart" },
    confidence: 0.9,
    id: "template.spring_cart",
    priority: 80,
    type: "scene-template",
    vectorExamples: ["弹簧带动物体往复运动", "固定弹簧推动小车振动", "弹簧振子在水平面运动"],
    vectorThreshold: 0.72,
  },
  {
    aliases: [
      "一小段光滑圆弧连接",
      "一小段光滑圆弧链接",
      "一小段平滑轨道",
      "一小段光滑轨道",
      "光滑圆弧连接",
      "光滑圆弧链接",
      "平滑轨道连接",
      "平滑圆弧连接",
      "圆弧过渡",
      "平滑圆弧连接",
    ],
    canonical: {
      defaults: {
        friction: 0,
        sweepAngleDegrees: 90,
      },
      entityKind: "arc-track",
      relationship: "connect-endpoints",
    },
    confidence: 0.91,
    id: "pattern.smooth_arc_bridge",
    priority: 88,
    type: "relationship-pattern",
    vectorExamples: ["光滑弯曲过渡段连接两个轨道", "用弧形轨道平滑衔接", "轨道之间通过圆弧过渡"],
    vectorThreshold: 0.72,
  },
  {
    aliases: ["滑轮", "定滑轮", "动滑轮", "滑轮组", "绳子", "细绳"],
    canonical: { unsupported: "pulley" },
    confidence: 0.98,
    id: "unsupported.pulley",
    priority: 120,
    type: "unsupported",
  },
  {
    aliases: ["杠杆", "支点", "力臂"],
    canonical: { unsupported: "lever" },
    confidence: 0.98,
    id: "unsupported.lever",
    priority: 120,
    type: "unsupported",
  },
  {
    aliases: ["浮力", "液体", "水槽", "浸没"],
    canonical: { unsupported: "buoyancy" },
    confidence: 0.98,
    id: "unsupported.buoyancy",
    priority: 120,
    type: "unsupported",
  },
  {
    aliases: ["电路", "电阻", "电源", "电流", "电压"],
    canonical: { unsupported: "electricity" },
    confidence: 0.98,
    id: "unsupported.electricity",
    priority: 120,
    type: "unsupported",
  },
  {
    aliases: ["刚杆", "细杆", "轻杆", "铰链", "转轴"],
    canonical: { unsupported: "rod" },
    confidence: 0.98,
    id: "unsupported.rod",
    priority: 120,
    type: "unsupported",
  },
];

export function createSceneSemanticContext(prompt: string): SceneSemanticContext {
  const normalizedPrompt = normalizePrompt(prompt);
  const promptVector = createLocalEmbeddingVector(normalizedPrompt);
  const matches = SEMANTIC_ENTRIES.flatMap((entry) =>
    matchSemanticEntry(entry, normalizedPrompt, promptVector),
  )
    .sort((left, right) => right.priority - left.priority || right.confidence - left.confidence);

  return {
    embedding: {
      dimensions: LOCAL_EMBEDDING_DIMENSIONS,
      provider: "local-hash-ngram",
      version: 1,
    },
    matches: dedupeMatches(matches),
    version: 1,
  };
}

export function hasSceneSemanticMatch(context: SceneSemanticContext, id: string): boolean {
  return context.matches.some((match) => match.id === id);
}

function matchSemanticEntry(
  entry: SceneSemanticEntry,
  normalizedPrompt: string,
  promptVector: number[],
): SceneSemanticMatch[] {
  const alias = entry.aliases.find((candidate) =>
    normalizedPrompt.includes(normalizePrompt(candidate)),
  );

  if (alias) {
    return [
      {
        canonical: entry.canonical,
        confidence: entry.confidence,
        id: entry.id,
        matchStrategy: "alias",
        matchedAlias: alias,
        priority: entry.priority,
        type: entry.type,
      },
    ];
  }

  const vectorMatch = findBestVectorExampleMatch(entry, promptVector);

  if (!vectorMatch) {
    return [];
  }

  return [vectorMatch];
}

function findBestVectorExampleMatch(
  entry: SceneSemanticEntry,
  promptVector: number[],
): SceneSemanticMatch | null {
  const examples = entry.vectorExamples ?? [];
  let bestExample: string | null = null;
  let bestSimilarity = 0;

  for (const example of examples) {
    const similarity = cosineSimilarity(promptVector, createLocalEmbeddingVector(normalizePrompt(example)));

    if (similarity > bestSimilarity) {
      bestExample = example;
      bestSimilarity = similarity;
    }
  }

  if (!bestExample || bestSimilarity < (entry.vectorThreshold ?? 0.78)) {
    return null;
  }

  return {
    canonical: entry.canonical,
    confidence: roundScore(entry.confidence * bestSimilarity),
    id: entry.id,
    matchStrategy: "vector",
    matchedAlias: bestExample,
    priority: entry.priority,
    similarity: roundScore(bestSimilarity),
    type: entry.type,
  };
}

function dedupeMatches(matches: SceneSemanticMatch[]): SceneSemanticMatch[] {
  const seen = new Set<string>();
  const deduped: SceneSemanticMatch[] = [];

  for (const match of matches) {
    if (seen.has(match.id)) {
      continue;
    }

    seen.add(match.id);
    deduped.push(match);
  }

  return deduped;
}

function normalizePrompt(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function createLocalEmbeddingVector(value: string): number[] {
  const vector = Array.from({ length: LOCAL_EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = createNgramTokens(value);

  for (const token of tokens) {
    const index = hashToken(token) % LOCAL_EMBEDDING_DIMENSIONS;
    vector[index] += 1;
  }

  return normalizeVector(vector);
}

function createNgramTokens(value: string): string[] {
  const normalized = normalizePrompt(value);
  const tokens: string[] = [];

  for (let size = 2; size <= 4; size += 1) {
    if (normalized.length < size) {
      continue;
    }

    for (let index = 0; index <= normalized.length - size; index += 1) {
      tokens.push(normalized.slice(index, index + size));
    }
  }

  return tokens.length > 0 ? tokens : [normalized];
}

function hashToken(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizeVector(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (length <= Number.EPSILON) {
    return vector;
  }

  return vector.map((value) => value / length);
}

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}
