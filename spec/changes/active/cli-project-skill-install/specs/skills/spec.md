# Skills Spec Delta

## Added Requirements

### Requirement: CLI installs My Skills into the current project

PromptHub CLI MUST allow a developer to install an existing My Skills entry into a project directory without first registering that directory through the desktop project Skills UI.

#### Scenario: install selected Skill into current working directory

- Given PromptHub has at least one installed Skill in My Skills
- And the developer is inside a project directory
- When they run the project Skill install command without a project path
- Then PromptHub uses the current working directory as the project root
- And writes the full Skill package to `<project>/.agents/skills/<skill-name>/`

#### Scenario: select Skill interactively

- Given PromptHub has multiple installed Skills
- When the developer runs the project Skill install command without a Skill identifier in an interactive terminal
- Then PromptHub lists installed Skills with numbered choices
- And installs the selected Skill after the developer enters a valid number
- And writes the final machine-readable result to stdout.

#### Scenario: fuzzy Skill identifier

- Given PromptHub has installed Skills whose names contain a query
- When the developer passes a query instead of an exact Skill name
- Then PromptHub selects the only matching Skill
- And if multiple Skills match in a non-interactive invocation, it rejects the command with candidate details.

#### Scenario: preserve existing project Skill by default

- Given `<project>/.agents/skills/<skill-name>/` already exists
- When the developer installs the same Skill without force
- Then PromptHub leaves the existing project Skill untouched
- And reports the operation as skipped.

#### Scenario: force refresh project Skill

- Given `<project>/.agents/skills/<skill-name>/` already exists
- When the developer installs the same Skill with force
- Then PromptHub replaces the target directory with the current My Skills package.
