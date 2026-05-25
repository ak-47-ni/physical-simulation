import { validateSceneDraft, type SceneDraft } from "./sceneDraft";

export type SceneDraftFallbackKind =
  | "elastic-collision"
  | "free-fall"
  | "incline-block"
  | "spring-cart";

type CreateSceneDraftFallbackOptions = {
  reason: string;
};

export function createSceneDraftFallbackFromText(
  prompt: string,
  options: CreateSceneDraftFallbackOptions,
): SceneDraft | null {
  const fallbackKind = readSceneDraftFallbackKind(prompt);

  if (!fallbackKind) {
    return null;
  }

  return validateSceneDraft({
    ...createFallbackCandidate(fallbackKind),
    warnings: [`${options.reason}，已使用本地确定性模板生成草稿。`],
  });
}

export function readSceneDraftFallbackKind(prompt: string): SceneDraftFallbackKind | null {
  const normalizedPrompt = prompt.replace(/\s+/g, "");

  if (/自由落体|落体/.test(normalizedPrompt) && /球/.test(normalizedPrompt)) {
    return "free-fall";
  }

  if (/斜面/.test(normalizedPrompt) && /(木块|滑块|物块)/.test(normalizedPrompt)) {
    return "incline-block";
  }

  if (/碰撞/.test(normalizedPrompt) && /(弹性|完全弹性)/.test(normalizedPrompt) && /球/.test(normalizedPrompt)) {
    return "elastic-collision";
  }

  if (/弹簧/.test(normalizedPrompt) && /(小车|滑块|物块)/.test(normalizedPrompt)) {
    return "spring-cart";
  }

  return null;
}

function createFallbackCandidate(kind: SceneDraftFallbackKind): unknown {
  switch (kind) {
    case "free-fall":
      return {
        schemaVersion: 1,
        title: "小球自由落体",
        locale: "zh-CN",
        domain: "mechanics",
        gravity: 9.8,
        entities: [
          {
            center: { x: 2.5, y: 1 },
            initialVelocity: { x: 0, y: 0 },
            kind: "ball",
            mass: 0.2,
            name: "小球",
            radius: 0.12,
          },
        ],
        relationships: [],
        analyzers: [{ kind: "trajectory", entity: "小球" }],
        assumptions: ["忽略空气阻力。"],
        unsupported: [],
      };
    case "incline-block":
      return {
        schemaVersion: 1,
        title: "斜面上木块下滑",
        locale: "zh-CN",
        domain: "mechanics",
        gravity: 9.8,
        entities: [
          {
            angleDegrees: 30,
            friction: 0.2,
            height: 0.14,
            kind: "board",
            length: 4,
            locked: true,
            name: "斜面",
          },
          {
            height: 0.35,
            initialVelocity: { x: 0, y: 0 },
            kind: "block",
            mass: 1,
            name: "木块",
            width: 0.5,
          },
        ],
        relationships: [{ kind: "place-on", entity: "木块", target: "斜面", position: "left" }],
        analyzers: [{ kind: "trajectory", entity: "木块" }],
        assumptions: ["斜面固定，木块从斜面上端静止释放。"],
        unsupported: [],
      };
    case "elastic-collision":
      return {
        schemaVersion: 1,
        title: "两个小球弹性碰撞",
        locale: "zh-CN",
        domain: "mechanics",
        gravity: 9.8,
        entities: [
          {
            friction: 0,
            height: 0.14,
            kind: "board",
            length: 5,
            locked: true,
            name: "水平轨道",
          },
          {
            initialVelocity: { x: 1.5, y: 0 },
            kind: "ball",
            mass: 1,
            name: "小球A",
            radius: 0.15,
            restitution: 1,
          },
          {
            initialVelocity: { x: 0, y: 0 },
            kind: "ball",
            mass: 1,
            name: "小球B",
            radius: 0.15,
            restitution: 1,
          },
        ],
        relationships: [
          { kind: "place-on", entity: "小球A", target: "水平轨道", position: "left" },
          { kind: "place-on", entity: "小球B", target: "水平轨道", position: "center" },
        ],
        analyzers: [
          { kind: "trajectory", entity: "小球A" },
          { kind: "trajectory", entity: "小球B" },
        ],
        assumptions: ["水平轨道光滑，两球质量相等，碰撞为正碰。"],
        unsupported: [],
      };
    case "spring-cart":
      return {
        schemaVersion: 1,
        title: "弹簧连接小车简谐运动",
        locale: "zh-CN",
        domain: "mechanics",
        gravity: 9.8,
        entities: [
          {
            friction: 0,
            height: 0.14,
            kind: "board",
            length: 5,
            locked: true,
            name: "水平光滑轨道",
          },
          {
            height: 0.5,
            kind: "block",
            locked: true,
            mass: 5,
            name: "固定墙",
            width: 0.16,
          },
          {
            height: 0.4,
            initialVelocity: { x: 0, y: 0 },
            kind: "block",
            mass: 1,
            name: "小车",
            width: 0.7,
          },
        ],
        relationships: [
          { kind: "place-on", entity: "固定墙", target: "水平光滑轨道", position: "left" },
          { kind: "place-on", entity: "小车", target: "水平光滑轨道", position: "center" },
          {
            entityA: "固定墙",
            entityB: "小车",
            kind: "spring-between",
            restLength: 1,
            stiffness: 20,
          },
        ],
        analyzers: [{ kind: "trajectory", entity: "小车" }],
        assumptions: ["小车在光滑水平轨道上运动，弹簧质量忽略。"],
        unsupported: [],
      };
  }
}
