import type { SceneDraftEndpoint } from "./sceneDraft";
import type { SceneSemanticContext, SceneSemanticMatch } from "./sceneSemanticKb";

export type SupportedSceneObjectKind = "arc-track" | "ball" | "block" | "board";
export type SupportedSceneRelationshipKind =
  | "connect-endpoints"
  | "contact-spring-end"
  | "place-on"
  | "spring-between";

export type SceneIntentObjectRole =
  | "arc-bridge"
  | "moving-body"
  | "spring-anchor"
  | "support-ground"
  | "support-incline";

export type SceneIntentObject = {
  confidence: number;
  id: string;
  kind: SupportedSceneObjectKind;
  label: string;
  parameters?: {
    angleDegrees?: number;
    friction?: number;
    heightMeters?: number;
    initialVelocity?: { x: number; y: number };
    lengthMeters?: number;
    locked?: boolean;
    massKg?: number;
    radiusMeters?: number;
  };
  role?: SceneIntentObjectRole;
  sourceMatchIds: string[];
};

export type SceneIntentRelationship = {
  a?: string;
  b?: string;
  confidence: number;
  id: string;
  kind: SupportedSceneRelationshipKind;
  parameters?: {
    position?: "center" | "left" | "right";
    restLengthMeters?: number;
    stiffness?: number;
  };
  sourceEndpoint?: SceneDraftEndpoint;
  sourceMatchIds: string[];
  target?: string;
  targetEndpoint?: SceneDraftEndpoint;
};

export type SceneIntent = {
  assumptions: string[];
  objects: SceneIntentObject[];
  relationships: SceneIntentRelationship[];
  title: string;
  unsupported: string[];
  warnings: string[];
};

export type ExtractSceneIntentInput = {
  prompt: string;
  semanticContext: SceneSemanticContext;
};

const UNSUPPORTED_LABELS: Record<string, string> = {
  buoyancy: "浮力/液体场景",
  electricity: "电路/电学元件",
  lever: "杠杆",
  pulley: "滑轮/绳子",
  rod: "杆/铰链",
};

export function extractSceneIntent(input: ExtractSceneIntentInput): SceneIntent {
  const prompt = input.prompt.replace(/\s+/g, "");
  const matchIds = input.semanticContext.matches.map((match) => match.id);
  const sourceMatchIds = (ids: string[]) => ids.filter((id) => matchIds.includes(id));
  const objects: SceneIntentObject[] = [];
  const relationships: SceneIntentRelationship[] = [];
  const unsupported = readUnsupportedConcepts(input.semanticContext.matches);
  const warnings = unsupported.map(
    (concept) => `当前项目尚不支持：${UNSUPPORTED_LABELS[concept] ?? concept}，不会生成对应对象。`,
  );

  const hasBall = hasMatch(input.semanticContext, "entity.ball");
  const hasBlock = hasMatch(input.semanticContext, "entity.block");
  const hasGround = hasMatch(input.semanticContext, "support.ground");
  const hasIncline = hasMatch(input.semanticContext, "support.incline");
  const hasSmooth = hasMatch(input.semanticContext, "property.smooth");
  const hasArcBridge = hasMatch(input.semanticContext, "pattern.smooth_arc_bridge");
  const hasSpringBetween = hasMatch(input.semanticContext, "relationship.spring_between");
  const hasFixedSpringEnd = hasMatch(input.semanticContext, "relationship.fixed_spring_end");

  if (hasBlock) {
    const blockCount = readMentionedCount(prompt, ["木块", "物块", "滑块", "小车", "方块"]);

    for (let index = 1; index <= blockCount; index += 1) {
      objects.push({
        confidence: readMatchConfidence(input.semanticContext, "entity.block"),
        id: `block-${index}`,
        kind: "block",
        label: readBlockLabel(prompt, blockCount, index),
        parameters: {
          friction: hasSmooth ? 0 : undefined,
          initialVelocity: prompt.includes("由静止释放") ? { x: 0, y: 0 } : undefined,
          massKg: readMassKg(prompt),
        },
        role: "moving-body",
        sourceMatchIds: sourceMatchIds(["entity.block", "property.smooth"]),
      });
    }
  }

  if (hasBall) {
    const ballCount = readMentionedCount(prompt, ["小球", "圆球", "球体", "钢球", "球"]);

    for (let index = 1; index <= ballCount; index += 1) {
      objects.push({
        confidence: readMatchConfidence(input.semanticContext, "entity.ball"),
        id: `ball-${index}`,
        kind: "ball",
        label: ballCount > 1 ? `小球${readChineseLetter(index)}` : "小球",
        parameters: {
          initialVelocity: prompt.includes("由静止释放") ? { x: 0, y: 0 } : undefined,
          massKg: readMassKg(prompt),
          radiusMeters: readRadiusMeters(prompt),
        },
        role: "moving-body",
        sourceMatchIds: sourceMatchIds(["entity.ball"]),
      });
    }
  }

  if (hasIncline || hasArcBridge) {
    objects.push({
      confidence: readMatchConfidence(input.semanticContext, "support.incline") || 0.9,
      id: "incline-1",
      kind: "board",
      label: "斜面",
      parameters: {
        angleDegrees: readAngleDegrees(prompt) ?? 30,
        locked: true,
      },
      role: "support-incline",
      sourceMatchIds: sourceMatchIds(["support.incline"]),
    });
  }

  if (hasGround || hasArcBridge || hasSpringBetween || hasFixedSpringEnd) {
    objects.push({
      confidence: readMatchConfidence(input.semanticContext, "support.ground") || 0.9,
      id: "ground-1",
      kind: "board",
      label: "水平面",
      parameters: {
        angleDegrees: 0,
        friction: hasSmooth ? 0 : undefined,
        locked: true,
      },
      role: "support-ground",
      sourceMatchIds: sourceMatchIds(["support.ground", "property.smooth"]),
    });
  }

  if (hasFixedSpringEnd && objects.some((object) => object.role === "moving-body")) {
    objects.push({
      confidence: readMatchConfidence(input.semanticContext, "relationship.fixed_spring_end"),
      id: "spring-anchor-1",
      kind: "block",
      label: "固定端",
      parameters: {
        locked: true,
        massKg: 5,
      },
      role: "spring-anchor",
      sourceMatchIds: sourceMatchIds(["relationship.fixed_spring_end"]),
    });
  }

  if (hasArcBridge) {
    objects.push({
      confidence: readMatchConfidence(input.semanticContext, "pattern.smooth_arc_bridge"),
      id: "arc-bridge-1",
      kind: "arc-track",
      label: "平滑圆弧轨道",
      parameters: {
        friction: 0,
      },
      role: "arc-bridge",
      sourceMatchIds: sourceMatchIds(["pattern.smooth_arc_bridge"]),
    });
  }

  const movingBodies = objects.filter((object) => object.role === "moving-body");
  const supportTarget = hasIncline ? "incline-1" : hasGround ? "ground-1" : null;

  if (supportTarget) {
    movingBodies.forEach((body, index) => {
      relationships.push({
        a: body.id,
        confidence: 0.88,
        id: `place-on-${index + 1}`,
        kind: "place-on",
        parameters: {
          position: index === 0 ? "left" : "center",
        },
        sourceMatchIds: sourceMatchIds(["relationship.place_on", hasIncline ? "support.incline" : "support.ground"]),
        target: supportTarget,
      });
    });
  }

  if (hasSpringBetween && movingBodies.length >= 2) {
    relationships.push({
      a: movingBodies[0].id,
      b: movingBodies[1].id,
      confidence: readMatchConfidence(input.semanticContext, "relationship.spring_between"),
      id: "spring-between-1",
      kind: "spring-between",
      parameters: {
        restLengthMeters: readSpringRestLengthMeters(prompt),
        stiffness: readSpringStiffness(prompt),
      },
      sourceMatchIds: sourceMatchIds(["relationship.spring_between", "template.spring_cart"]),
    });
  }

  if (hasFixedSpringEnd && movingBodies.length >= 1) {
    relationships.push({
      a: "spring-anchor-1",
      b: movingBodies[0].id,
      confidence: readMatchConfidence(input.semanticContext, "relationship.fixed_spring_end"),
      id: "contact-spring-end-1",
      kind: "contact-spring-end",
      parameters: {
        restLengthMeters: readSpringRestLengthMeters(prompt),
        stiffness: readSpringStiffness(prompt),
      },
      sourceMatchIds: sourceMatchIds(["relationship.fixed_spring_end", "template.spring_cart"]),
    });
  }

  if (hasArcBridge) {
    relationships.push({
      a: "incline-1",
      b: "ground-1",
      confidence: readMatchConfidence(input.semanticContext, "pattern.smooth_arc_bridge"),
      id: "connect-endpoints-1",
      kind: "connect-endpoints",
      sourceEndpoint: "end",
      sourceMatchIds: sourceMatchIds(["pattern.smooth_arc_bridge"]),
      targetEndpoint: "start",
    });
  }

  return {
    assumptions: readAssumptions({ hasArcBridge, hasFixedSpringEnd, hasGround, hasIncline, hasSmooth }),
    objects,
    relationships,
    title: readIntentTitle(prompt, objects, relationships),
    unsupported,
    warnings,
  };
}

function hasMatch(context: SceneSemanticContext, id: string): boolean {
  return context.matches.some((match) => match.id === id);
}

function readMatchConfidence(context: SceneSemanticContext, id: string): number {
  return context.matches.find((match) => match.id === id)?.confidence ?? 0.85;
}

function readUnsupportedConcepts(matches: SceneSemanticMatch[]): string[] {
  return matches
    .filter((match) => match.type === "unsupported")
    .map((match) => match.canonical.unsupported)
    .filter((value): value is string => typeof value === "string");
}

function readMentionedCount(prompt: string, nouns: string[]): number {
  if (/(两个|两块|两辆|两颗|2个|2块|2辆|2颗)/.test(prompt)) {
    return 2;
  }

  return nouns.some((noun) => prompt.includes(noun)) ? 1 : 0;
}

function readBlockLabel(prompt: string, count: number, index: number): string {
  if (count > 1) {
    return `木块${readChineseLetter(index)}`;
  }

  return prompt.includes("小车") ? "小车" : "木块";
}

function readChineseLetter(index: number): string {
  return index === 1 ? "A" : index === 2 ? "B" : `${index}`;
}

function readAngleDegrees(prompt: string): number | undefined {
  return readFirstNumber(prompt, /([0-9]+(?:\.[0-9]+)?)\s*度/);
}

function readMassKg(prompt: string): number | undefined {
  return readFirstNumber(prompt, /([0-9]+(?:\.[0-9]+)?)\s*(?:kg|千克)/i);
}

function readRadiusMeters(prompt: string): number | undefined {
  return readFirstNumber(prompt, /半径\s*([0-9]+(?:\.[0-9]+)?)\s*(?:m|米)/i);
}

function readSpringRestLengthMeters(prompt: string): number | undefined {
  return readFirstNumber(prompt, /(?:原长|自然长度)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:m|米)/i);
}

function readSpringStiffness(prompt: string): number | undefined {
  return readFirstNumber(prompt, /(?:劲度系数|弹簧系数)\s*([0-9]+(?:\.[0-9]+)?)/);
}

function readFirstNumber(prompt: string, pattern: RegExp): number | undefined {
  const match = prompt.match(pattern);

  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);

  return Number.isFinite(value) ? value : undefined;
}

function readAssumptions(input: {
  hasArcBridge: boolean;
  hasFixedSpringEnd: boolean;
  hasGround: boolean;
  hasIncline: boolean;
  hasSmooth: boolean;
}): string[] {
  const assumptions: string[] = [];

  if (input.hasSmooth) {
    assumptions.push("题干描述为光滑接触面，摩擦按 0 处理。");
  }

  if (input.hasIncline) {
    assumptions.push("斜面固定，作为当前项目支持的 board 对象处理。");
  }

  if (input.hasGround) {
    assumptions.push("水平面固定，作为当前项目支持的 board 对象处理。");
  }

  if (input.hasArcBridge) {
    assumptions.push("平滑过渡段使用当前项目支持的 arc-track 对象表示。");
  }

  if (input.hasFixedSpringEnd) {
    assumptions.push("弹簧固定端使用锁定的物块表示，不生成未支持的锚点对象。");
  }

  return assumptions;
}

function readIntentTitle(
  prompt: string,
  objects: SceneIntentObject[],
  relationships: SceneIntentRelationship[],
): string {
  if (relationships.some((relationship) => relationship.kind === "connect-endpoints")) {
    return "斜面与水平面的平滑圆弧连接";
  }

  if (relationships.some((relationship) => relationship.kind === "spring-between" || relationship.kind === "contact-spring-end")) {
    return "弹簧连接场景";
  }

  if (objects.some((object) => object.kind === "block")) {
    return "木块运动场景";
  }

  if (objects.some((object) => object.kind === "ball")) {
    return "小球运动场景";
  }

  return prompt.trim() || "受限物理场景";
}
