import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagManagerModal } from '../../../src/renderer/components/prompt/TagManagerModal';
import { useSettingsStore } from '../../../src/renderer/stores/settings.store';
import { useSkillStore } from '../../../src/renderer/stores/skill.store';
import { usePromptStore } from '../../../src/renderer/stores/prompt.store';
import { renderWithI18n } from '../../helpers/i18n';
import { installWindowMocks } from '../../helpers/window';

const showToastMock = vi.fn();

vi.mock('../../../src/renderer/components/ui/Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe('TagManagerModal', () => {
  beforeEach(() => {
    installWindowMocks();
    showToastMock.mockReset();
    useSettingsStore.setState({
      promptTagCatalog: [],
      tagFilterMode: 'multi',
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    usePromptStore.setState({
      filterTags: [],
    } as Partial<ReturnType<typeof usePromptStore.getState>>);
  });

  it('loads prompt tags when opened in prompt mode', async () => {
    const getAllTags = vi.fn().mockResolvedValue(['alpha', 'beta']);

    installWindowMocks({
      api: {
        prompt: {
          getAllTags,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <TagManagerModal isOpen onClose={vi.fn()} resourceType="prompt" />,
        { language: 'en' },
      );
    });

    await waitFor(() => {
      expect(getAllTags).toHaveBeenCalled();
      expect(screen.getByText('alpha')).toBeInTheDocument();
      expect(screen.getByText('beta')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('textbox', { name: 'Filter by tag' }),
    ).toHaveValue('');
  });

  it('manages only user skill tags and renames matching skills', async () => {
    const updateSkillMock = vi.fn(async (id: string, data: { tags?: string[] }) => {
      useSkillStore.setState((state) => ({
        skills: state.skills.map((skill) =>
          skill.id === id
            ? {
                ...skill,
                tags: data.tags ?? skill.tags,
              }
            : skill,
        ),
      }));

      return useSkillStore.getState().skills.find((skill) => skill.id === id) ?? null;
    });

    useSkillStore.setState({
      skills: [
        {
          id: 'skill-1',
          name: 'first-skill',
          protocol_type: 'skill',
          tags: ['git', 'writing'],
          original_tags: [],
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
        {
          id: 'skill-2',
          name: 'second-skill',
          protocol_type: 'skill',
          tags: ['git'],
          original_tags: [],
          is_favorite: false,
          created_at: 2,
          updated_at: 2,
        },
        {
          id: 'skill-3',
          name: 'registry-skill',
          protocol_type: 'skill',
          tags: ['official'],
          original_tags: ['official'],
          registry_slug: 'official-skill',
          is_favorite: false,
          created_at: 3,
          updated_at: 3,
        },
      ],
      updateSkill: updateSkillMock,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TagManagerModal isOpen onClose={vi.fn()} resourceType="skill" />,
        { language: 'en' },
      );
    });

    expect(screen.getByText('git')).toBeInTheDocument();
    expect(screen.getByText('writing')).toBeInTheDocument();
    expect(screen.queryByText('official')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Edit git'));

    const input = screen.getByRole('textbox', { name: 'Edit git' });
    fireEvent.change(input, { target: { value: 'engineering' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(updateSkillMock).toHaveBeenCalledTimes(2);
    });

    expect(updateSkillMock).toHaveBeenNthCalledWith(1, 'skill-1', {
      tags: ['engineering', 'writing'],
    });
    expect(updateSkillMock).toHaveBeenNthCalledWith(2, 'skill-2', {
      tags: ['engineering'],
    });

    await waitFor(() => {
      expect(screen.getByText('engineering')).toBeInTheDocument();
    });
  });

  it('creates a new prompt tag through the manager', async () => {
    const getAllTags = vi.fn().mockResolvedValue(['alpha']);

    installWindowMocks({
      api: {
        prompt: {
          getAllTags,
        },
        settings: {
          set: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <TagManagerModal isOpen onClose={vi.fn()} resourceType="prompt" />,
        { language: 'en' },
      );
    });

    await waitFor(() => {
      expect(screen.getByText('alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Enter new tag and press Enter' }), {
      target: { value: 'beta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(useSettingsStore.getState().promptTagCatalog).toContain('beta');
      expect(screen.getByText('beta')).toBeInTheDocument();
    });
  });

  it('updates tag click mode from the prompt manager', async () => {
    installWindowMocks({
      api: {
        prompt: {
          getAllTags: vi.fn().mockResolvedValue(['alpha']),
        },
        settings: {
          set: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue({}),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <TagManagerModal isOpen onClose={vi.fn()} resourceType="prompt" />,
        { language: 'en' },
      );
    });

    const modeSelect = screen.getByRole('button', { name: 'Tag click mode' });
    fireEvent.click(modeSelect);

    expect(screen.getByRole('listbox', { name: 'Tag click mode' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Single select' }));

    expect(useSettingsStore.getState().tagFilterMode).toBe('single');
  });
});
