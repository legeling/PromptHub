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
});
