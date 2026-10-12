import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTableConfig } from '../../../src/renderer/hooks/useTableConfig';

describe('prompt table preferences', () => {
  beforeEach(() => localStorage.removeItem('prompthub-table-config'));

  it('prioritizes the title and user prompt in the default layout', () => {
    const { result } = renderHook(() => useTableConfig());
    expect(result.current.getVisibleColumns().map(column => column.id)).toEqual([
      'checkbox', 'title', 'userPrompt', 'actions',
    ]);
  });

  it('preserves explicit column visibility and width after reopening', () => {
    const first = renderHook(() => useTableConfig());
    act(() => first.result.current.toggleColumnVisibility('aiResponse'));
    act(() => first.result.current.updateColumnWidth('title', 340));
    first.unmount();
    const second = renderHook(() => useTableConfig());
    expect(second.result.current.columns.find(column => column.id === 'aiResponse')?.visible).toBe(true);
    expect(second.result.current.columns.find(column => column.id === 'title')?.width).toBe(340);
    act(() => second.result.current.resetToDefaults());
    expect(second.result.current.getVisibleColumns().map(column => column.id)).toEqual([
      'checkbox', 'title', 'userPrompt', 'actions',
    ]);
  });
});
