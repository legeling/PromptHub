# Proposal

## Problem

PromptHub can connect Git repositories, local directories, marketplace JSON, and skills.sh, but emerging public Skill registries such as ClawHub are not exposed as first-class preconfigured store sources.

## Scope

- Add ClawHub as a built-in read-only Skill Store source.
- Map ClawHub catalog entries into PromptHub `RegistrySkill` records.
- Keep install/update behavior flowing through existing registry install logic.
- Add focused regression tests for parsing and built-in source loading.

## Non-Goals

- ClawHub publish/write support.
- Authenticated ClawHub account integration.
- Full package ZIP download support in this step.

## Risks

- ClawHub response shape can evolve. The parser should accept common list wrappers and optional fields.
- Public community skills need normal PromptHub safety scan and install confirmation flows.
