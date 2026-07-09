# Design

## Source

This is a clean port of the Prompt output-format portion of `jazzson51569/PromptHub` commit `fa7b0e6b`, not a merge of the fork branch.

## Data

Add `prompt_output_format_items`:

- `source_prompt_id`: Prompt whose copy action owns the sequence.
- `target_prompt_id`: target Prompt to append, or `NULL` for the source Prompt itself.
- `sort_order`: display and copy order.
- foreign keys cascade on Prompt deletion.

## Contract

New IPC channels:

- `promptOutputFormat:create`
- `promptOutputFormat:list`
- `promptOutputFormat:update`
- `promptOutputFormat:delete`
- `promptOutputFormat:reorder`

Renderer store keeps `outputFormatItems` alongside `prompts` and `relations`.

## UI

The Prompt detail metadata row gets a compact "Custom Output Format" toggle. The panel lets users:

- add the current Prompt,
- search and add other Prompts,
- drag to reorder,
- remove entries.

## Copy Behavior

If no output format is configured, copy remains the existing single-Prompt flow. If a sequence is configured, PromptHub copies the ordered queue joined by blank lines. Prompts with variables still use the existing variable-fill modal one item at a time before the final clipboard write.
