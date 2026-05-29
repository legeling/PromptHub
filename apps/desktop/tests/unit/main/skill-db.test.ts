import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillDB } from "../../../src/main/database/skill";

function createMockDatabase() {
  return {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    }),
  } as any;
}

describe("SkillDB", () => {
  let db: SkillDB;

  beforeEach(() => {
    db = new SkillDB(createMockDatabase());
  });

  it("rejects duplicate skill creation by default", () => {
    vi.spyOn(db, "getByName").mockReturnValue({
      id: "skill-1",
      name: "demo-skill",
    } as any);

    expect(() =>
      db.create({
        name: "demo-skill",
        protocol_type: "skill",
        is_favorite: false,
      } as any),
    ).toThrow("Skill already exists: demo-skill");
  });

  it("allows overwriteExisting creates during managed restore flows", () => {
    const existing = {
      id: "skill-1",
      name: "demo-skill",
    } as any;

    vi.spyOn(db, "getByName").mockReturnValue(existing);
    const updateSpy = vi.spyOn(db, "update").mockReturnValue(existing);

    const restored = db.create(
      {
        name: "demo-skill",
        protocol_type: "skill",
        is_favorite: false,
      } as any,
      { overwriteExisting: true },
    );

    expect(updateSpy).toHaveBeenCalledWith(
      "skill-1",
      expect.objectContaining({ name: "demo-skill" }),
    );
    expect(restored).toBe(existing);
  });

  it("rejects duplicate skill creation by source id even when the name differs", () => {
    vi.spyOn(db, "getBySourceId").mockReturnValue({
      id: "skill-1",
      name: "writer-main",
    } as any);

    expect(() =>
      db.create({
        name: "writer-dev",
        source_id: "source-writer-main",
        protocol_type: "skill",
        is_favorite: false,
      } as any),
    ).toThrow("Skill source already exists: source-writer-main");
  });

  it("uses source id for overwriteExisting creates during managed restore flows", () => {
    const existing = {
      id: "skill-1",
      name: "writer-main",
      source_id: "source-writer-main",
    } as any;

    vi.spyOn(db, "getBySourceId").mockReturnValue(existing);
    const updateSpy = vi.spyOn(db, "update").mockReturnValue(existing);

    const restored = db.create(
      {
        name: "writer-dev",
        source_id: "source-writer-main",
        protocol_type: "skill",
        is_favorite: false,
      } as any,
      { overwriteExisting: true },
    );

    expect(updateSpy).toHaveBeenCalledWith(
      "skill-1",
      expect.objectContaining({
        name: "writer-dev",
        source_id: "source-writer-main",
      }),
    );
    expect(restored).toBe(existing);
  });

  it("rejects renaming a skill to another existing name", () => {
    vi.spyOn(db, "getById").mockReturnValue({
      id: "skill-1",
      name: "alpha-skill",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    } as any);
    vi.spyOn(db, "getByName").mockReturnValue({
      id: "skill-2",
      name: "beta-skill",
    } as any);

    expect(() => db.update("skill-1", { name: "beta-skill" })).toThrow(
      "Skill already exists: beta-skill",
    );
  });

  it("rejects updating a skill to another existing source id", () => {
    vi.spyOn(db, "getById").mockReturnValue({
      id: "skill-1",
      name: "writer-main",
      source_id: "source-writer-main",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    } as any);
    vi.spyOn(db, "getBySourceId").mockReturnValue({
      id: "skill-2",
      name: "writer-dev",
      source_id: "source-writer-dev",
    } as any);

    expect(() =>
      db.update("skill-1", { source_id: "source-writer-dev" }),
    ).toThrow("Skill source already exists: source-writer-dev");
  });

  it("passes source metadata through create and update paths", () => {
    const run = vi.fn();
    const stmt = { get: vi.fn(), all: vi.fn(), run };
    const prepare = vi.fn().mockReturnValue(stmt);
    const concreteDb = new SkillDB({ prepare } as any);

    vi.spyOn(concreteDb, "getByName").mockReturnValue(null);
    vi.spyOn(concreteDb, "getById").mockReturnValue({
      id: "skill-1",
      name: "writer",
      source_id: "source-writer-main",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    } as any);

    const getBySourceIdSpy = vi
      .spyOn(concreteDb, "getBySourceId")
      .mockReturnValue(null);

    vi.spyOn(concreteDb, "getById").mockReturnValueOnce({
      id: "skill-created",
      name: "writer",
      protocol_type: "skill",
      is_favorite: false,
      created_at: 1,
      updated_at: 1,
    } as any);

    concreteDb.create({
      name: "writer",
      protocol_type: "skill",
      is_favorite: false,
      source_id: "source-writer-main",
      source_label: "openai/skills",
      source_branch: "main",
      source_directory: "skills/.curated/writer",
      canonical_skill_path: "skills/.curated/writer/SKILL.md",
    } as any);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        "@source_label": "openai/skills",
        "@source_branch": "main",
        "@source_directory": "skills/.curated/writer",
        "@canonical_skill_path": "skills/.curated/writer/SKILL.md",
      }),
    );

    getBySourceIdSpy.mockReturnValue(null);
    concreteDb.update("skill-1", {
      source_label: "openai/skills",
      source_branch: "dev",
      source_directory: "skills/.curated/writer",
      canonical_skill_path: "skills/.curated/writer/SKILL.md",
    });

    expect(run.mock.calls.at(-1)?.slice(1)).toEqual(
      expect.arrayContaining([
        "openai/skills",
        "dev",
        "skills/.curated/writer",
        "skills/.curated/writer/SKILL.md",
        "skill-1",
      ]),
    );
  });
});
