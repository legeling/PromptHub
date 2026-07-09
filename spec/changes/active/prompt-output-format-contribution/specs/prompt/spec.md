# Prompt Output Format Spec

## ADDED Requirements

### Requirement: Persistent output format sequences

PromptHub SHALL allow a Prompt to own an ordered list of output format items. Each item SHALL point either to the source Prompt itself or to another Prompt.

#### Scenario: Create and list sequence items

Given a source Prompt and a target Prompt
When an output format item is created for each
Then listing by the source Prompt returns both items in sort order.

### Requirement: Copy uses configured sequence

When a Prompt has output format items
Then copying the Prompt SHALL copy the ordered Prompt bodies joined by blank lines.

### Requirement: Existing copy flow remains compatible

When a Prompt has no output format items
Then copy SHALL use the existing single-Prompt copy behavior.

When a Prompt in the output sequence has variables
Then PromptHub SHALL use the existing variable-fill modal before finalizing the clipboard text.

### Requirement: Prompt deletion cleans sequence rows

When a source or target Prompt is deleted
Then related output format rows SHALL be removed by the database relationship.
